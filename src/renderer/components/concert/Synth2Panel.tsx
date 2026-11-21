import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConcertMapping,
  MidiBinding,
  PresetPluginAssignment,
  VstPreset,
} from '@shared/types';
import type { EngineParameter as EngineParam } from '@shared/engine-protocol';
import { useAppContext } from '../../context/AppContext';
import { ChoiceButton, Knob, NumberField } from './native-controls';
import { SYNTH2_SECTIONS, type Synth2Control } from './synth2Params';

interface Synth2PanelProps {
  layerId: string;
  assignment: PresetPluginAssignment;
  params: EngineParam[];
  onChange: (name: string, value: number) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  mappings: ConcertMapping[];
  onLearnMapping?: (source: MidiBinding, parameterId: string) => void;
  onClearMapping?: (parameterId: string) => void;
  /** Nome do patch vindo do estado do instrumento (persistido no patch). */
  initialName?: string;
}

const mappingLabel = (mapping: ConcertMapping): string => {
  const channel = (mapping.source.channel ?? 0) + 1;
  const number = mapping.source.controllerNumber;
  if (mapping.source.type === 'cc' && number !== undefined) return `CC ${number} · ch ${channel}`;
  if (mapping.source.type === 'note' && number !== undefined) return `Nota ${number} · ch ${channel}`;
  return mapping.source.type.toUpperCase();
};

