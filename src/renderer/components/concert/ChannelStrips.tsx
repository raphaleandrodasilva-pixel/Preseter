import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AudioInputSettings,
  AudioInputState,
  PlaybackState,
  BusMixUpdate,
  BusSettings,
  ConcertBusSettings,
  ConcertStrip,
  EffectiveStrip,
  EngineMixState,
  Insert,
  LayerMixUpdate,
  MasterMixUpdate,
  Preset,
  PresetPluginAssignment,
  StripAttribute,
  StripLevel,
  StripOverride,
  VstPluginInfo,
} from '@shared/types';
import { MAX_AUX_BUSES, MAX_INSERTS, MAX_OUTPUT_BUSES, SEND_OFF_DB, STRIP_ATTRIBUTES } from '@shared/types';
import {
  maskedAttributes,
  stripLevelViews,
  stripTargets,
  viewAt,
  type StripEditTarget,
  type StripValue,
} from '@shared/strip-levels';
import { learnParameter, subscribeParameterLearn } from '../../services/parameter-learn';

interface ChannelStripsProps {
  preset: Preset | null;
  editable: boolean;
  scannedPlugins: VstPluginInfo[];
  loadedPlugins: VstPluginInfo[];
  mixState: EngineMixState | null;
  /** Barramentos Aux/Output definidos no concert (Fase 3.2). */
  busSettings: ConcertBusSettings | null;
  /** Channel strips do concert e do set do patch atual (Fase 3.3). */
  concertStrips: ConcertStrip[];
  setStrips: ConcertStrip[];
  setName: string | null;
  setOverrides: Record<string, StripOverride> | undefined;
  /** Strip de entrada de áudio do patch (Fase 3.5). */
  audioInput?: AudioInputSettings;
  audioInputState?: AudioInputState | null;
  audioInputChannels: number;
  onAddAudioInput: () => void;
  onRemoveAudioInput: () => void;
  onAudioInputChange: (update: Partial<AudioInputSettings>) => void;
  onResetAudioFeedback: () => void;
  onKeepAudioMuted: () => void;
  onDisableAudioFeedbackProtection: () => void;
  /** Plugin Playback (Fase 6.4). */
  playbackState?: PlaybackState | null;
  onLoadPlayback: () => void;
  onPlayPlayback: () => void;
  onStopPlayback: () => void;
  onRequestScan: () => Promise<unknown>;
  onAdd: (plugin: VstPluginInfo) => Promise<boolean>;
  onRemove: (assignment: PresetPluginAssignment, layerId: string) => Promise<void>;
  onCopy: (assignment: PresetPluginAssignment, layerId: string) => Promise<boolean>;
  /** Troca o instrumento de um channel strip existente, preservando o strip. */
  onReplace: (assignment: PresetPluginAssignment, layerId: string, plugin: VstPluginInfo) => Promise<boolean>;
  /** Layer que deve ser selecionado após criar/carregar um instrumento. */
  focusLayerId?: string | null;
  onAddInsert: (layerId: string, slot: number, plugin: VstPluginInfo) => Promise<boolean>;
  onRemoveInsert: (layerId: string, slot: number) => Promise<void>;
  onToggleInsertBypass: (layerId: string, slot: number, bypass: boolean) => Promise<void>;
  onOpenInsertEditor: (layerId: string, slot: number) => void;
  /** Sends e saída dos channel strips (Fase 3.2). */
  onSetSend: (layerId: string, aux: number, levelDb: number) => void;
  onSetLayerOutput: (layerId: string, output: number) => void;
  /** Barramentos do concert (Fase 3.2). */
  onSetBusMix: (bus: string, update: BusMixUpdate) => void;
  onAddAux: () => void;
  onRemoveAux: (index: number) => void;
  onAddBusInsert: (bus: string, slot: number, plugin: VstPluginInfo) => Promise<boolean>;
  onRemoveBusInsert: (bus: string, slot: number) => Promise<void>;
  onToggleBusInsertBypass: (bus: string, slot: number, bypass: boolean) => Promise<void>;
  onOpenBusInsertEditor: (bus: string, slot: number) => void;
  /** Channel strips do concert/set: edição por nível e sobreposições (Fase 3.3). */
  onAddStrip: (level: 'concert' | 'set', plugin: VstPluginInfo) => Promise<boolean>;
  onRemoveStrip: (level: 'concert' | 'set', stripId: string) => Promise<void>;
  onRenameStrip: (level: 'concert' | 'set', stripId: string, name: string) => void;
  onSetStripValue: (
    target: StripEditTarget,
    stripId: string,
    attr: StripAttribute,
    value: StripValue
  ) => void;
  onSetStripInserts: (target: StripEditTarget, stripId: string, inserts: Insert[]) => Promise<boolean>;
  /** Tira o atributo do nível em que ele está sobreposto (volta ao herdado). */
  onRevertStripAttribute: (target: StripEditTarget, stripId: string, attr: StripAttribute) => void;
  onSelectedLayerChange?: (layerId: string | null) => void;
  onOpenEditor?: (layerId: string) => void;
  onSetParameter: (layerId: string, parameterId: string, value: number) => void;
  onSetLayerMix: (layerId: string, update: LayerMixUpdate) => void;
  onSetMasterMix: (update: MasterMixUpdate) => void;
}

/** Onde o seletor de plugins está carregando: num layer do patch, num strip herdado ou trocando um instrumento. */
type PickerTarget =
  | { kind: 'layer' }
  | { kind: 'strip'; level: 'concert' | 'set' }
  | { kind: 'replace'; assignment: PresetPluginAssignment; layerId: string };

const layerIdFor = (preset: Preset, assignment: PresetPluginAssignment, index: number) =>
  assignment.layerId ?? `${preset.id}:layer:${index}`;

const meterHeight = (peakDb: number) => Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100));

/** Nota MIDI válida (0 a 127). */
const clampNote = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(127, Math.round(value))) : 0);

/** Velocity MIDI válida (1 a 127). */
const clampVelocity = (value: number) => (Number.isFinite(value) ? Math.max(1, Math.min(127, Math.round(value))) : 1);

/** Nome do atributo na UI (Fase 3.3). */
const STRIP_ATTRIBUTE_LABELS: Record<StripAttribute, string> = {
  volumeDb: 'Volume',
  pan: 'Pan',
  muted: 'Mute',
  solo: 'Solo',
  minNote: 'Low Key',
  maxNote: 'High Key',
  velocityMin: 'Velocity mín.',
  velocityMax: 'Velocity máx.',
  output: 'Saída',
  sends: 'Sends',
  inserts: 'Inserts',
};

/** Níveis que a UI pode editar. */
const STRIP_TARGET_LABELS: Record<StripEditTarget, string> = {
  patch: 'Patch',
  set: 'Set',
  concert: 'Concert',
};

