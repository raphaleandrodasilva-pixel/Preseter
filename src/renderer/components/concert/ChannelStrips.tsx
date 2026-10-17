import React, { useEffect, useRef, useState } from 'react';
import type {
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  Preset,
  PresetPluginAssignment,
  VstPluginInfo,
} from '@shared/types';

interface ChannelStripsProps {
  preset: Preset | null;
  editable: boolean;
  scannedPlugins: VstPluginInfo[];
  loadedPlugins: VstPluginInfo[];
  mixState: EngineMixState | null;
  onRequestScan: () => Promise<unknown>;
  onAdd: (plugin: VstPluginInfo) => Promise<boolean>;
  onRemove: (assignment: PresetPluginAssignment, layerId: string) => Promise<void>;
  onCopy: (assignment: PresetPluginAssignment, layerId: string) => Promise<boolean>;
  onRangeChange: (assignment: PresetPluginAssignment, layerId: string, minNote: number, maxNote: number) => void;
  onSetParameter: (layerId: string, parameterId: string, value: number) => void;
  onSetLayerMix: (layerId: string, update: LayerMixUpdate) => void;
  onSetMasterMix: (update: MasterMixUpdate) => void;
}

const midiNoteName = (note: number) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
};

const layerIdFor = (preset: Preset, assignment: PresetPluginAssignment, index: number) =>
  assignment.layerId ?? `${preset.id}:layer:${index}`;

const RangeEditor: React.FC<{
  minNote: number;
  maxNote: number;
  disabled: boolean;
  onChange: (minimum: number, maximum: number) => void;
}> = ({ minNote, maxNote, disabled, onChange }) => {
  const [range, setRange] = useState({ min: minNote, max: maxNote });
  const rangeRef = useRef(range);
  const dragEdge = useRef<'min' | 'max' | null>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = { min: minNote, max: maxNote };
    rangeRef.current = next;
    setRange(next);
  }, [minNote, maxNote]);

  const updateRange = (update: (current: typeof range) => typeof range) => {
    const next = update(rangeRef.current);
    rangeRef.current = next;
    setRange(next);
  };

  const noteAt = (clientX: number) => {
    const bounds = keyboardRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return 0;
    return Math.max(0, Math.min(127, Math.round(((clientX - bounds.left) / bounds.width) * 127)));
  };
  const updateFromPointer = (clientX: number) => {
    const note = noteAt(clientX);
    updateRange((previous) => {
      if (dragEdge.current === 'min') return { min: Math.min(note, previous.max), max: previous.max };
      return { min: previous.min, max: Math.max(note, previous.min) };
    });
  };
  const finishDrag = () => {
    if (!dragEdge.current) return;
    dragEdge.current = null;
    onChange(rangeRef.current.min, rangeRef.current.max);
  };
  const setMinimum = (value: number) => {
    const min = Math.max(0, Math.min(127, Math.min(value, rangeRef.current.max)));
    const next = { min, max: rangeRef.current.max };
    rangeRef.current = next;
    setRange(next);
    onChange(next.min, next.max);
  };
  const setMaximum = (value: number) => {
    const max = Math.max(0, Math.min(127, Math.max(value, rangeRef.current.min)));
    const next = { min: rangeRef.current.min, max };
    rangeRef.current = next;
    setRange(next);
    onChange(next.min, next.max);
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex justify-between text-[9px] uppercase tracking-wide" style={{ color: '#9A9AA0' }}>
        <span>Região MIDI</span>
        <span>{midiNoteName(range.min)}–{midiNoteName(range.max)}</span>
      </div>
      <div
        ref={keyboardRef}
        className="relative flex h-7 touch-none select-none overflow-hidden rounded border"
        style={{ borderColor: '#424249' }}
        title="Arraste para ajustar os limites da região"
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const note = noteAt(event.clientX);
          dragEdge.current = Math.abs(note - range.min) <= Math.abs(note - range.max) ? 'min' : 'max';
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!disabled && dragEdge.current) updateFromPointer(event.clientX);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {Array.from({ length: 128 }, (_, note) => {
          const black = [1, 3, 6, 8, 10].includes(note % 12);
          const inRange = note >= range.min && note <= range.max;
          return (
            <div
              key={note}
              className="h-full flex-1"
              style={{
                minWidth: 0,
                background: inRange
                  ? (black ? '#13933F' : '#0A84FF')
                  : (black ? '#29292E' : '#D7D7D8'),
                borderRight: note % 12 === 0 ? '1px solid rgba(0,0,0,0.35)' : undefined,
              }}
            />
          );
        })}
        <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-white" style={{ left: `${(range.min / 127) * 100}%` }} />
        <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-white" style={{ left: `${(range.max / 127) * 100}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="text-[9px]" style={{ color: '#9A9AA0' }}>
          De
          <input
            aria-label="Nota inicial do layer"
            type="number"
            min={0}
            max={127}
            disabled={disabled}
            value={range.min}
            onChange={(event) => setMinimum(Number(event.target.value))}
            className="hw-inset mt-0.5 w-full px-1.5 py-1 text-[10px] text-white"
          />
        </label>
        <label className="text-[9px]" style={{ color: '#9A9AA0' }}>
          Até
          <input
            aria-label="Nota final do layer"
            type="number"
            min={0}
            max={127}
            disabled={disabled}
            value={range.max}
            onChange={(event) => setMaximum(Number(event.target.value))}
            className="hw-inset mt-0.5 w-full px-1.5 py-1 text-[10px] text-white"
          />
        </label>
      </div>
    </div>
  );
};