export const Synth2Panel: React.FC<Synth2PanelProps> = ({
  layerId,
  assignment,
  params,
  onChange,
  onRefresh,
  mappings,
  onLearnMapping,
  onClearMapping,
  initialName,
}) => {
  const { subscribeMidiLearn } = useAppContext();
  const [presets, setPresets] = useState<VstPreset[]>([]);
  const [presetQuery, setPresetQuery] = useState('');
  const [collection, setCollection] = useState('Todas');
  const [currentName, setCurrentName] = useState(initialName || 'INIT');
  const [saveName, setSaveName] = useState('');
  const [learnIndex, setLearnIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const paramOf = (name: string): EngineParam | undefined => params.find((item) => item.name === name);
  const valueOf = (name: string): number => paramOf(name)?.value ?? 0;

  const scheduleRefresh = () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => { void onRefresh(); }, 280);
  };

  useEffect(() => {
    if (initialName) setCurrentName(initialName);
  }, [initialName]);

  useEffect(() => () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
  }, []);

  const refreshPresets = async () => {
    try {
      const result = await window.electronAPI.vstPresetsList();
      setPresets(result.presets.filter((preset) => preset.pluginId === 'preseter.synth2'));
    } catch {
      // A lista é informativa; o painel continua funcionando sem ela.
    }
  };

  useEffect(() => {
    void refreshPresets();
    const unsubscribe = window.electronAPI.onVstPresetsUpdated((next) => {
      setPresets(next.presets.filter((preset) => preset.pluginId === 'preseter.synth2'));
    });
    return unsubscribe;
  }, []);

  // Learn: o próximo CC vira o mapping do parâmetro armado.
  useEffect(() => {
    if (learnIndex === null) return undefined;
    const unsubscribe = subscribeMidiLearn((event) => {
      if (event.kind !== 'cc') return;
      const source: MidiBinding = {
        type: 'cc',
        channel: event.channel,
        controllerNumber: event.number,
      };
      onLearnMapping?.(source, String(learnIndex));
      setLearnIndex(null);
      setMessage(`MIDI aprendido: CC ${event.number} na ch ${event.channel + 1}`);
    });
    return unsubscribe;
  }, [learnIndex, onLearnMapping, subscribeMidiLearn]);

  const mappingFor = (index: number): ConcertMapping | undefined =>
    mappings.find((mapping) =>
      mapping.parameterId === String(index)
      && mapping.paramSlot === undefined
      && (mapping.paramOwner === layerId
        || (!mapping.paramOwner && mapping.pluginPath === 'preseter.synth2'))
    );

  const applyPreset = async (preset: VstPreset) => {
    if (busy) return;
    setBusy(true);
    setMessage(`Aplicando “${preset.name}”…`);
    try {
      const applied = await window.electronAPI.vstPresetApply(preset.id, layerId);
      if (!applied) throw new Error('O motor não aplicou o patch.');
      setCurrentName(preset.name);
      setSaveName(preset.name);
      await onRefresh();
      setMessage(`Patch “${preset.name}” carregado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao aplicar o patch.');
    } finally {
      setBusy(false);
    }
  };

  const savePreset = async () => {
    if (busy) return;
    const name = saveName.trim() || (currentName === 'INIT' ? 'Meu patch' : currentName);
    setBusy(true);
    setMessage('Salvando .sy1…');
    try {
      const preset = await window.electronAPI.vstPresetSaveSnapshot({ layerId, name });
      if (!preset) throw new Error('Não foi possível gravar o patch.');
      setCurrentName(preset.name);
      setSaveName(preset.name);
      await refreshPresets();
      setMessage(`Patch “${preset.name}” salvo em Meus presets.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o patch.');
    } finally {
      setBusy(false);
    }
  };

  const importPreset = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('Escolha um arquivo .sy1…');
    try {
      const result = await window.electronAPI.vstPresetImport({ layerId });
      if (result.canceled || !result.preset) {
        setMessage(null);
      } else {
        await applyPreset(result.preset);
        setMessage(`Patch “${result.preset.name}” importado.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao importar o patch.');
    } finally {
      setBusy(false);
    }
  };

  const exportPreset = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('Escolha onde salvar o .sy1…');
    try {
      const result = await window.electronAPI.vstPresetExport({
        layerId,
        name: currentName === 'INIT' ? 'Patch' : currentName,
      });
      setMessage(result.canceled ? null : 'Patch exportado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao exportar o patch.');
    } finally {
      setBusy(false);
    }
  };

  const initPatch = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.electronAPI.vstSetProgram(layerId, 0);
      setCurrentName('INIT');
      setSaveName('');
      await onRefresh();
      setMessage('Patch INIT aplicado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao aplicar o INIT.');
    } finally {
      setBusy(false);
    }
  };

  const addFolder = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.electronAPI.vstPresetsAddSynth2Folder();
      if (!result.canceled && result.presets) {
        setPresets(result.presets.presets.filter((preset) => preset.pluginId === 'preseter.synth2'));
        setMessage('Pasta de patches adicionada.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao adicionar a pasta.');
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (preset: VstPreset) => {
    try {
      await window.electronAPI.vstPresetUpdate(preset.id, { favorite: !preset.favorite });
      await refreshPresets();
    } catch {
      // Favorito é só conveniência.
    }
  };

  const collections = useMemo(() => {
    const values = new Set(presets.map((preset) => preset.collection || 'Patches'));
    return ['Todas', ...[...values].sort((a, b) => a.localeCompare(b))];
  }, [presets]);

  useEffect(() => {
    if (!collections.includes(collection)) setCollection('Todas');
  }, [collections, collection]);

  const visiblePresets = useMemo(() => {
    const term = presetQuery.trim().toLowerCase();
    return presets
      .filter((preset) => collection === 'Todas' || (preset.collection || 'Patches') === collection)
      .filter((preset) => !term || `${preset.name} ${preset.category} ${preset.collection ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [presets, collection, presetQuery]);

  const setNormalized = (name: string, value: number) => {
    void onChange(name, Math.max(0, Math.min(1, value)));
    scheduleRefresh();
  };

  const renderLearn = (control: Synth2Control, index: number) => {
    const mapping = mappingFor(index);
    const learning = learnIndex === index;
    return (
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setLearnIndex(learning ? null : index)}
          className="rounded px-1.5 py-0.5 text-[8px] font-bold"
          style={learning
            ? { background: '#FF9F0A', color: '#1A1A1A' }
            : { background: 'rgba(255,255,255,0.05)', color: '#8E8E93', border: '1px solid #3A3A3C' }}
          title={learning ? 'Ouvindo o próximo CC…' : 'Aprender MIDI (próximo CC)'}
        >
          {learning ? 'Ouvindo…' : 'MIDI'}
        </button>
        {mapping && (
          <span className="flex items-center gap-1 text-[8px]" style={{ color: '#64D2FF' }}>
            {mappingLabel(mapping)}
            <button
              type="button"
              onClick={() => onClearMapping?.(String(index))}
              className="text-[9px]"
              style={{ color: '#FF8A80' }}
              title="Remover mapping"
            >
              ✕
            </button>
          </span>
        )}
        {!mapping && !learning && <span className="text-[8px]" style={{ color: '#5A5A5E' }}>—</span>}
        {/* control é usado para o label do learn; evita aviso de variável não usada */}
        <span className="sr-only">{control.label}</span>
      </div>
    );
  };

  const renderControl = (control: Synth2Control) => {
    const param = paramOf(control.name);
    if (!param) return null;
    const index = param.index;
    const value = param.value;

    if (control.kind === 'toggle') {
      const active = value >= 0.5;
      return (
        <div key={control.name} className="flex min-w-[92px] flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setNormalized(control.name, active ? 0 : 1)}
            className="rounded px-2 py-1 text-[9px] font-semibold"
            style={active
              ? { background: '#0A84FF', color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}
          >
            {active ? 'On' : 'Off'}
          </button>
          <span className="text-[9px] font-semibold text-white">{control.label}</span>
          {renderLearn(control, index)}
        </div>
      );
    }

    if (control.kind === 'choice' && control.choices) {
      const choices = control.choices;
      const active = Math.round(value * (choices.length - 1));
      return (
        <div key={control.name} className="flex min-w-[150px] flex-col items-center gap-1">
          <span className="text-[9px] font-semibold text-white">{control.label}</span>
          <div className="flex max-w-[240px] flex-wrap items-center justify-center gap-1">
            {choices.map((label, position) => (
              <ChoiceButton
                key={`${control.name}-${label}-${position}`}
                active={active === position}
                onClick={() => setNormalized(control.name, choices.length > 1 ? position / (choices.length - 1) : 0)}
              >
                {label}
              </ChoiceButton>
            ))}
          </div>
          {renderLearn(control, index)}
        </div>
      );
    }

    const range = control.range;
    const [min, max] = range ?? [0, 127];
    const real = min + value * (max - min);
    return (
      <div key={control.name} className="flex min-w-[74px] flex-col items-center gap-1">
        <Knob
          label={control.label}
          value={value}
          display={param.text || `${real.toFixed(0)}`}
          onChange={(next) => setNormalized(control.name, next)}
        />
        {range && (
          <NumberField
            value={real}
            min={min}
            max={max}
            step={1}
            decimals={0}
            compact
            onChange={(next) => setNormalized(control.name, max > min ? (next - min) / (max - min) : 0)}
          />
        )}
        {renderLearn(control, index)}
      </div>
    );
  };

  return (
    <div className="flex items-start gap-3">
      <aside className="hw-inset flex w-[244px] shrink-0 flex-col gap-2 p-2">
        <div className="flex items-center justify-between">
          <span className="hw-label">Patches .sy1</span>
          <button
            type="button"
            onClick={() => void addFolder()}
            className="rounded px-1.5 py-0.5 text-[9px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}
            title="Adicionar uma pasta de patches .sy1"
          >
            + Pasta
          </button>
        </div>
        <div className="rounded px-2 py-1 text-[10px] font-semibold" style={{ background: 'rgba(10,132,255,0.16)', color: '#9CC7FF' }}>
          {currentName}
        </div>
        <input
          value={presetQuery}
          onChange={(event) => setPresetQuery(event.target.value)}
          placeholder="Buscar patch…"
          className="hw-inset px-2 py-1 text-[10px] text-white"
          aria-label="Buscar patch do Synth2"
        />
        <select
          value={collection}
          onChange={(event) => setCollection(event.target.value)}
          className="hw-inset px-2 py-1 text-[10px] text-white"
          aria-label="Pasta do patch"
        >
          {collections.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <div className="max-h-[310px] overflow-y-auto rounded" style={{ background: 'rgba(0,0,0,0.18)' }}>
          {visiblePresets.length === 0 && (
            <p className="p-2 text-[9px]" style={{ color: '#8E8E93' }}>
              Nenhum patch .sy1. Use “Importar” ou “+ Pasta”.
            </p>
          )}
          {visiblePresets.map((preset) => (
            <div
              key={preset.id}
              className="group flex items-center gap-1 border-b px-1.5 py-1 text-[10px]"
              style={{ borderColor: '#2C2C2E' }}
            >
              <button
                type="button"
                onClick={() => void applyPreset(preset)}
                disabled={busy}
                className="min-w-0 flex-1 truncate text-left"
                style={{ color: preset.name === currentName ? '#7FB6FF' : '#E5E5EA' }}
                title={`${preset.name}${preset.collection ? ` · ${preset.collection}` : ''}`}
              >
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => void toggleFavorite(preset)}
                className="px-0.5 text-[10px]"
                style={{ color: preset.favorite ? '#FFD60A' : '#636366' }}
                title={preset.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                {preset.favorite ? '★' : '☆'}
              </button>
              {preset.readOnly && <span className="text-[8px]" style={{ color: '#636366' }} title="Pasta externa (somente leitura)">🔒</span>}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder={currentName === 'INIT' ? 'Nome do patch' : currentName}
            className="hw-inset min-w-0 flex-1 px-2 py-1 text-[10px] text-white"
            aria-label="Nome do novo patch"
          />
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={busy}
            className="rounded px-2 py-1 text-[9px] font-semibold"
            style={{ background: '#30D158', color: '#08210F' }}
            title="Salvar o som atual como um novo .sy1"
          >
            Salvar .sy1
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => void importPreset()} disabled={busy} className="rounded px-2 py-1 text-[9px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}>Importar</button>
          <button type="button" onClick={() => void exportPreset()} disabled={busy} className="rounded px-2 py-1 text-[9px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}>Exportar</button>
          <button type="button" onClick={() => void initPatch()} disabled={busy} className="rounded px-2 py-1 text-[9px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}>Init</button>
        </div>
        {message && <p className="text-[9px]" style={{ color: '#8E8E93' }}>{message}</p>}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        {learnIndex !== null && (
          <div className="rounded px-3 py-2 text-[10px]" style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}>
            Movimente um CC no controlador para mapear o parâmetro armado.
          </div>
        )}
        {SYNTH2_SECTIONS.map((section) => (
          <section key={section.title} className="hw-inset p-3">
            <div className="hw-label mb-2">{section.title}</div>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
              {section.controls.map(renderControl)}
            </div>
          </section>
        ))}

        <p className="text-[9px]" style={{ color: '#8E8E93' }}>
          Motor: Oxo Synth2 — François Chabloz (chab), sl23, Eufex — MIT. Recriação do Synth1 de Daichi
          Laboratory (sem código nem arte do original). O arpejador interno do Synth2 é independente do
          arp do layer: use só um dos dois. Para CCs, prefira o botão MIDI (o CTRL ASSIGN interno
          continua disponível para compatibilidade com patches .sy1).
        </p>
      </div>
    </div>
  );
};