/** Valor de um atributo em texto curto, para avisar o que está sobreposto. */
const formatStripValue = (strip: EffectiveStrip | undefined, attr: StripAttribute): string => {
  if (!strip) return '—';
  switch (attr) {
    case 'volumeDb':
      return `${strip.volumeDb.toFixed(1)} dB`;
    case 'pan':
      return strip.pan === 0
        ? 'C'
        : strip.pan < 0
          ? `L ${Math.round(-strip.pan * 100)}`
          : `R ${Math.round(strip.pan * 100)}`;
    case 'muted':
      return strip.muted ? 'ligado' : 'desligado';
    case 'solo':
      return strip.solo ? 'ligado' : 'desligado';
    case 'minNote':
      return `nota ${strip.minNote}`;
    case 'maxNote':
      return `nota ${strip.maxNote}`;
    case 'velocityMin':
      return `velocity ${strip.velocityMin}`;
    case 'velocityMax':
      return `velocity ${strip.velocityMax}`;
    case 'output':
      return `Output ${strip.output}`;
    case 'sends':
      return strip.sends.map((level, index) => `A${index + 1} ${level > SEND_OFF_DB ? level.toFixed(0) : '−∞'}`).join(' · ');
    case 'inserts':
      return strip.inserts.length === 0 ? 'nenhum' : strip.inserts.map((insert) => insert.name).join(' · ');
    default:
      return '—';
  }
};

