import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineParameter } from '@shared/engine-protocol';
import { ChoiceButton, Knob } from './native-controls';

interface ZynPanelProps {
  params: EngineParameter[];
  program: number;
  programNames: string[];
  onChange: (name: string, value: number) => void | Promise<void>;
  onProgram: (index: number) => void | Promise<void>;
  onImport: () => void | Promise<void>;
  importBusy?: boolean;
  importMessage?: string | null;
}

interface Bank {
  label: string;
  entries: Array<{ index: number; name: string }>;
}

const splitBanks = (names: string[]): Bank[] => {
  const banks: Bank[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const full = names[index] ?? '';
    const separator = full.indexOf(' · ');
    const label = separator > 0 ? full.slice(0, separator) : 'Presets';
    const name = separator >= 0 ? full.slice(separator + 3) : full;
    const last = banks[banks.length - 1];
    if (!last || last.label !== label) {
      banks.push({ label, entries: [{ index, name }] });
    } else {
      last.entries.push({ index, name });
    }
  }
  if (banks.length === 0) banks.push({ label: 'Presets', entries: [] });
  return banks;
};

const bankIndexOf = (banks: Bank[], program: number): number => {
  const found = banks.findIndex((bank) =>
    bank.entries.some((entry) => entry.index === program)
  );
  return found >= 0 ? found : 0;
};

/** Busca sem diferenciar maiúsculas nem acentos. */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const displayOf = (param: EngineParameter): string => {
  if (param.text && param.text.trim().length > 0) return param.text.trim();
  return `${Math.round(param.value * 100)}%`;
};

const ZynKnob: React.FC<{
  param: EngineParameter;
  onChange: (name: string, value: number) => void | Promise<void>;
  format?: (param: EngineParameter) => string;
}> = ({ param, onChange, format }) => (
  <Knob
    label={param.name}
    value={param.value}
    display={format ? format(param) : displayOf(param)}
    onChange={(value) => void onChange(param.name, value)}
    onReset={() => void onChange(param.name, param.defaultValue)}
    step={param.stepCount > 0 ? 1 / param.stepCount : 0.01}
  />
);

const EngineSelect: React.FC<{
  name: string;
  label: string;
  param: (name: string) => EngineParameter | undefined;
  onChange: (name: string, value: number) => void | Promise<void>;
}> = ({ name, label, param, onChange }) => {
  const item = param(name);
  if (!item) return null;
  const parsed = Number(item.text);
  const current = Number.isFinite(parsed) ? parsed : Math.round(item.value * 2) - 1;
  return (
    <label className="text-[10px]" style={{ color: '#9A9AA0' }}>
      {label}
      <select
        aria-label={label}
        className="hw-inset mt-1 w-full px-2 py-1 text-[11px] text-white"
        value={String(current)}
        onChange={(event) => void onChange(name, (Number(event.target.value) + 1) / 2)}
      >
        <option value="-1">Preset</option>
        <option value="0">Desligado</option>
        <option value="1">Ligado</option>
      </select>
    </label>
  );
};

/** Painel do Preseter Zyn: presets, parte e efeitos. */
const FX_TYPES: Array<[string, string]> = [
  ['-1', 'Preset'],
  ['0', 'Desligado'],
  ['1', 'Reverb'],
  ['2', 'Echo'],
  ['3', 'Chorus'],
  ['4', 'Phaser'],
  ['5', 'Alienwah'],
  ['6', 'Distortion'],
  ['7', 'EQ'],
  ['8', 'DynFilter'],
  ['9', 'Sympathetic'],
  ['10', 'Reverse'],
];

