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
}> = ({ param, onChange }) => (
  <Knob
    label={param.name}
    value={param.value}
    display={displayOf(param)}
    onChange={(value) => void onChange(param.name, value)}
    onReset={() => void onChange(param.name, param.defaultValue)}
    step={param.stepCount > 0 ? 1 / param.stepCount : 0.01}
  />
);

/** Painel do Preseter Zyn: presets, parte e efeitos. */
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

      <section className="hw-inset p-3">
        <div className="hw-label mb-3">Parte</div>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
          {['Volume', 'Pan', 'Voices', 'Key Shift'].map((name) => {
            const item = param(name);
            return item ? <ZynKnob key={name} param={item} onChange={onChange} /> : null;
          })}
        </div>
      </section>

      <section className="hw-inset p-3">
        <div className="hw-label mb-2">Modo e efeitos</div>
        <div className="flex flex-wrap gap-1.5">
          {['Mono', 'FX1 Bypass', 'FX2 Bypass', 'FX3 Bypass'].map((name) => {
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
      </section>

      <p className="px-1 text-[9px] leading-relaxed" style={{ color: '#6E6E73' }}>
        Motor: ZynAddSubFX 3.0.7 · Nasca Octavian Paul (GPL-2.0-or-later). Efeitos de inserção
        do próprio instrumento; os efeitos do Preseter continuam disponíveis no strip.
      </p>
    </div>
  );
};