export const ChannelStrips: React.FC<ChannelStripsProps> = ({
  preset,
  editable,
  scannedPlugins,
  loadedPlugins,
  mixState,
  busSettings,
  concertStrips,
  setStrips,
  setName,
  setOverrides,
  audioInput,
  audioInputState,
  audioInputChannels,
  onAddAudioInput,
  onRemoveAudioInput,
  onAudioInputChange,
  onResetAudioFeedback,
  onKeepAudioMuted,
  onDisableAudioFeedbackProtection,
  playbackState,
  onLoadPlayback,
  onPlayPlayback,
  onStopPlayback,
  onRequestScan,
  onAdd,
  onRemove,
  onCopy,
  onReplace,
  focusLayerId,
  onAddInsert,
  onRemoveInsert,
  onToggleInsertBypass,
  onOpenInsertEditor,
  onSetSend,
  onSetLayerOutput,
  onSetBusMix,
  onAddAux,
  onRemoveAux,
  onAddBusInsert,
  onRemoveBusInsert,
  onToggleBusInsertBypass,
  onOpenBusInsertEditor,
  onAddStrip,
  onRemoveStrip,
  onRenameStrip,
  onSetStripValue,
  onSetStripInserts,
  onRevertStripAttribute,
  onSelectedLayerChange,
  onOpenEditor,
  onSetParameter,
  onSetLayerMix,
  onSetMasterMix,
}) => {
  const plugins = preset?.plugins ?? [];
  const visibleAux = (busSettings?.aux ?? [])
    .map((bus, index) => ({ bus, index: index + 1 }))
    .filter(({ bus }) => bus.enabled === true || (bus.enabled === undefined && bus.inserts.length > 0));
  const instruments = scannedPlugins.filter((plugin) => plugin.isInstrument);
  const effects = scannedPlugins.filter((plugin) => !plugin.isInstrument);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [insertPicker, setInsertPicker] = useState<{
    title: string;
    slot: number;
    pick: (plugin: VstPluginInfo) => Promise<boolean>;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stripEditTargets, setStripEditTargets] = useState<Record<string, StripEditTarget>>({});
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [learningParameter, setLearningParameter] = useState(false);
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('preseter.channelStripsWidth.v1');
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) return Math.max(280, Math.min(640, parsed));
    } catch { /* ignora */ }
    return 480;
  });
  const resizing = useRef<{ startX: number; originW: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  const layers = preset
    ? plugins.map((assignment, index) => ({ assignment, layerId: layerIdFor(preset, assignment, index), index }))
    : [];
  const selectedLayer = layers.find((layer) => layer.layerId === selectedLayerId) ?? layers[0] ?? null;
  const canAdd = editable;
  /** Valores dos strips herdados em cada nível (concert/set/patch) — Fase 3.3. */
  const stripViews = useMemo(
    () => stripLevelViews({ concertStrips, setStrips, setOverrides, patch: preset }),
    [concertStrips, setStrips, setOverrides, preset]
  );
  /** Nível em que este strip está sendo editado (Patch por padrão). */
  const editTargetFor = (stripId: string, level: StripLevel): StripEditTarget => {
    const allowed = stripTargets(level);
    const chosen = stripEditTargets[stripId];
    return chosen && allowed.includes(chosen) ? chosen : allowed[0];
  };
  const selectedKey = selectedLayer?.layerId ?? null;
  useEffect(() => { onSelectedLayerChange?.(selectedKey); }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeParameterLearn(setLearningParameter), []);

  useEffect(() => {
    if (selectedLayerId && !layers.some((layer) => layer.layerId === selectedLayerId)) {
      setSelectedLayerId(layers[0]?.layerId ?? null);
    }
  }, [selectedLayerId, layers]);

  useEffect(() => {
    if (focusLayerId && layers.some((layer) => layer.layerId === focusLayerId)) {
      setSelectedLayerId(focusLayerId);
    }
  }, [focusLayerId, layers]);

  const withLoadingMessage = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setLoadingMessage('Carregando instrumento VST… isso pode levar cerca de 10 segundos.');
    const messageTimer = window.setTimeout(() => {
      setLoadingMessage('Ainda carregando… instrumentos maiores podem demorar mais de 10 segundos.');
    }, 10_000);
    try {
      return await action();
    } finally {
      window.clearTimeout(messageTimer);
      setLoadingMessage(null);
      setBusy(false);
    }
  };

  const requestScanIfEmpty = (empty: boolean) => {
    if (empty && !scanning) {
      setScanning(true);
      void onRequestScan().finally(() => setScanning(false));
    }
  };

  /** Seletor de plugin: um layer novo no patch ou um channel strip do concert/set. */
  const openPicker = (target: PickerTarget) => {
    setPicker(target);
    requestScanIfEmpty(target.kind === 'layer' ? instruments.length === 0 : scannedPlugins.length === 0);
  };

  /** Seletor de efeito para um slot de insert, com o dono resolvido pelo chamador. */
  const openInsertPicker = (
    title: string,
    slot: number,
    pick: (plugin: VstPluginInfo) => Promise<boolean>
  ) => {
    setInsertPicker({ title, slot, pick });
    requestScanIfEmpty(effects.length === 0);
  };

  const renderInsertSlot = (options: {
    ownerId: string;
    slot: number;
    insert?: Insert;
    onToggleBypass: (ownerId: string, slot: number, bypass: boolean) => void;
    onRemove: (ownerId: string, slot: number) => void;
    onOpenEditor: (ownerId: string, slot: number) => void;
    onRequestInsert: () => void;
  }) => {
    const { ownerId, slot, insert } = options;
    return (
      <div
        key={slot}
        className="hw-inset flex items-center gap-1 px-1 py-0.5 text-[8px]"
        style={{ color: insert ? '#E5E5EA' : '#8E8E93' }}
      >
        <span className="w-2 shrink-0" style={{ color: '#6E6E73' }}>{slot + 1}</span>
        {insert ? (
          <>
            <span
              className="min-w-0 flex-1 truncate"
              title={`${insert.name} — ${insert.bypass ? 'em bypass' : 'ativo'}`}
              style={insert.bypass ? { color: '#8E8E93', textDecoration: 'line-through' } : undefined}
            >
              {insert.name}
            </span>
            <button
              className="hw-squarebtn shrink-0 px-1 disabled:opacity-40"
              aria-pressed={insert.bypass}
              aria-label={`Bypass de ${insert.name}`}
              title="Bypass do efeito"
              disabled={!editable || busy}
              onClick={(event) => { event.stopPropagation(); options.onToggleBypass(ownerId, slot, !insert.bypass); }}
              style={insert.bypass ? { color: '#FFB74D', borderColor: '#FFB74D' } : undefined}
            >
              B
            </button>
            <button
              className="hw-squarebtn shrink-0 px-1"
              aria-label={`Abrir a janela de ${insert.name}`}
              title="Abrir a janela do efeito"
              onClick={(event) => { event.stopPropagation(); options.onOpenEditor(ownerId, slot); }}
            >
              E
            </button>
            <button
              className="hw-squarebtn shrink-0 px-1 disabled:opacity-40"
              aria-label={`Remover ${insert.name}`}
              title="Remover o efeito"
              disabled={!editable || busy}
              onClick={(event) => { event.stopPropagation(); options.onRemove(ownerId, slot); }}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            className="min-w-0 flex-1 truncate rounded text-left disabled:opacity-40"
            disabled={!editable || busy}
            title={editable ? 'Carregar um efeito VST3 neste slot' : 'Edite o patch para alterar os inserts'}
            onClick={(event) => { event.stopPropagation(); options.onRequestInsert(); }}
          >
            ＋ vazio
          </button>
        )}
      </div>
    );
  };

  /** Medidor, volume, pan, mute e solo de um channel strip (layer ou herdado). */
  const renderFader = (options: {
    label: string;
    peakDb: number;
    volumeDb: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    disabled: boolean;
    /** Strip de entrada de áudio não tem solo (Fase 3.5). */
    showSolo?: boolean;
    onMix: (update: LayerMixUpdate) => void;
  }) => {
    const { label, disabled } = options;
    const percent = meterHeight(options.peakDb);
    return (
      <>
        <div className="mt-2 flex items-center justify-center gap-2">
          <div className="relative h-28 w-2 overflow-hidden rounded-sm bg-black/70" role="meter" aria-label={`${label} peak`} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, options.peakDb)}>
            <div className="absolute bottom-0 w-full" style={{ height: `${percent}%`, background: percent > 90 ? '#FF554D' : '#30D158' }} />
          </div>
          <div className="flex h-28 flex-col items-center justify-between">
            <span className="text-[8px]" style={{ color: '#C6C6CB' }}>{options.volumeDb.toFixed(1)} dB</span>
            <input
              aria-label={`Volume de ${label}`}
              type="range"
              min={-60}
              max={6}
              step={0.1}
              value={options.volumeDb}
              disabled={disabled}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => options.onMix({ volumeDb: Number(event.target.value) })}
              className="h-20 w-4"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
            />
            <span className="text-[8px]" style={{ color: '#8E8E93' }}>−60</span>
          </div>
        </div>
        <label className="mt-2 block text-[8px]" style={{ color: '#9A9AA0' }}>
          PAN <span className="float-right">{options.pan === 0 ? 'C' : options.pan < 0 ? `L ${Math.round(-options.pan * 100)}` : `R ${Math.round(options.pan * 100)}`}</span>
          <input
            aria-label={`Pan de ${label}`}
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={options.pan}
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => options.onMix({ pan: Number(event.target.value) })}
            className="w-full"
            style={{ accentColor: '#0A84FF' }}
          />
        </label>
        <div className="mt-1 flex gap-1">
          <button
            className="hw-squarebtn flex-1 px-1 py-1 text-[9px]"
            aria-pressed={options.muted}
            disabled={disabled}
            onClick={(event) => { event.stopPropagation(); options.onMix({ muted: !options.muted }); }}
            style={options.muted ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
          >MUTE</button>
          {options.showSolo !== false && (
            <button
              className="hw-squarebtn flex-1 px-1 py-1 text-[9px]"
              aria-pressed={options.solo}
              disabled={disabled}
              onClick={(event) => { event.stopPropagation(); options.onMix({ solo: !options.solo }); }}
              style={options.solo ? { color: '#FFFFFF', background: '#0A84FF' } : undefined}
            >SOLO</button>
          )}
        </div>
      </>
    );
  };

  /** Plugin Playback do concert (Fase 6.4). */
  const renderPlayback = () => {
    const fileName = playbackState?.path ? playbackState.path.split(/[\\/]/).pop() : '';
    return (
      <section
        className="flex w-[148px] shrink-0 flex-col rounded-xl p-2"
        style={{ border: '1px solid #3A3A3C', background: 'linear-gradient(to bottom, #232326, #2C2C2E)' }}
      >
        <div className="flex items-center gap-1 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
          <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#BF5AF2', color: '#fff' }}>PB</span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">Playback</span>
          {playbackState?.playing && <span className="text-[9px]" style={{ color: '#30D158' }}>▶</span>}
        </div>
        <div className="hw-inset mt-2 truncate px-1.5 py-1 text-[8px]" title={playbackState?.path ?? ''} style={{ color: '#9A9AA0' }}>
          {fileName || 'Nenhum arquivo'}
        </div>
        <button
          className="hw-squarebtn mt-2 w-full px-1 py-1 text-[9px]"
          onClick={onLoadPlayback}
        >
          Carregar áudio…
        </button>
        <div className="mt-1 flex gap-1">
          <button
            className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
            disabled={!playbackState?.loaded}
            onClick={onPlayPlayback}
          >
            Play
          </button>
          <button
            className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
            disabled={!playbackState?.playing}
            onClick={onStopPlayback}
          >
            Stop
          </button>
        </div>
      </section>
    );
  };

  /** Strip de entrada de áudio do patch (Fase 3.5). */
  const renderAudioInput = () => {
    if (!audioInput?.enabled) {
      return (
        <section
          className="flex w-[148px] shrink-0 flex-col rounded-xl p-2"
          style={{ border: '1px dashed #3A3A3C', background: 'rgba(35,35,38,0.6)' }}
        >
          <div className="text-[9px] font-bold" style={{ color: '#CFE5FF' }}>AUDIO IN</div>
          <button
            className="hw-squarebtn mt-2 w-full px-1 py-1 text-[9px] disabled:opacity-40"
            disabled={!editable}
            onClick={onAddAudioInput}
            title="Adicionar strip de entrada para guitarra/microfone"
          >
            + Entrada de áudio
          </button>
          <p className="mt-2 text-[8px] leading-relaxed" style={{ color: '#8E8E93' }}>
            Guitarra ou microfone. O volume começa em 0 dB para evitar feedback.
          </p>
        </section>
      );
    }

    return (
      <section
        className="flex w-[148px] shrink-0 flex-col rounded-xl p-2"
        style={{ border: '1px solid #3A3A3C', background: 'linear-gradient(to bottom, #232326, #2C2C2E)' }}
      >
        <div className="flex items-center gap-1 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
          <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#FF9F0A', color: '#1A1A1A' }}>IN</span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">Entrada de áudio</span>
          <button
            className="rounded px-1 text-[10px] text-slate-500 hover:text-red-300"
            disabled={!editable}
            title="Remover entrada de áudio"
            onClick={onRemoveAudioInput}
          >
            ×
          </button>
        </div>
        <label className="mt-1.5 block text-[8px]" style={{ color: '#9A9AA0' }}>
          ENTRADA
          <select
            className="mt-0.5 w-full rounded px-1 py-0.5 text-[8px] outline-none disabled:opacity-60"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
            value={audioInput.inputChannel}
            disabled={!editable}
            onChange={(event) => onAudioInputChange({ inputChannel: Number(event.target.value) })}
            title="Canal de entrada do dispositivo de áudio"
          >
            {Array.from({ length: Math.max(1, audioInputChannels) }, (_, index) => (
              <option key={index} value={index}>In {index + 1}</option>
            ))}
          </select>
        </label>
        <label className="mt-1 block text-[8px]" style={{ color: '#9A9AA0' }}>
          FORMATO
          <select
            className="mt-0.5 w-full rounded px-1 py-0.5 text-[8px] outline-none disabled:opacity-60"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
            value={audioInput.mode}
            disabled={!editable}
            onChange={(event) => onAudioInputChange({ mode: event.target.value === 'stereo' ? 'stereo' : 'mono' })}
          >
            <option value="mono">Mono</option>
            <option value="stereo">Estéreo</option>
          </select>
        </label>
        {renderFader({
          label: 'Entrada de áudio',
          peakDb: audioInputState?.peakDb ?? -100,
          volumeDb: audioInput.volumeDb,
          pan: audioInput.pan,
          muted: audioInput.muted,
          solo: false,
          showSolo: false,
          disabled: !editable,
          onMix: (update) => onAudioInputChange(update),
        })}
        <label className="mt-1 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
          <input
            type="checkbox"
            checked={audioInput.feedbackProtection}
            disabled={!editable}
            onChange={(event) => onAudioInputChange({ feedbackProtection: event.target.checked })}
            style={{ accentColor: '#FF9F0A' }}
          />
          Feedback Protection
        </label>
        <p className="mt-1 text-[8px] leading-relaxed" style={{ color: '#FFB340' }}>
          ⚠ Guitarra/microfone pode gerar feedback. Aumente o volume devagar.
        </p>
        {audioInputChannels === 0 && (
          <p className="mt-1 text-[8px]" style={{ color: '#FF8A80' }}>
            Inicie o áudio nas Configurações para liberar as entradas.
          </p>
        )}
        {audioInputState?.feedback && (
          <div className="mt-1 rounded border px-1 py-1 text-[8px]" style={{ borderColor: '#FF554D', background: 'rgba(255,85,77,0.15)', color: '#FFD1CF' }}>
            <div className="font-semibold">Feedback detectado — canal silenciado.</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <button className="hw-squarebtn px-1 py-0.5 text-[8px]" onClick={onResetAudioFeedback}>Continuar</button>
              <button className="hw-squarebtn px-1 py-0.5 text-[8px]" onClick={onKeepAudioMuted}>Manter mudo</button>
              <button className="hw-squarebtn px-1 py-0.5 text-[8px]" onClick={onDisableAudioFeedbackProtection}>Desativar</button>
            </div>
          </div>
        )}
      </section>
    );
  };

  /** Os 4 slots de insert de um channel strip (layer, barramento ou herdado). */
  const renderInserts = (options: {
    ownerId: string;
    inserts: Insert[];
    onToggleBypass: (ownerId: string, slot: number, bypass: boolean) => void;
    onRemove: (ownerId: string, slot: number) => void;
    onOpenEditor: (ownerId: string, slot: number) => void;
    onRequestInsert: (slot: number) => void;
  }) => (
    <div className="mt-2">
      <span className="hw-label" style={{ fontSize: 8 }}>INSERTS</span>
      <div className="mt-1 space-y-0.5">
        {Array.from({ length: MAX_INSERTS }, (_, slot) => (
          <span key={slot}>
            {renderInsertSlot({
              ownerId: options.ownerId,
              slot,
              insert: options.inserts.find((item) => item.slot === slot),
              onToggleBypass: options.onToggleBypass,
              onRemove: options.onRemove,
              onOpenEditor: options.onOpenEditor,
              onRequestInsert: () => options.onRequestInsert(slot),
            })}
          </span>
        ))}
      </div>
    </div>
  );

  /** Os 4 sends post-fader para os Aux e a escolha de saída. */
  const renderSends = (options: {
    label: string;
    sends: number[];
    output: number;
    disabled: boolean;
    onSend: (aux: number, levelDb: number) => void;
    onOutput: (output: number) => void;
  }) => (
    <div className="mt-2">
      <span className="hw-label" style={{ fontSize: 8 }}>SENDS (Aux)</span>
      <div className="mt-1 space-y-0.5">
        {visibleAux.length === 0 && (
          <div className="text-[8px]" style={{ color: '#636366' }}>Nenhum Aux criado.</div>
        )}
        {visibleAux.map(({ index }) => {
          const aux = index;
          const level = options.sends[index - 1] ?? SEND_OFF_DB;
          const active = level > SEND_OFF_DB;
          return (
            <label
              key={aux}
              className="flex items-center gap-1 text-[8px]"
              style={{ color: active ? '#9AD1FF' : '#8E8E93' }}
              title={`Send post-fader para Aux ${aux}`}
            >
              <span className="w-5 shrink-0">A{aux}</span>
              <input
                aria-label={`Send para Aux ${aux} de ${options.label}`}
                type="range"
                min={SEND_OFF_DB}
                max={6}
                step={0.5}
                value={Math.max(SEND_OFF_DB, level)}
                disabled={options.disabled}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => options.onSend(aux, Number(event.target.value))}
                className="h-1 min-w-0 flex-1"
                style={{ accentColor: '#FF9F0A' }}
              />
              <span className="w-6 shrink-0 text-right">{active ? level.toFixed(0) : '−∞'}</span>
            </label>
          );
        })}
      </div>
      <label className="mt-1 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
        OUT
        <select
          aria-label={`Saída de ${options.label}`}
          className="min-w-0 flex-1 rounded px-1 py-0.5 text-[8px] outline-none"
          style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          value={options.output}
          disabled={options.disabled}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => options.onOutput(Number(event.target.value))}
        >
          {Array.from({ length: MAX_OUTPUT_BUSES }, (_, index) => (
            <option key={index + 1} value={index + 1}>Output {index + 1}</option>
          ))}
        </select>
      </label>
    </div>
  );

  /** Strip de um barramento (Aux/Output) do concert (Fase 3.2). */
  const renderBusStrip = (ownerId: string, label: string, kind: 'aux' | 'output', settings: BusSettings) => {
    const live = mixState?.aux.find((bus) => bus.bus === ownerId)
      ?? mixState?.outputs.find((bus) => bus.bus === ownerId);
    const mix = {
      volumeDb: live?.volumeDb ?? settings.volumeDb,
      pan: live?.pan ?? settings.pan,
      muted: live?.muted ?? settings.muted,
      peakDb: live?.peakDb ?? -100,
      output: live?.output ?? settings.output ?? 1,
    };
    const percent = meterHeight(mix.peakDb);
    const inserts = [...(settings.inserts ?? [])].sort((a, b) => a.slot - b.slot);
    return (
      <section
        key={ownerId}
        className="flex w-[124px] shrink-0 flex-col rounded-xl p-2"
        style={{ border: '1px solid #3A3A3C', background: 'linear-gradient(to bottom, #1F1F21, #26262A)' }}
      >
        <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
          <span
            className="rounded px-1 py-0.5 text-[9px] font-bold"
            style={{ background: kind === 'aux' ? '#FF9F0A' : '#5E5CE6', color: '#FFFFFF' }}
          >
            {kind === 'aux' ? 'AUX' : 'OUT'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white" title={label}>{label}</span>
          {kind === 'aux' && (
            <button
              type="button"
              className="px-1 text-[10px]"
              style={{ color: '#8E8E93' }}
              title={`Remover ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveAux(Number(ownerId.replace('aux', '')) - 1);
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <div
            className="relative h-24 w-2 overflow-hidden rounded-sm bg-black/70"
            role="meter"
            aria-label={`${label} peak`}
            aria-valuemin={-60}
            aria-valuemax={0}
            aria-valuenow={Math.max(-60, mix.peakDb)}
          >
            <div className="absolute bottom-0 w-full" style={{ height: `${percent}%`, background: percent > 90 ? '#FF554D' : '#30D158' }} />
          </div>
          <div className="flex h-24 flex-col items-center justify-between">
            <span className="text-[8px]" style={{ color: '#C6C6CB' }}>{mix.volumeDb.toFixed(1)} dB</span>
            <input
              aria-label={`Volume de ${label}`}
              type="range"
              min={-60}
              max={6}
              step={0.1}
              value={mix.volumeDb}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSetBusMix(ownerId, { volumeDb: Number(event.target.value) })}
              className="h-16 w-4"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
            />
            <span className="text-[8px]" style={{ color: '#8E8E93' }}>−60</span>
          </div>
        </div>
        <label className="mt-2 block text-[8px]" style={{ color: '#9A9AA0' }}>
          PAN <span className="float-right">{mix.pan === 0 ? 'C' : mix.pan < 0 ? `L ${Math.round(-mix.pan * 100)}` : `R ${Math.round(mix.pan * 100)}`}</span>
          <input
            aria-label={`Pan de ${label}`}
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={mix.pan}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetBusMix(ownerId, { pan: Number(event.target.value) })}
            className="w-full"
            style={{ accentColor: '#0A84FF' }}
          />
        </label>
        <button
          className="hw-squarebtn mt-1 w-full px-1 py-1 text-[9px]"
          aria-pressed={mix.muted}
          onClick={(event) => { event.stopPropagation(); onSetBusMix(ownerId, { muted: !mix.muted }); }}
          style={mix.muted ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
        >
          MUTE
        </button>
        {kind === 'aux' && (
          <label className="mt-1 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
            OUT
            <select
              aria-label={`Saída de ${label}`}
              className="min-w-0 flex-1 rounded px-1 py-0.5 text-[8px] outline-none"
              style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
              value={mix.output}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSetBusMix(ownerId, { output: Number(event.target.value) })}
            >
              {Array.from({ length: MAX_OUTPUT_BUSES }, (_, index) => (
                <option key={index + 1} value={index + 1}>Output {index + 1}</option>
              ))}
            </select>
          </label>
        )}
        {renderInserts({
          ownerId,
          inserts,
          onToggleBypass: (id, targetSlot, bypass) => void onToggleBusInsertBypass(id, targetSlot, bypass),
          onRemove: (id, targetSlot) => void onRemoveBusInsert(id, targetSlot),
          onOpenEditor: onOpenBusInsertEditor,
          onRequestInsert: (slot) => openInsertPicker(
            `Carregar efeito no ${label}`,
            slot,
            (plugin) => onAddBusInsert(ownerId, slot, plugin)
          ),
        })}
      </section>
    );
  };

  /**
   * Channel strip herdado do concert ou do set (Fase 3.3). Os controles mostram
   * o valor do nível escolhido em "NÍVEL"; os avisos listam o que um nível mais
   * específico está sobrepondo, com o botão de voltar ao herdado.
   */
  const renderInheritedStrip = (level: 'concert' | 'set', strip: ConcertStrip) => {
    const targets = stripTargets(level);
    const target = editTargetFor(strip.id, level);
    const view = viewAt(stripViews, target, strip.id);
    if (!view) return null;
    const full = stripViews.patch.find((item) => item.id === strip.id);
    const loaded = loadedPlugins.find((plugin) => plugin.layerId === strip.id);
    const liveMix = mixState?.layers.find((state) => state.layerId === strip.id);
    const masked = maskedAttributes(full, target, STRIP_ATTRIBUTES);
    const isInstrument = strip.role === 'instrument';
    return (
      <section
        key={strip.id}
        className="flex w-[152px] shrink-0 flex-col rounded-xl p-2"
        style={{ border: '1px solid #3A3A3C', background: 'linear-gradient(to bottom, #202024, #26262B)' }}
        data-testid={`inherited-strip-${strip.id}`}
      >
        <div className="flex items-center gap-1 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
          <span
            className="rounded px-1 py-0.5 text-[9px] font-bold"
            style={{ background: isInstrument ? '#0A84FF' : '#30D158', color: '#FFFFFF' }}
          >
            {isInstrument ? 'INST' : 'FX'}
          </span>
          <span
            className="rounded px-1 py-0.5 text-[8px] font-bold"
            style={{ background: '#3A3A3C', color: '#C6C6CB' }}
            title={`Channel strip do ${level === 'concert' ? 'concert' : 'set'}`}
          >
            {level === 'concert' ? 'CONCERT' : 'SET'}
          </span>
        </div>
        <input
          className="mt-1 min-w-0 rounded px-1 py-0.5 text-[10px] font-semibold text-white outline-none disabled:opacity-60"
          style={{ border: '1px solid transparent', background: 'transparent' }}
          aria-label={`Nome do channel strip ${strip.name}`}
          value={strip.name}
          disabled={!editable}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onRenameStrip(level, strip.id, event.target.value)}
        />
        <div className="hw-inset mt-1 px-1.5 py-1 text-[9px]" style={{ color: '#9A9AA0' }}>
          Insert: {loaded ? 'VST3' : 'Carregando…'}
        </div>
        <button
          className="mt-1 w-full rounded px-1 py-1 text-[9px] font-semibold disabled:opacity-40"
          style={{ background: '#3A3A3C', color: '#E5E5EA' }}
          disabled={!loaded}
          title="Abrir/fechar a janela do plugin (V)"
          onClick={(event) => { event.stopPropagation(); onOpenEditor?.(strip.id); }}
        >
          Editor (V)
        </button>
        <label className="mt-1.5 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
          NÍVEL
          <select
            aria-label={`Nível de edição de ${strip.name}`}
            className="min-w-0 flex-1 rounded px-1 py-0.5 text-[8px] outline-none disabled:opacity-60"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
            value={target}
            disabled={!editable || targets.length === 1}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setStripEditTargets((prev) => ({ ...prev, [strip.id]: event.target.value as StripEditTarget }))}
            title="Nível em que este strip é editado (o mais específico vence)"
          >
            {targets.map((item) => (
              <option key={item} value={item}>Editar no {STRIP_TARGET_LABELS[item]}</option>
            ))}
          </select>
        </label>
        {masked.length > 0 && (
          <div
            className="hw-inset mt-1 space-y-0.5 px-1 py-1 text-[8px]"
            style={{ color: '#CFE5FF' }}
            data-testid={`inherited-masked-${strip.id}`}
          >
            {masked.map((attr) => {
              const source = full?.sources[attr] ?? 'patch';
              return (
                <div key={attr} className="flex items-center gap-1">
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={`${STRIP_ATTRIBUTE_LABELS[attr]} vem do ${STRIP_TARGET_LABELS[source]}`}
                  >
                    {STRIP_ATTRIBUTE_LABELS[attr]}: {formatStripValue(full, attr)} ({STRIP_TARGET_LABELS[source]})
                  </span>
                  <button
                    className="hw-squarebtn shrink-0 px-1 disabled:opacity-40"
                    aria-label={`Voltar ao herdado: ${STRIP_ATTRIBUTE_LABELS[attr]} de ${strip.name}`}
                    title="Voltar ao valor herdado"
                    disabled={!editable}
                    onClick={(event) => { event.stopPropagation(); onRevertStripAttribute(target, strip.id, attr); }}
                  >
                    ↩
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
          <span className="shrink-0">KEY</span>
          <input
            aria-label={`Low Key de ${strip.name}`}
            type="number"
            min={0}
            max={127}
            value={view.minNote}
            disabled={!editable}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetStripValue(target, strip.id, 'minNote', clampNote(Number(event.target.value)))}
            className="w-9 rounded px-1 py-0.5 text-[8px] outline-none"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          />
          <span className="shrink-0">–</span>
          <input
            aria-label={`High Key de ${strip.name}`}
            type="number"
            min={0}
            max={127}
            value={view.maxNote}
            disabled={!editable}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetStripValue(target, strip.id, 'maxNote', clampNote(Number(event.target.value)))}
            className="w-9 rounded px-1 py-0.5 text-[8px] outline-none"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          />
        </div>
        <div className="mt-1 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }}>
          <span className="shrink-0">VEL</span>
          <input
            aria-label={`Velocity mínima de ${strip.name}`}
            type="number"
            min={1}
            max={127}
            value={view.velocityMin}
            disabled={!editable}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetStripValue(target, strip.id, 'velocityMin', clampVelocity(Number(event.target.value)))}
            className="w-9 rounded px-1 py-0.5 text-[8px] outline-none"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          />
          <span className="shrink-0">–</span>
          <input
            aria-label={`Velocity máxima de ${strip.name}`}
            type="number"
            min={1}
            max={127}
            value={view.velocityMax}
            disabled={!editable}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetStripValue(target, strip.id, 'velocityMax', clampVelocity(Number(event.target.value)))}
            className="w-9 rounded px-1 py-0.5 text-[8px] outline-none"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          />
          <svg
            viewBox="0 0 64 18"
            className="h-4 min-w-0 flex-1"
            role="img"
            aria-label={`Faixa de velocity ${view.velocityMin} a ${view.velocityMax}`}
          >
            <rect x="0" y="0" width="64" height="18" fill="#1F1F21" stroke="#3A3A3C" strokeWidth="1" />
            <rect
              x={(view.velocityMin / 127) * 64}
              y="0"
              width={Math.max(1, ((view.velocityMax - view.velocityMin) / 127) * 64)}
              height="18"
              fill="#0A84FF"
              opacity="0.22"
            />
            <line
              x1={(view.velocityMin / 127) * 64}
              y1={18 - (view.velocityMin / 127) * 18}
              x2={(view.velocityMax / 127) * 64}
              y2={18 - (view.velocityMax / 127) * 18}
              stroke="#0A84FF"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        {renderFader({
          label: strip.name,
          peakDb: liveMix?.peakDb ?? -100,
          volumeDb: view.volumeDb,
          pan: view.pan,
          muted: view.muted,
          solo: view.solo,
          disabled: !editable || !loaded,
          onMix: (update) => {
            if (update.volumeDb !== undefined) onSetStripValue(target, strip.id, 'volumeDb', update.volumeDb);
            if (update.pan !== undefined) onSetStripValue(target, strip.id, 'pan', update.pan);
            if (update.muted !== undefined) onSetStripValue(target, strip.id, 'muted', update.muted);
            if (update.solo !== undefined) onSetStripValue(target, strip.id, 'solo', update.solo);
          },
        })}
        {renderInserts({
          ownerId: strip.id,
          inserts: view.inserts,
          onToggleBypass: (ownerId, slot, bypass) => void onSetStripInserts(
            target,
            ownerId,
            view.inserts.map((item) => (item.slot === slot ? { ...item, bypass } : item))
          ),
          onRemove: (ownerId, slot) => void onSetStripInserts(target, ownerId, view.inserts.filter((item) => item.slot !== slot)),
          onOpenEditor: onOpenInsertEditor,
          onRequestInsert: (slot) => openInsertPicker(
            `Carregar efeito em ${strip.name}`,
            slot,
            (plugin) => onSetStripInserts(target, strip.id, [
              ...view.inserts.filter((item) => item.slot !== slot),
              { slot, pluginId: plugin.id, name: plugin.name, path: plugin.path, bypass: false },
            ])
          ),
        })}
        {renderSends({
          label: strip.name,
          sends: view.sends,
          output: view.output,
          disabled: !editable || !loaded,
          onSend: (aux, levelDb) => {
            const next = [...view.sends];
            next[aux - 1] = levelDb;
            onSetStripValue(target, strip.id, 'sends', next);
          },
          onOutput: (output) => onSetStripValue(target, strip.id, 'output', output),
        })}
        <div className="mt-1 flex gap-1 border-t pt-1.5" style={{ borderColor: '#3A3A3C' }}>
          <button
            className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
            disabled={!editable || busy}
            onClick={(event) => { event.stopPropagation(); void onRemoveStrip(level, strip.id); }}
            title="Remover este channel strip do concert/set"
          >
            Remover
          </button>
        </div>
      </section>
    );
  };

  /** Grupo de channel strips de um nível, com o botão de adicionar (Fase 3.3). */
  const renderInheritedGroup = (level: 'concert' | 'set', strips: ConcertStrip[]) => (
    <div
      key={level}
      className="flex shrink-0 items-stretch gap-1.5 self-stretch rounded-xl p-1.5"
      style={{ border: '1px dashed #3A3A3C', background: 'rgba(22,22,24,0.6)' }}
      data-testid={`inherited-group-${level}`}
    >
      <div className="flex w-[24px] shrink-0 flex-col items-center justify-between">
        <span
          className="hw-label text-center"
          style={{ fontSize: 8, writingMode: 'vertical-rl' }}
          title={level === 'concert' ? 'Channel strips do concert: valem em todos os patches' : 'Channel strips deste set'}
        >
          {level === 'concert' ? 'CONCERT' : 'SET'}
        </span>
        <button
          className="hw-squarebtn px-1 py-0.5 text-[10px] disabled:opacity-40"
          aria-label={`Adicionar channel strip ao ${level === 'concert' ? 'concert' : 'set'}`}
          title={`Adicionar channel strip ao ${level === 'concert' ? 'concert' : 'set'}`}
          disabled={!editable || busy}
          onClick={(event) => { event.stopPropagation(); openPicker({ kind: 'strip', level }); }}
        >
          ＋
        </button>
      </div>
      {strips.map((strip) => renderInheritedStrip(level, strip))}
    </div>
  );

  return (
    <aside className="relative flex shrink-0 flex-col border-l" style={{ borderColor: '#303032', background: '#242426', width }}>
      <div
        className="absolute bottom-0 left-[-4px] top-0 w-[7px] cursor-ew-resize"
        title="Arrastar para redimensionar"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizing.current = { startX: event.clientX, originW: widthRef.current };
        }}
        onPointerMove={(event) => {
          const origin = resizing.current;
          if (origin) setWidth(Math.max(280, Math.min(640, origin.originW - (event.clientX - origin.startX))));
        }}
        onPointerUp={() => {
          resizing.current = null;
          try { localStorage.setItem('preseter.channelStripsWidth.v1', String(widthRef.current)); } catch { /* ignora */ }
        }}
        onPointerCancel={() => { resizing.current = null; }}
      />
      <div className="relative flex flex-wrap items-center gap-1.5 px-3 py-2.5" style={{ borderBottom: '1px solid #3A3A3C' }}>
        <span className="hw-label mr-auto">Layers {preset ? `— ${preset.name}` : ''}</span>
        <span className="text-[9px]" style={{ color: '#8E8E93' }}>
          {layers.length} {layers.length === 1 ? 'instrumento' : 'instrumentos'}
        </span>
        {layers.length > 3 && (
          <span
            className="text-[9px] font-semibold"
            style={{ color: '#FFB74D' }}
            title="Como no MainStage: cada channel strip usa processamento; acima de três o patch pode pesar ao vivo."
          >
            ⚠ acima de 3 pode pesar
          </span>
        )}
        {picker && (() => {
          const isLayerPicker = picker.kind === 'layer' || picker.kind === 'replace';
          const list = isLayerPicker ? instruments : scannedPlugins;
          const title = picker.kind === 'replace'
            ? `Trocar VST de ${picker.assignment.name}`
            : isLayerPicker
              ? 'Carregar instrumento'
              : `Channel strip do ${picker.level === 'concert' ? 'concert' : 'set'}`;
          return (
            <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border p-2 shadow-2xl" style={{ background: '#2C2C2E', borderColor: '#36363D' }}>
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="hw-label">{title}</span>
                <button className="px-1 text-xs text-slate-400" onClick={() => setPicker(null)}>✕</button>
              </div>
              {list.length === 0 ? (
                <div className="p-2 text-[11px]" style={{ color: '#9A9AA0' }}>
                  {scanning ? 'Escaneando VST3…' : isLayerPicker ? 'Nenhum instrumento encontrado.' : 'Nenhum plugin encontrado.'}
                  {!scanning && <button className="ml-1 underline" onClick={() => { setScanning(true); void onRequestScan().finally(() => setScanning(false)); }}>Escanear</button>}
                </div>
              ) : list.map((plugin) => (
                <button
                  key={plugin.id}
                  disabled={busy}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-white/10 disabled:opacity-50"
                  onClick={() => void withLoadingMessage(async () => {
                    const added = picker.kind === 'replace'
                      ? await onReplace(picker.assignment, picker.layerId, plugin)
                      : picker.kind === 'layer'
                        ? await onAdd(plugin)
                        : await onAddStrip(picker.level, plugin);
                    if (added) setPicker(null);
                    return added;
                  })}
                  title={`${plugin.name} — ${plugin.path}`}
                >
                  {plugin.isInstrument ? '♪ ' : 'FX '}{plugin.name}
                </button>
              ))}
            </div>
          );
        })()}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loadingMessage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#2F5E99', background: '#14243A', color: '#CFE5FF' }}>
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#0A84FF' }} />
            {loadingMessage}
          </div>
        )}
        <div className="flex min-h-full items-stretch gap-2">
          {renderPlayback()}
          {renderAudioInput()}
          {renderInheritedGroup('concert', concertStrips)}
          {setName !== null && renderInheritedGroup('set', setStrips)}
          {layers.map(({ assignment, layerId, index }) => {
            const loaded = loadedPlugins.find((plugin) => plugin.layerId === layerId);
            const liveMix = mixState?.layers.find((state) => state.layerId === layerId);
            const mix = liveMix ?? {
              volumeDb: assignment.mix?.volumeDb ?? 0,
              pan: assignment.mix?.pan ?? 0,
              muted: assignment.mix?.muted ?? false,
              solo: assignment.mix?.solo ?? false,
              peakDb: -100,
              output: assignment.output ?? 1,
              sends: assignment.sends ?? Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB),
            };
            const meterPercent = Math.max(0, Math.min(100, ((mix.peakDb + 60) / 60) * 100));
            const isSelected = selectedLayer?.layerId === layerId;
            return (
              <section
                key={layerId}
                className="flex w-[148px] shrink-0 flex-col rounded-xl p-2"
                style={{
                  border: `1px solid ${isSelected ? '#0A84FF' : '#3A3A3C'}`,
                  background: 'linear-gradient(to bottom, #232326, #2C2C2E)',
                }}
                onClick={() => setSelectedLayerId(layerId)}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 border-b pb-1.5 text-left"
                  style={{ borderColor: '#3A3A3C', cursor: editable ? 'pointer' : 'default' }}
                  title={editable ? 'Trocar VST deste channel strip' : assignment.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedLayerId(layerId);
                    if (editable) openPicker({ kind: 'replace', assignment, layerId });
                  }}
                >
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#0A84FF', color: '#FFFFFF' }}>INST</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">{assignment.name}</span>
                  {editable && <span style={{ color: '#9A9AA0' }}>▾</span>}
                </button>
                <div className="hw-inset mt-2 px-1.5 py-1 text-[9px]" style={{ color: '#9A9AA0' }}>
                  Insert: {loaded ? 'VST3' : 'Carregando…'}
                </div>
                <button
                  className="mt-1 w-full rounded px-1 py-1 text-[9px] font-semibold disabled:opacity-40"
                  style={{ background: '#3A3A3C', color: '#E5E5EA' }}
                  disabled={!loaded}
                  title="Abrir/fechar a janela do plugin (V)"
                  onClick={(event) => { event.stopPropagation(); onOpenEditor?.(layerId); }}
                >
                  Editor (V)
                </button>
                {renderFader({
                  label: assignment.name,
                  peakDb: mix.peakDb,
                  volumeDb: mix.volumeDb,
                  pan: mix.pan,
                  muted: mix.muted,
                  solo: mix.solo,
                  disabled: !loaded,
                  onMix: (update) => onSetLayerMix(layerId, update),
                })}
                {renderInserts({
                  ownerId: layerId,
                  inserts: assignment.inserts ?? [],
                  onToggleBypass: (id, targetSlot, bypass) => void onToggleInsertBypass(id, targetSlot, bypass),
                  onRemove: (id, targetSlot) => void onRemoveInsert(id, targetSlot),
                  onOpenEditor: onOpenInsertEditor,
                  onRequestInsert: (slot) => openInsertPicker(
                    `Carregar efeito em ${assignment.name}`,
                    slot,
                    (plugin) => onAddInsert(layerId, slot, plugin)
                  ),
                })}
                {renderSends({
                  label: assignment.name,
                  sends: mix.sends ?? [],
                  output: mix.output ?? 1,
                  disabled: !editable || !loaded,
                  onSend: (aux, levelDb) => onSetSend(layerId, aux, levelDb),
                  onOutput: (output) => onSetLayerOutput(layerId, output),
                })}
                <div className="min-h-0 flex-1 space-y-2 overflow-auto py-1">
                  {loaded?.parameters.slice(0, 4).map((parameter) => (
                    <label key={parameter.id} className="block text-[9px]" style={{ color: '#9A9AA0' }}>
                      <span className="flex justify-between"><span className="truncate">{parameter.name}</span><span>{parameter.value.toFixed(2)}</span></span>
                      <input
                        type="range"
                        min={parameter.minValue}
                        max={parameter.maxValue}
                        step={(parameter.maxValue - parameter.minValue) / 100}
                        value={parameter.value}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onSetParameter(layerId, parameter.id, Number(event.target.value))}
                        className="w-full"
                        style={{ accentColor: '#0A84FF' }}
                      />
                      {learningParameter && loaded && (
                        <button
                          className="mt-0.5 w-full rounded px-1 py-0.5 text-[8px] font-semibold"
                          style={{ background: '#FF9F0A', color: '#1A1A1A' }}
                          onClick={(event) => {
                            event.stopPropagation();
                            learnParameter(loaded.path, parameter.id);
                          }}
                        >
                          Mapear este parâmetro
                        </button>
                      )}
                    </label>
                  ))}
                </div>
                <div className="mt-1 flex gap-1 border-t pt-1.5" style={{ borderColor: '#3A3A3C' }}>
                  <button
                    className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
                    disabled={!editable || busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void withLoadingMessage(() => onCopy(assignment, layerId));
                    }}
                    title="Copiar channel strip"
                  >
                    Copiar
                  </button>
                  <button
                    className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
                    disabled={!editable || busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onRemove(assignment, layerId);
                    }}
                    title="Remover channel strip"
                  >
                    Remover
                  </button>
                </div>
              </section>
            );
          })}
          {busSettings && (
            <>
              <button
                type="button"
                className="hw-squarebtn flex h-[72px] w-[88px] shrink-0 items-center justify-center self-start rounded-xl px-2 text-[10px] font-semibold disabled:opacity-40"
                disabled={!editable || visibleAux.length >= MAX_AUX_BUSES}
                onClick={onAddAux}
                title="Criar um novo Aux"
              >
                ＋ Aux
              </button>
              {visibleAux.map(({ bus, index }) =>
                renderBusStrip(`aux${index}`, `Aux ${index}`, 'aux', bus)
              )}
              {busSettings.outputs.slice(0, MAX_OUTPUT_BUSES).map((bus, index) =>
                renderBusStrip(`output${index + 1}`, `Output ${index + 1}`, 'output', bus)
              )}
            </>
          )}
          <div className="hw-inset sticky right-0 z-10 flex w-[132px] shrink-0 flex-col rounded-xl p-2" style={{ background: '#1F1F21' }}>
            <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
              <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#0A84FF', color: '#FFFFFF' }}>OUT</span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">Master</span>
            </div>
            <span className="hw-label mt-2" style={{ fontSize: 8 }}>OUTPUT 1-2</span>
            {(() => {
              const master = mixState?.master ?? {
                volumeDb: preset?.masterMix?.volumeDb ?? 0,
                muted: preset?.masterMix?.muted ?? false,
                peakDb: -100,
              };
              const meterPercent = Math.max(0, Math.min(100, ((master.peakDb + 60) / 60) * 100));
              return (
                <>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <div className="relative h-28 w-2 overflow-hidden rounded-sm bg-black/70" role="meter" aria-label="Master peak" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, master.peakDb)}>
                      <div className="absolute bottom-0 w-full" style={{ height: `${meterPercent}%`, background: meterPercent > 90 ? '#FF554D' : '#30D158' }} />
                    </div>
                    <div className="flex h-28 flex-col items-center justify-between">
                      <span className="text-[8px]" style={{ color: '#C6C6CB' }}>{master.volumeDb.toFixed(1)} dB</span>
                      <input
                        aria-label="Volume Master"
                        type="range"
                        min={-60}
                        max={6}
                        step={0.1}
                        value={master.volumeDb}
                        disabled={loadedPlugins.length === 0}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onSetMasterMix({ volumeDb: Number(event.target.value) })}
                        className="h-20 w-4"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
                      />
                      <span className="text-[8px]" style={{ color: '#8E8E93' }}>−60</span>
                    </div>
                  </div>
                  <button
                    className="hw-squarebtn mt-2 w-full px-1 py-1 text-[9px]"
                    aria-pressed={master.muted}
                    disabled={loadedPlugins.length === 0}
                    onClick={(event) => { event.stopPropagation(); onSetMasterMix({ muted: !master.muted }); }}
                    style={master.muted ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
                  >MUTE MASTER</button>
                </>
              );
            })()}
            <div className="hw-inset mt-2 px-1.5 py-1 text-[9px]" style={{ color: '#9A9AA0' }}>
              {layers.length} layer(s) · Saídas somadas
            </div>
            <button
              className="hw-squarebtn mt-auto w-full px-2 py-2 text-[10px] disabled:opacity-40"
              disabled={!canAdd || busy}
              onClick={() => openPicker({ kind: 'layer' })}
              title={!editable ? 'Edite ou crie um patch para carregar instrumentos' : 'Carregar instrumento VST'}
            >
              {busy ? 'Carregando…' : '＋ Carregar VST'}
            </button>
          </div>
        </div>
      </div>
      {insertPicker && (
        <div className="absolute bottom-2 left-2 right-2 z-40 max-h-64 overflow-y-auto rounded-xl border p-2 shadow-2xl" style={{ background: '#2C2C2E', borderColor: '#36363D' }}>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="hw-label">{insertPicker.title} — slot {insertPicker.slot + 1}</span>
            <button className="px-1 text-xs text-slate-400" onClick={() => setInsertPicker(null)}>✕</button>
          </div>
          {effects.length === 0 ? (
            <div className="p-2 text-[11px]" style={{ color: '#9A9AA0' }}>
              {scanning ? 'Escaneando VST3…' : 'Nenhum efeito encontrado.'}
              {!scanning && <button className="ml-1 underline" onClick={() => { setScanning(true); void onRequestScan().finally(() => setScanning(false)); }}>Escanear</button>}
            </div>
          ) : effects.map((plugin) => (
            <button
              key={plugin.id}
              disabled={busy}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-white/10 disabled:opacity-50"
              title={plugin.path}
              onClick={() => {
                const current = insertPicker;
                setInsertPicker(null);
                void (async () => {
                  setBusy(true);
                  try {
                    const added = await current.pick(plugin);
                    if (!added) setInsertPicker(current);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {plugin.name}
            </button>
          ))}
        </div>
      )}
      <div className="px-2 py-1 text-[9px]" style={{ borderTop: '1px solid #3A3A3C', color: '#9A9AA0' }}>
        Nos strips do patch, use a aba Channel Strip do Inspector para as teclas (Low/High Key); nos strips do concert/set, edite KEY aqui mesmo.
      </div>
    </aside>
  );
};