const FxRow: React.FC<{
  index: number;
  param: (name: string) => EngineParameter | undefined;
  onChange: (name: string, value: number) => void | Promise<void>;
}> = ({ index, param, onChange }) => {
  const type = param(`FX${index} Type`);
  if (!type) return null;
  const parsed = Number(type.text);
  const current = Number.isFinite(parsed) ? parsed : Math.round(type.value * 11) - 1;

  return (
    <div className="space-y-2 rounded p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <label className="block text-[10px]" style={{ color: '#9A9AA0' }}>
        FX{index}
        <select
          aria-label={`FX${index} tipo`}
          className="hw-inset mt-1 w-full px-2 py-1 text-[11px] text-white"
          value={String(current)}
          onChange={(event) => void onChange(
            `FX${index} Type`,
            (Number(event.target.value) + 1) / 11
          )}
        >
          {FX_TYPES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {[1, 2, 3].map((p) => {
          const item = param(`FX${index} P${p}`);
          return item ? <ZynKnob key={p} param={item} onChange={onChange} /> : null;
        })}
      </div>
    </div>
  );
};

export const ZynPanel: React.FC<ZynPanelProps> = ({
  params,
  program,
  programNames,
  onChange,
  onProgram,
  onImport,
  importBusy = false,
  importMessage = null,
}) => {
  const banks = useMemo(() => splitBanks(programNames), [programNames]);
  const param = (name: string) => params.find((item) => item.name === name);

  // O banco é estado da tela: escolher um banco só filtra a lista; o preset
  // atual continua soando até o usuário escolher um programa. Assim uma
  // atualização do plugin (ou uma troca lenta) não volta a lista para o banco
  // antigo.
  const [selectedBank, setSelectedBank] = useState(() => bankIndexOf(banks, program));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingProgram, setPendingProgram] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  /** Só a primeira chegada dos nomes alinha o banco ao programa atual. */
  const bankInitialized = useRef(programNames.length > 0);

  useEffect(() => {
    if (!bankInitialized.current && programNames.length > 0) {
      bankInitialized.current = true;
      setSelectedBank(bankIndexOf(banks, program));
    }
  }, [banks, programNames.length, program]);

  useEffect(() => {
    if (selectedBank >= banks.length)
      setSelectedBank(Math.max(0, banks.length - 1));
  }, [banks.length, selectedBank]);

  const bankIndex = Math.min(selectedBank, Math.max(0, banks.length - 1));
  const bank = banks[bankIndex] ?? banks[0];
  const currentEntry = bank.entries.find((entry) => entry.index === program);

  const visibleEntries = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return bank.entries;
    return bank.entries.filter((entry) => normalize(entry.name).includes(query));
  }, [bank, search]);

  const chooseBank = (index: number) => {
    bankInitialized.current = true;
    setSelectedBank(index);
    setSearch('');
  };

  /**
   * Fila de 1: se o usuário escolher outro programa enquanto o atual carrega,
   * guarda só o último. A troca em andamento termina antes de a próxima sair.
   */
  const runProgramChange = async (first: number) => {
    if (loadingRef.current) {
      queuedRef.current = first;
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    let next: number | null = first;
    try {
      while (next !== null) {
        queuedRef.current = null;
        setPendingProgram(next);
        await onProgram(next);
        next = queuedRef.current;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setPendingProgram(null);
    }
  };

  const changeProgram = (index: number) => {
    if (index < 0) return;
    void runProgramChange(index).catch(() => undefined);
  };

  const selectedProgram = loading && pendingProgram !== null
    ? pendingProgram
    : currentEntry?.index ?? -1;

  return (
    <div className="space-y-3">
      <section className="hw-inset p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Banco
            <select
              aria-label="Banco do Zyn"
              className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-white"
              value={bankIndex}
              onChange={(event) => chooseBank(Number(event.target.value))}
            >
              {banks.map((item, index) => (
                <option key={`${item.label}-${index}`} value={index}>
                  {item.label} ({item.entries.length})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-[2] text-[10px]" style={{ color: '#9A9AA0' }}>
            Programa
            <select
              aria-label="Programa do Zyn"
              aria-busy={loading}
              className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-white"
              value={selectedProgram}
              onChange={(event) => changeProgram(Number(event.target.value))}
            >
              {!currentEntry && !(loading && pendingProgram !== null) && (
                <option value={-1}>Escolha um programa…</option>
              )}
              {visibleEntries.map((entry) => (
                <option key={`${entry.index}-${entry.name}`} value={entry.index}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            disabled={importBusy}
            onClick={() => void onImport()}
          >
            {importBusy ? 'Importando…' : 'Importar preset .xiz…'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Buscar programa do Zyn"
            placeholder="Buscar programa…"
            className="hw-inset min-w-0 flex-1 px-2 py-1 text-[10px] text-white"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="text-[10px]" style={{ color: '#8E8E93' }}>
            {search.trim()
              ? `${visibleEntries.length} de ${bank.entries.length} programas`
              : `${bank.entries.length} programas`}
          </span>
          {loading && (
            <span className="text-[10px] font-semibold" style={{ color: '#FFB74D' }} aria-live="polite">
              Carregando…
            </span>
          )}
        </div>

        {importMessage && (
          <p className="mt-2 text-[10px]" style={{ color: importMessage.startsWith('Erro') ? '#FF8A80' : '#7BE38F' }}>
            {importMessage}
          </p>
        )}
      </section>

      <details className="hw-inset p-3" open>
        <summary className="hw-label cursor-pointer select-none">Parte</summary>
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
          {['Volume', 'Pan', 'Voices', 'Key Shift', 'Vel Sensitivity', 'Vel Offset',
            'Key Limit', 'Min Key', 'Max Key', 'Portamento Time'].map((name) => {
            const item = param(name);
            return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            ['Mono', 'Mono'],
            ['Legato', 'Legato'],
            ['Portamento', 'Portamento'],
          ].map(([name, label]) => {
            const item = param(name);
            if (!item) return null;
            const active = item.value >= 0.5;
            return (
              <ChoiceButton
                key={name}
                active={active}
                onClick={() => void onChange(name, active ? 0 : 1)}
              >
                {label}
              </ChoiceButton>
            );
          })}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          Legato atua no modo Mono.
        </p>
      </details>

      <details className="hw-inset p-3" open>
        <summary className="hw-label cursor-pointer select-none">Controladores</summary>
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
          {['Bend Range', 'Mod Wheel Depth', 'Filter Cutoff Depth', 'Filter Q Depth'].map((name) => {
            const item = param(name);
            if (!item) return null;
            return (
              <ZynKnob
                key={name}
                param={item}
                onChange={onChange}
                format={name === 'Bend Range'
                  ? (parameter) => `${parameter.text?.trim() || '0'} st`
                  : undefined}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            ['Expression Receive', 'Expressão (CC11)'],
            ['Sustain Receive', 'Sustain (CC64)'],
          ].map(([name, label]) => {
            const item = param(name);
            if (!item) return null;
            const active = item.value >= 0.5;
            return (
              <ChoiceButton
                key={name}
                active={active}
                onClick={() => void onChange(name, active ? 0 : 1)}
              >
                {label}
              </ChoiceButton>
            );
          })}
        </div>

        <details className="mt-3 rounded p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <summary className="cursor-pointer text-[10px] font-semibold" style={{ color: '#C6C6CB' }}>
            Avançados
          </summary>
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
            {['Bend Range Down', 'Portamento Prop Rate', 'Portamento Prop Depth',
              'Portamento Pitch Thresh', 'Panning Depth', 'Bandwidth Depth',
              'Resonance Center Depth', 'Resonance Bandwidth Depth'].map((name) => {
              const item = param(name);
              return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              ['Split Bend', 'Bend separado'],
              ['Portamento Proportional', 'Port. proporcional'],
              ['Volume Receive', 'Volume (CC7)'],
              ['FM Amp Receive', 'FM Amp'],
            ].map(([name, label]) => {
              const item = param(name);
              if (!item) return null;
              const active = item.value >= 0.5;
              return (
                <ChoiceButton
                  key={name}
                  active={active}
                  onClick={() => void onChange(name, active ? 0 : 1)}
                >
                  {label}
                </ChoiceButton>
              );
            })}
          </div>
        </details>
      </details>

      <details className="hw-inset p-3" open>
        <summary className="hw-label cursor-pointer select-none">Som</summary>
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
          {['Cutoff', 'Resonance'].map((name) => {
            const item = param(name);
            return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
          })}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          Offset ao vivo do filtro; a profundidade fica nos Controladores. ADSR, LFO, detune e
          largura ainda exigem recarregar o preset.
        </p>
      </details>

      <details className="hw-inset p-3">
        <summary className="hw-label cursor-pointer select-none">Envelopes</summary>
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
          {['Amp Attack', 'Amp Decay', 'Amp Sustain', 'Amp Release',
            'Filter Attack', 'Filter Decay', 'Filter Sustain', 'Filter Release'].map((name) => {
            const item = param(name);
            return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
          })}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          Escalas/offset sobre o preset; valem para notas novas nos envelopes globais. Vozes
          individuais ficam a confirmar.
        </p>
      </details>

      <details className="hw-inset p-3">
        <summary className="hw-label cursor-pointer select-none">Motores</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <EngineSelect name="AD Engine" label="ADsynth" param={param} onChange={onChange} />
          <EngineSelect name="SUB Engine" label="SUBsynth" param={param} onChange={onChange} />
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-4">
          {['AD Volume', 'SUB Volume', 'PAD Volume'].map((name) => {
            const item = param(name);
            return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
          })}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          “Preset” mantém o que veio no .xiz. Os volumes são offset sobre o preset. PAD on/off
          ainda exige recarregar.
        </p>
      </details>

      <details className="hw-inset p-3">
        <summary className="hw-label cursor-pointer select-none">Modo e efeitos</summary>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['FX1 Bypass', 'FX2 Bypass', 'FX3 Bypass'].map((name) => {
            const item = param(name);
            if (!item) return null;
            const active = item.value >= 0.5;
            return (
              <ChoiceButton
                key={name}
                active={active}
                onClick={() => void onChange(name, active ? 0 : 1)}
              >
                {name}
              </ChoiceButton>
            );
          })}
        </div>
      </details>

      <details className="hw-inset p-3">
        <summary className="hw-label cursor-pointer select-none">FX internos</summary>
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((index) => (
            <FxRow key={index} index={index} param={param} onChange={onChange} />
          ))}
        </div>
        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          P1–P3 são os três primeiros parâmetros do tipo escolhido; o significado muda com o
          efeito. O bypass fica em “Modo e efeitos”.
        </p>
      </details>

      <p className="px-1 text-[9px] leading-relaxed" style={{ color: '#6E6E73' }}>
        Motor: ZynAddSubFX 3.0.7 · Nasca Octavian Paul (GPL-2.0-or-later). Efeitos de inserção
        do próprio instrumento; os efeitos do Preseter continuam disponíveis no strip.
      </p>
    </div>
  );
};
