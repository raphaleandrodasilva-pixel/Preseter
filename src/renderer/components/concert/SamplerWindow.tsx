import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PresetPluginAssignment } from '@shared/types';
import { SEND_OFF_DB } from '@shared/types';
import type { EngineParameter } from '@shared/engine-protocol';
import { useAppContext } from '../../context/AppContext';

interface SamplerRegion {
  keyLow: number;
  keyHigh: number;
  velLow: number;
  velHigh: number;
  rootKey: number;
  loop: boolean;
  start: number;
  end: number;
  sampleRate: number;
  gain: number;
  label: string;
}

interface SamplerPreset {
  name: string;
  bank: number;
  program: number;
  regions: number;
}

interface SamplerInfo {
  format?: string;
  name?: string;
  program?: number;
  programName?: string;
  regions?: SamplerRegion[];
  missing?: string;
  file?: string;
  fileSize?: number;
  voices?: number;
  maxVoices?: number;
  presetList?: SamplerPreset[];
}

interface SamplerWindowProps {
  assignment: PresetPluginAssignment;
  layerId: string;
  activeNotes: Set<number>;
  onClose: () => void;
  onUpdate: (patch: Partial<PresetPluginAssignment>) => void;
  onOpenStore: () => void;
  onUseInPatch: () => void | Promise<void>;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const POLYPHONY_CHOICES = [8, 16, 32, 64, 128, 256];
const noteName = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
const isBlack = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function licenseFor(file: string): { license: string; attribution: string } {
  const lower = file.toLowerCase();
  if (lower.includes('musescore')) return { license: 'MIT', attribution: 'MuseScore_General — S. Christian Collins' };
  if (lower.includes('sonatina')) return { license: 'CC Sampling Plus 1.0', attribution: 'Sonatina Symphonic Orchestra — Mattias Westlund' };
  if (lower.includes('salamander')) return { license: 'CC BY 3.0', attribution: 'Salamander Grand Piano — Alexander Holm' };
  return { license: 'Verificar na origem', attribution: 'Biblioteca externa' };
}

function normalizeFor(min: number, max: number, value: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const RECENT_KEY = 'preseter.sampler.recent.v1';
const FAVORITE_KEY = 'preseter.sampler.favorites.v1';

interface RecentEntry {
  file: string;
  name: string;
  program: number;
}

function readList(key: string): RecentEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.file === 'string') : [];
  } catch {
    return [];
  }
}