export const ChannelStrips: React.FC<ChannelStripsProps> = ({
  preset,
  editable,
  scannedPlugins,
  loadedPlugins,
  mixState,
  onRequestScan,
  onAdd,
  onRemove,
  onCopy,
  onRangeChange,
  onSetParameter,
  onSetLayerMix,
  onSetMasterMix,
}) => {
  const plugins = preset?.plugins ?? [];
  const instruments = scannedPlugins.filter((plugin) => plugin.isInstrument);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
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
  const canAdd = editable && layers.length < 4;

  useEffect(() => {
    if (selectedLayerId && !layers.some((layer) => layer.layerId === selectedLayerId)) {
      setSelectedLayerId(layers[0]?.layerId ?? null);
    }
  }, [selectedLayerId, layers]);

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

  const openPicker = () => {
    setPickerOpen(true);
    if (instruments.length === 0 && !scanning) {
      setScanning(true);
      void onRequestScan().finally(() => setScanning(false));
    }
  };

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
        <span className="text-[9px]" style={{ color: '#8E8E93' }}>{layers.length} / 4 instrumentos</span>
        {pickerOpen && (
          <div className="absolute bottom-2 right-2 z-30 mb-10 max-h-64 w-64 overflow-y-auto rounded-xl border p-2 shadow-2xl" style={{ background: '#2C2C2E', borderColor: '#36363D' }}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="hw-label">Carregar instrumento</span>
              <button className="px-1 text-xs text-slate-400" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            {instruments.length === 0 ? (
              <div className="p-2 text-[11px]" style={{ color: '#9A9AA0' }}>
                {scanning ? 'Escaneando VST3…' : 'Nenhum instrumento encontrado.'}
                {!scanning && <button className="ml-1 underline" onClick={() => { setScanning(true); void onRequestScan().finally(() => setScanning(false)); }}>Escanear</button>}
              </div>
            ) : instruments.map((plugin) => (
              <button
                key={plugin.id}
                disabled={busy}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-white/10 disabled:opacity-50"
                onClick={() => void withLoadingMessage(async () => {
                  const added = await onAdd(plugin);
                  if (added) setPickerOpen(false);
                  return added;
                })}
                title={plugin.path}
              >
                {plugin.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loadingMessage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#2F5E99', background: '#14243A', color: '#CFE5FF' }}>
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#0A84FF' }} />
            {loadingMessage}
          </div>
        )}
        <div className="flex min-h-full items-stretch gap-2">
          {layers.map(({ assignment, layerId, index }) => {
            const loaded = loadedPlugins.find((plugin) => plugin.layerId === layerId);
            const liveMix = mixState?.layers.find((state) => state.layerId === layerId);
            const mix = liveMix ?? {
              volumeDb: assignment.mix?.volumeDb ?? 0,
              pan: assignment.mix?.pan ?? 0,
              muted: assignment.mix?.muted ?? false,
              solo: assignment.mix?.solo ?? false,
              peakDb: -100,
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
                <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#0A84FF', color: '#FFFFFF' }}>INST</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white" title={assignment.name}>{assignment.name}</span>
                </div>
                <span className="hw-label mt-1" style={{ fontSize: 8 }}>SOFTWARE INSTRUMENT {index + 1}</span>
                <RangeEditor
                  minNote={assignment.minNote ?? 0}
                  maxNote={assignment.maxNote ?? 127}
                  disabled={!editable}
                  onChange={(minimum, maximum) => onRangeChange(assignment, layerId, minimum, maximum)}
                />
                <div className="hw-inset mt-2 px-1.5 py-1 text-[9px]" style={{ color: '#9A9AA0' }}>
                  Insert: {loaded ? 'VST3' : 'Carregando…'}
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className="relative h-28 w-2 overflow-hidden rounded-sm bg-black/70" role="meter" aria-label={`${assignment.name} peak`} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, mix.peakDb)}>
                    <div className="absolute bottom-0 w-full" style={{ height: `${meterPercent}%`, background: meterPercent > 90 ? '#FF554D' : '#30D158' }} />
                  </div>
                  <div className="flex h-28 flex-col items-center justify-between">
                    <span className="text-[8px]" style={{ color: '#C6C6CB' }}>{mix.volumeDb.toFixed(1)} dB</span>
                    <input
                      aria-label={`Volume de ${assignment.name}`}
                      type="range"
                      min={-60}
                      max={6}
                      step={0.1}
                      value={mix.volumeDb}
                      disabled={!loaded}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onSetLayerMix(layerId, { volumeDb: Number(event.target.value) })}
                      className="h-20 w-4"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
                    />
                    <span className="text-[8px]" style={{ color: '#8E8E93' }}>−60</span>
                  </div>
                </div>
                <label className="mt-2 block text-[8px]" style={{ color: '#9A9AA0' }}>
                  PAN <span className="float-right">{mix.pan === 0 ? 'C' : mix.pan < 0 ? `L ${Math.round(-mix.pan * 100)}` : `R ${Math.round(mix.pan * 100)}`}</span>
                  <input
                    aria-label={`Pan de ${assignment.name}`}
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={mix.pan}
                    disabled={!loaded}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onSetLayerMix(layerId, { pan: Number(event.target.value) })}
                    className="w-full"
                    style={{ accentColor: '#0A84FF' }}
                  />
                </label>
                <div className="mt-1 flex gap-1">
                  <button
                    className="hw-squarebtn flex-1 px-1 py-1 text-[9px]"
                    aria-pressed={mix.muted}
                    disabled={!loaded}
                    onClick={(event) => { event.stopPropagation(); onSetLayerMix(layerId, { muted: !mix.muted }); }}
                    style={mix.muted ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
                  >MUTE</button>
                  <button
                    className="hw-squarebtn flex-1 px-1 py-1 text-[9px]"
                    aria-pressed={mix.solo}
                    disabled={!loaded}
                    onClick={(event) => { event.stopPropagation(); onSetLayerMix(layerId, { solo: !mix.solo }); }}
                    style={mix.solo ? { color: '#FFFFFF', background: '#0A84FF' } : undefined}
                  >SOLO</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[8px]" style={{ color: '#8E8E93' }}>
                  <div className="hw-inset py-1">FX · indisponível</div>
                  <div className="hw-inset py-1">SEND · indisponível</div>
                </div>
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
                    </label>
                  ))}
                </div>
                <div className="mt-1 flex gap-1 border-t pt-1.5" style={{ borderColor: '#3A3A3C' }}>
                  <button
                    className="hw-squarebtn flex-1 px-1 py-1 text-[9px] disabled:opacity-40"
                    disabled={!editable || busy || layers.length >= 4}
                    onClick={(event) => {
                      event.stopPropagation();
                      void withLoadingMessage(() => onCopy(assignment, layerId));
                    }}
                    title={layers.length >= 4 ? 'Limite de quatro instrumentos' : 'Copiar channel strip'}
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
              onClick={openPicker}
              title={!editable ? 'Edite ou crie um patch para carregar instrumentos' : layers.length >= 4 ? 'Limite de quatro instrumentos por patch' : 'Carregar instrumento VST'}
            >
              {busy ? 'Carregando…' : '＋ Carregar VST'}
            </button>
          </div>
        </div>
      </div>
      <div className="px-2 py-1 text-[9px]" style={{ borderTop: '1px solid #3A3A3C', color: '#9A9AA0' }}>
        Regiões MIDI aplicadas ao teclado e às entradas MIDI externas.
      </div>
    </aside>
  );
};