export const SamplerWindow: React.FC<SamplerWindowProps> = ({
  assignment,
  layerId,
  activeNotes,
  onClose,
  onUpdate,
  onOpenStore,
  onUseInPatch,
}) => {
  const { getVstParameters, setVstParameter, setVstLayerMix, setVstSend } = useAppContext();
  const [info, setInfo] = useState<SamplerInfo | null>(null);
  const [params, setParams] = useState<EngineParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pan, setPan] = useState(assignment.mix?.pan ?? 0);
  const [reverbDb, setReverbDb] = useState(assignment.sends?.[0] ?? SEND_OFF_DB);
  const [recents, setRecents] = useState<RecentEntry[]>(() => readList(RECENT_KEY));
  const [favorites, setFavorites] = useState<RecentEntry[]>(() => readList(FAVORITE_KEY));
  const [tab, setTab] = useState<'instrumentos' | 'favoritos' | 'recentes'>('instrumentos');
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState({ x: 80, y: 80, w: 1080, h: 760 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const width = Math.min(1080, window.innerWidth - 48);
    const height = Math.min(760, window.innerHeight - 48);
    setBox({
      x: Math.max(24, Math.round((window.innerWidth - width) / 2)),
      y: Math.max(24, Math.round((window.innerHeight - height) / 2)),
      w: width,
      h: height,
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,select,textarea')) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rawInfo, rawParams] = await Promise.all([
        window.electronAPI.samplerInfo(layerId) as Promise<SamplerInfo>,
        getVstParameters(layerId),
      ]);
      setInfo(rawInfo ?? null);
      setParams(rawParams ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao ler o instrumento.');
    } finally {
      setLoading(false);
    }
  }, [getVstParameters, layerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const file = info?.file || assignment.samplePath || '';
  const fileName = file.split(/[\\/]/).pop() ?? '—';
  const license = licenseFor(file);
  const regions = info?.regions ?? [];
  const presets = info?.presetList ?? [];

  const zoneLow = useMemo(
    () => (regions.length ? Math.min(...regions.map((region) => region.keyLow)) : assignment.minNote ?? 0),
    [regions, assignment.minNote]
  );
  const zoneHigh = useMemo(
    () => (regions.length ? Math.max(...regions.map((region) => region.keyHigh)) : assignment.maxNote ?? 127),
    [regions, assignment.maxNote]
  );

  const filteredPresets = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term ? presets.filter((preset) => preset.name.toLowerCase().includes(term)) : presets;
    return list.slice(0, 400).map((preset) => ({ ...preset, index: presets.indexOf(preset) }));
  }, [presets, search]);

  const presetGroups = useMemo(() => {
    const groups = new Map<number, typeof filteredPresets>();
    for (const preset of filteredPresets) {
      const list = groups.get(preset.bank) ?? [];
      list.push(preset);
      groups.set(preset.bank, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [filteredPresets]);

  useEffect(() => setCursor(0), [search]);

  const param = useCallback(
    (name: string) => params.find((item) => item.name.toLowerCase() === name.toLowerCase()),
    [params]
  );

  const setParam = useCallback(
    async (name: string, value: number) => {
      const target = param(name);
      if (!target) return;
      await setVstParameter(layerId, String(target.index), value);
      setParams((previous) =>
        previous.map((item) => (item.index === target.index ? { ...item, value } : item))
      );
    },
    [layerId, param, setVstParameter]
  );

  const polyphonyParam = param('Vozes');
  const polyphonyIndex = polyphonyParam
    ? Math.round(polyphonyParam.value * (POLYPHONY_CHOICES.length - 1))
    : POLYPHONY_CHOICES.indexOf(
        assignment.sampler?.polyphony ?? info?.maxVoices ?? 64
      );
  const polyphonyValue =
    POLYPHONY_CHOICES[Math.max(0, Math.min(POLYPHONY_CHOICES.length - 1, polyphonyIndex))];

  const changePolyphony = async (value: number) => {
    const choice = POLYPHONY_CHOICES.indexOf(value);
    if (choice < 0) return;
    await setParam('Vozes', choice / (POLYPHONY_CHOICES.length - 1));
    onUpdate({
      sampler: {
        ...(assignment.sampler ?? {}),
        polyphony: value,
      },
    });
    setInfo((previous) => (previous ? { ...previous, maxVoices: value } : previous));
  };

  const loadPreset = useCallback(
    async (index: number) => {
      try {
        await window.electronAPI.vstSetProgram(layerId, index);
        await refresh();
        const entry = { file, name: presets[index]?.name ?? info?.name ?? fileName, program: index };
        const next = [entry, ...recents.filter((item) => !(item.file === file && item.program === index))].slice(0, 12);
        setRecents(next);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        onUpdate({ programIndex: presets[index]?.program ?? index, bank: presets[index]?.bank ?? 0 });
        setNotice(`Instrumento: ${presets[index]?.name ?? ''}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao trocar o instrumento.');
      }
    },
    [file, fileName, info?.name, layerId, onUpdate, presets, recents, refresh]
  );

  const reloadFile = useCallback(
    async (path: string, program = 0) => {
      try {
        setLoading(true);
        await window.electronAPI.samplerReload(layerId, path, {
          loop: assignment.sampler?.loop ?? true,
          polyphony: assignment.sampler?.polyphony ?? 64,
          programIndex: program,
          bank: 0,
        });
        onUpdate({ samplePath: path, programIndex: program, bank: 0 });
        await refresh();
        setNotice('Arquivo carregado.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar o arquivo.');
      } finally {
        setLoading(false);
      }
    },
    [assignment.sampler?.loop, assignment.sampler?.polyphony, layerId, onUpdate, refresh]
  );

  const openFile = async () => {
    const path = await window.electronAPI.samplerPickFile();
    if (path) await reloadFile(path);
  };

  const toggleFavorite = () => {
    const key = `${file}|${info?.program ?? 0}`;
    const exists = favorites.some((item) => `${item.file}|${item.program}` === key);
    const next = exists
      ? favorites.filter((item) => `${item.file}|${item.program}` !== key)
      : [{ file, name: info?.programName ?? info?.name ?? fileName, program: info?.program ?? 0 }, ...favorites].slice(0, 24);
    setFavorites(next);
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  };

  const isFavorite = favorites.some((item) => `${item.file}|${item.program}` === `${file}|${info?.program ?? 0}`);
  const currentPreset = info?.programName ?? info?.name ?? fileName;

  const keys: Array<{ note: number; black: boolean; left: number; width: number }> = [];
  {
    const low = 36;
    const high = 96;
    let whiteIndex = 0;
    const whiteWidth = 100 / 36; // 3 oitavas + notas finais
    const totalWhites = Array.from({ length: high - low + 1 }, (_, index) => low + index).filter((note) => !isBlack(note)).length;
    const width = 100 / totalWhites;
    void whiteWidth;
    for (let note = low; note <= high; note += 1) {
      if (isBlack(note)) continue;
      keys.push({ note, black: false, left: whiteIndex * width, width });
      whiteIndex += 1;
    }
    for (let note = low; note <= high; note += 1) {
      if (!isBlack(note)) continue;
      const whitesBefore = Array.from({ length: note - low }, (_, index) => low + index).filter((item) => !isBlack(item)).length;
      keys.push({ note, black: true, left: whitesBefore * width - width * 0.32, width: width * 0.64 });
    }
  }

  const renderControl = (
    label: string,
    paramName: string,
    min: number,
    max: number,
    display: (value: number) => string,
    fallback?: number
  ) => {
    const target = param(paramName);
    const normalized = target?.value ?? normalizeFor(min, max, fallback ?? 0);
    const physical = min + normalized * (max - min);
    return (
      <div key={label} className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-2 py-2" style={{ background: '#232325', border: '1px solid #3A3A3C' }}>
        <span className="truncate text-[9px] uppercase tracking-wide" style={{ color: '#8E8E93' }}>{label}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={normalized}
          disabled={!target}
          aria-label={label}
          onChange={(event) => void setParam(paramName, Number(event.target.value))}
          className="h-1 w-full"
          style={{ accentColor: '#0A84FF' }}
        />
        <span className="text-[10px] font-semibold text-white">{display(physical)}</span>
      </div>
    );
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          background: '#1C1C1E',
          border: '1px solid #3A3A3C',
        }}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md text-[12px] hover:bg-white/10"
          style={{ color: '#8E8E93' }}
          onClick={onClose}
          aria-label="Fechar janela"
          title="Fechar (Esc)"
        >
          ✕
        </button>
        {/* Cabeçalho */}
        <header
          className="flex flex-wrap items-center gap-2 py-3 pl-4 pr-12"
          style={{ borderBottom: '1px solid #3A3A3C', cursor: 'move', touchAction: 'none' }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button,input,select,textarea')) return;
            dragRef.current = { dx: event.clientX - box.x, dy: event.clientY - box.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            setBox((current) => ({
              ...current,
              x: Math.max(-current.w + 120, Math.min(window.innerWidth - 120, event.clientX - drag.dx)),
              y: Math.max(0, Math.min(window.innerHeight - 48, event.clientY - drag.dy)),
            }));
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <span className="text-sm font-semibold text-white">Leitor de Samples</span>
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: 'rgba(10,132,255,0.2)', color: '#7FB6FF' }}>
              {info?.format ?? '—'}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[11px] text-white">{fileName}</div>
              <div className="truncate text-[9px]" style={{ color: '#8E8E93' }}>
                {file || 'Nenhum arquivo'} · {formatBytes(info?.fileSize ?? 0)}
              </div>
            </div>
          </div>
          <button type="button" className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{ background: '#2C2C2E', color: '#E5E5EA', border: '1px solid #3A3A3C' }} onClick={() => void openFile()}>
            Abrir arquivo…
          </button>
          <button type="button" className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{ background: '#2C2C2E', color: '#E5E5EA', border: '1px solid #3A3A3C' }} onClick={onOpenStore}>
            Abrir da Loja
          </button>
          <button type="button" className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{ background: '#0A84FF', color: '#FFFFFF' }} onClick={onUseInPatch}>
            Usar meu patch
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Coluna esquerda */}
          <aside className="flex w-[260px] shrink-0 flex-col" style={{ borderRight: '1px solid #3A3A3C' }}>
            <div className="p-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                    return;
                  }
                  if (tab !== 'instrumentos' || filteredPresets.length === 0) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCursor((current) => Math.min(filteredPresets.length - 1, current + 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCursor((current) => Math.max(0, current - 1));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const preset = filteredPresets[Math.min(cursor, filteredPresets.length - 1)];
                    if (preset) void loadPreset(preset.index);
                  }
                }}
                placeholder="Buscar instrumento…"
                className="w-full rounded-lg px-2 py-1.5 text-[11px] text-white outline-none"
                style={{ background: '#2C2C2E', border: '1px solid #3A3A3C' }}
              />
              {tab === 'instrumentos' && filteredPresets.length > 0 && (
                <div className="mt-1 truncate text-[9px]" style={{ color: '#6E6E73' }}>
                  {filteredPresets[Math.min(cursor, filteredPresets.length - 1)]?.name}
                </div>
              )}
            </div>
            <div className="flex gap-1 px-2 pb-2">
              {(['instrumentos', 'favoritos', 'recentes'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className="flex-1 rounded px-1 py-1 text-[9px] font-semibold capitalize"
                  style={tab === item ? { background: '#0A84FF', color: '#fff' } : { background: '#2C2C2E', color: '#C6C6CB' }}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {tab === 'instrumentos' && presetGroups.map(([bank, group]) => (
                <div key={bank}>
                  <div className="sticky top-0 z-10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide" style={{ background: '#1C1C1E', color: '#6E6E73' }}>
                    Banco {bank} · {group.length} instrumento(s)
                  </div>
                  {group.map((preset) => {
                    const flatIndex = filteredPresets.indexOf(preset);
                    const active = preset.name === currentPreset;
                    return (
                    <button
                      key={`${preset.bank}-${preset.program}-${preset.index}`}
                      type="button"
                      onClick={() => void loadPreset(preset.index)}
                      onMouseEnter={() => setCursor(flatIndex)}
                      className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10"
                      style={{
                        color: active ? '#7FB6FF' : '#C6C6CB',
                        background: flatIndex === cursor ? 'rgba(255,255,255,0.07)' : 'transparent',
                      }}
                    >
                      <span className="block truncate">{preset.name}</span>
                      <span className="text-[9px]" style={{ color: '#8E8E93' }}>Prog {preset.program} · {preset.regions} reg.</span>
                    </button>
                    );
                  })}
                </div>
              ))}
              {tab === 'favoritos' && (favorites.length === 0 ? (
                <p className="px-2 py-2 text-[10px]" style={{ color: '#8E8E93' }}>Nenhum favorito ainda.</p>
              ) : favorites.map((entry) => (
                <button key={`${entry.file}-${entry.program}`} type="button" className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10" style={{ color: '#C6C6CB' }} onClick={() => void reloadFile(entry.file, entry.program)}>
                  <span className="block truncate">{entry.name}</span>
                  <span className="text-[9px]" style={{ color: '#8E8E93' }}>{entry.file.split(/[\\/]/).pop()}</span>
                </button>
              )))}
              {tab === 'recentes' && (recents.length === 0 ? (
                <p className="px-2 py-2 text-[10px]" style={{ color: '#8E8E93' }}>Nada recente.</p>
              ) : recents.map((entry) => (
                <button key={`${entry.file}-${entry.program}-${entry.name}`} type="button" className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10" style={{ color: '#C6C6CB' }} onClick={() => void reloadFile(entry.file, entry.program)}>
                  <span className="block truncate">{entry.name}</span>
                  <span className="text-[9px]" style={{ color: '#8E8E93' }}>{entry.file.split(/[\\/]/).pop()}</span>
                </button>
              )))}
            </div>
            <div className="px-2 py-2 text-[9px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
              ↑↓ navegar · Enter carregar · Esc fechar
            </div>
          </aside>

          {/* Centro */}
          <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-white">{currentPreset}</h3>
                <p className="text-[10px]" style={{ color: '#8E8E93' }}>
                  {info?.format} · Banco {presets[info?.program ?? 0]?.bank ?? 0} · Programa {presets[info?.program ?? 0]?.program ?? 0}
                  {' '}· {regions.length} regiões · {info?.presetList?.length ?? 0} instrumentos
                </p>
              </div>
              <button
                type="button"
                onClick={toggleFavorite}
                className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                style={{ background: '#2C2C2E', color: isFavorite ? '#FFD60A' : '#C6C6CB', border: '1px solid #3A3A3C' }}
                title="Favoritar"
              >
                {isFavorite ? '★ Favorito' : '☆ Favoritar'}
              </button>
            </div>

            {/* Teclado */}
            <section className="rounded-lg p-2" style={{ background: '#232325', border: '1px solid #3A3A3C' }}>
              <div className="mb-1 flex items-center justify-between text-[9px]" style={{ color: '#8E8E93' }}>
                <span>Zona de teclas {noteName(zoneLow)}–{noteName(zoneHigh)} · {activeNotes.size} nota(s) ativa(s)</span>
                <span>{assignment.minNote ?? 0}–{assignment.maxNote ?? 127}</span>
              </div>
              <div className="relative h-[86px] w-full select-none">
                {keys.filter((key) => !key.black).map((key) => {
                  const inZone = key.note >= (assignment.minNote ?? 0) && key.note <= (assignment.maxNote ?? 127);
                  const active = activeNotes.has(key.note);
                  return (
                    <div
                      key={key.note}
                      className="absolute bottom-0 top-0 rounded-b"
                      style={{
                        left: `${key.left}%`,
                        width: `${key.width}%`,
                        background: active ? '#0A84FF' : inZone ? '#E9E9EE' : '#B9B9BF',
                        border: '1px solid #1C1C1E',
                        opacity: inZone ? 1 : 0.55,
                      }}
                    >
                      {key.note % 12 === 0 && (
                        <span className="absolute bottom-1 left-1 text-[7px]" style={{ color: '#3A3A3C' }}>{noteName(key.note)}</span>
                      )}
                    </div>
                  );
                })}
                {keys.filter((key) => key.black).map((key) => {
                  const inZone = key.note >= (assignment.minNote ?? 0) && key.note <= (assignment.maxNote ?? 127);
                  const active = activeNotes.has(key.note);
                  return (
                    <div
                      key={key.note}
                      className="absolute top-0 h-[58%] rounded-b"
                      style={{
                        left: `${key.left}%`,
                        width: `${key.width}%`,
                        background: active ? '#0A84FF' : '#111113',
                        border: '1px solid #000',
                        opacity: inZone ? 1 : 0.5,
                      }}
                    />
                  );
                })}
              </div>
            </section>

            {/* Controles */}
            <section className="flex flex-wrap gap-2">
              {renderControl('Volume', 'Ganho', -24, 12, (value) => `${value.toFixed(1)} dB`)}
              <div className="flex min-w-[110px] flex-1 flex-col gap-1 rounded-lg px-2 py-2" style={{ background: '#232325', border: '1px solid #3A3A3C' }}>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: '#8E8E93' }}>Pan</span>
                <input type="range" min={-1} max={1} step={0.01} value={pan} aria-label="Pan" onChange={(event) => { const value = Number(event.target.value); setPan(value); void setVstLayerMix(layerId, { pan: value }); onUpdate({ mix: { volumeDb: 0, muted: false, solo: false, ...(assignment.mix ?? {}), pan: value } }); }} className="h-1 w-full" style={{ accentColor: '#0A84FF' }} />
                <span className="text-[10px] font-semibold text-white">{pan === 0 ? 'C' : `${Math.round(pan * 100)}`}</span>
              </div>
              <div className="flex min-w-[110px] flex-1 flex-col gap-1 rounded-lg px-2 py-2" style={{ background: '#232325', border: '1px solid #3A3A3C' }}>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: '#8E8E93' }}>Polifonia</span>
                <select
                  aria-label="Polifonia"
                  value={polyphonyValue}
                  onChange={(event) => void changePolyphony(Number(event.target.value))}
                  className="hw-inset w-full px-1 py-0.5 text-[10px] text-white outline-none"
                >
                  {POLYPHONY_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>{choice} vozes</option>
                  ))}
                </select>
                <span className="text-[10px] font-semibold text-white">
                  {info?.voices ?? 0}/{polyphonyValue}
                </span>
              </div>
              {renderControl('Ataque', 'Ataque', 0, 2, (value) => `${value.toFixed(2)} s`)}
              {renderControl('Release', 'Release', 0, 5, (value) => `${value.toFixed(2)} s`)}
              <div className="flex min-w-[110px] flex-1 flex-col gap-1 rounded-lg px-2 py-2" style={{ background: '#232325', border: '1px solid #3A3A3C' }}>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: '#8E8E93' }}>Reverb</span>
                <input type="range" min={-60} max={0} step={0.5} value={reverbDb} aria-label="Reverb" onChange={(event) => { const value = Number(event.target.value); setReverbDb(value); void setVstSend(layerId, 1, value); onUpdate({ sends: [value, ...(assignment.sends ?? []).slice(1)] }); }} className="h-1 w-full" style={{ accentColor: '#0A84FF' }} />
                <span className="text-[10px] font-semibold text-white">{reverbDb <= SEND_OFF_DB ? 'Off' : `${reverbDb.toFixed(1)} dB`}</span>
              </div>
              {renderControl('Sustain', 'Sustain', 0, 1, (value) => `${Math.round(value * 100)}%`)}
            </section>

            {/* Licença */}
            <section className="rounded-lg px-3 py-2 text-[10px]" style={{ background: '#232325', border: '1px solid #3A3A3C', color: '#C6C6CB' }}>
              <div className="font-semibold text-white">Licença e origem</div>
              <div>{license.license} · {license.attribution}</div>
              <div className="mt-1 break-all" style={{ color: '#8E8E93' }}>{file || '—'}</div>
              {info?.missing ? (
                <div className="mt-1" style={{ color: '#FF9F0A' }}>Samples faltando: {info.missing}</div>
              ) : null}
            </section>

            {notice && <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#12301E', color: '#8FE3A8' }}>{notice}</div>}
            {error && <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>{error}</div>}
          </main>
        </div>

        {/* Rodapé */}
        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
          <span style={{ color: loading ? '#FFD60A' : '#30D158' }}>{loading ? '● Carregando' : '● Carregado'}</span>
          <span>RAM ≈ {formatBytes(info?.fileSize ?? 0)}</span>
          <span>Vozes {info?.voices ?? 0}/{info?.maxVoices ?? 64}</span>
          <span>Motor: Preseter Sampler ({info?.format ?? '—'})</span>
          <span className="ml-auto truncate">{file.split(/[\\/]/).slice(-2).join(' / ')}</span>
        </footer>
        <div
          title="Redimensionar"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            resizeRef.current = { x: event.clientX, y: event.clientY, w: box.w, h: box.h };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = resizeRef.current;
            if (!start) return;
            setBox((current) => ({
              ...current,
              w: Math.max(720, Math.min(window.innerWidth - current.x, start.w + event.clientX - start.x)),
              h: Math.max(480, Math.min(window.innerHeight - current.y, start.h + event.clientY - start.y)),
            }));
          }}
          onPointerUp={() => { resizeRef.current = null; }}
          onPointerCancel={() => { resizeRef.current = null; }}
        >
          <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden="true">
            <path d="M15 9L9 15M15 13L13 15M15 5L5 15" stroke="#6E6E73" strokeWidth="1" fill="none" />
          </svg>
        </div>
      </div>
    </div>
  );
};
