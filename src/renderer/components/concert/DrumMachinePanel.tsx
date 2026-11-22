import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DrumPadSource,
  EngineDrumPattern,
  EngineDrumStep,
  EngineDrumsState,
  EngineDrumTrack,
} from '@shared/types';
import {
  FACTORY_DRUM_PATTERNS,
  findFactoryDrumPattern,
  type DrumFactoryPattern,
} from '@shared/drum-patterns';

interface DrumMachinePanelProps {
  layerId: string;
  /** Play/Stop do concert, para o botão de transporte da janela. */
  isPlaying?: boolean;
  onToggleTransport?: () => void;
}

type StepsPerBar = 8 | 12 | 16 | 32;
type Bars = 1 | 2 | 4;

interface UiStep {
  on: boolean;
  velocity: number;
}

interface UiTrack {
  pad: number;
  mute: boolean;
  level: number;
  steps: UiStep[];
}

interface UiPattern {
  stepsPerBar: StepsPerBar;
  bars: Bars;
  swing: number;
  tracks: UiTrack[];
}

const PAD_NAMES = [
  'Bumbo', 'Aro', 'Caixa', 'Palmas',
  'Caixa elétrica', 'Tom baixo', 'Chimbal fechado', 'Tom de chão',
  'Chimbal com pedal', 'Tom médio-baixo', 'Chimbal aberto', 'Tom médio',
  'Tom médio-alto', 'Prato de ataque', 'Tom alto', 'Condução',
];

const FIRST_PAD_NOTE = 36;

const clampStepsPerBar = (value: number): StepsPerBar =>
  value === 8 || value === 12 || value === 32 ? value : 16;

const clampBars = (value: number): Bars => (value === 2 ? 2 : value === 4 ? 4 : 1);

const makeStep = (): UiStep => ({ on: false, velocity: 100 });

const makeTrack = (pad: number, totalSteps: number): UiTrack => ({
  pad,
  mute: false,
  level: 0,
  steps: Array.from({ length: totalSteps }, makeStep),
});

const patternFromInfo = (info: EngineDrumsState | null): UiPattern => {
  const stepsPerBar = clampStepsPerBar(info?.stepsPerBar ?? 16);
  const bars = clampBars(info?.bars ?? 1);
  const total = stepsPerBar * bars;
  const tracks = Array.from({ length: 16 }, (_, pad) => makeTrack(pad, total));

  for (const track of info?.tracks ?? []) {
    if (track.pad < 0 || track.pad >= tracks.length) continue;
    const target = tracks[track.pad];
    target.mute = track.mute;
    target.level = track.level;
    track.steps.slice(0, total).forEach((step, index) => {
      target.steps[index] = { on: step.on, velocity: step.velocity };
    });
  }

  for (const pad of info?.pads ?? []) {
    if (pad.index < 0 || pad.index >= tracks.length) continue;
    // O padrão manda no volume/mudo; o pad só completa quando não há trilha.
    if (!info?.tracks?.some((track) => track.pad === pad.index)) {
      tracks[pad.index].level = pad.levelDb;
      tracks[pad.index].mute = pad.muted;
    }
  }

  return { stepsPerBar, bars, swing: info?.swing ?? 0, tracks };
};

const clonePattern = (pattern: UiPattern): UiPattern => ({
  ...pattern,
  tracks: pattern.tracks.map((track) => ({
    ...track,
    steps: track.steps.map((step) => ({ ...step })),
  })),
});

const patternFromFactory = (factory: DrumFactoryPattern): UiPattern => {
  const total = factory.stepsPerBar * factory.bars;
  const tracks = Array.from({ length: 16 }, (_, pad) => makeTrack(pad, total));

  for (const source of factory.tracks) {
    if (source.pad < 0 || source.pad >= tracks.length) continue;
    const target = tracks[source.pad];
    source.steps.slice(0, total).forEach((velocity, index) => {
      if (velocity > 0) {
        target.steps[index] = { on: true, velocity: Math.min(127, Math.max(1, velocity)) };
      }
    });
  }

  return {
    stepsPerBar: factory.stepsPerBar,
    bars: factory.bars,
    swing: factory.swing,
    tracks,
  };
};

const toEnginePattern = (pattern: UiPattern): EngineDrumPattern => {
  const tracks: EngineDrumTrack[] = pattern.tracks.map((track) => ({
    pad: track.pad,
    mute: track.mute,
    level: track.level,
    steps: track.steps.map<EngineDrumStep>((step) => ({
      on: step.on,
      velocity: step.velocity,
    })),
  }));

  return {
    stepsPerBar: pattern.stepsPerBar,
    bars: pattern.bars,
    swing: pattern.swing,
    tracks,
  };
};

const dbLabel = (value: number) => (value > -60 ? `${value > 0 ? '+' : ''}${Math.round(value)} dB` : '−∞');

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

interface PadEditorState {
  pad: number;
  path: string;
  bank: number;
  program: number;
  note: number;
}

export const DrumMachinePanel: React.FC<DrumMachinePanelProps> = ({
  layerId,
  isPlaying = false,
  onToggleTransport,
}) => {
  const [pattern, setPattern] = useState<UiPattern>(() => patternFromInfo(null));
  const [enabled, setEnabled] = useState(false);
  const [gainDb, setGainDb] = useState(0);
  const [soloPad, setSoloPad] = useState(-1);
  const [selectedFactory, setSelectedFactory] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState<EngineDrumsState | null>(null);
  const [kit, setKit] = useState('');
  const [kitPath, setKitPath] = useState('');
  const [kitBank, setKitBank] = useState(128);
  const [kitProgram, setKitProgram] = useState(0);
  const [padEditor, setPadEditor] = useState<PadEditorState | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState({ pad: 0, step: 0 });

  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const patternTimer = useRef<number | null>(null);
  const pendingPattern = useRef<UiPattern | null>(null);
  const gainTimer = useRef<number | null>(null);
  const pendingGain = useRef<number | null>(null);
  const drag = useRef<{
    pad: number;
    step: number;
    startY: number;
    baseVelocity: number;
    basePattern: UiPattern;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const applyInfo = useCallback((next: EngineDrumsState | null) => {
    setInfo(next);
    if (!next) return;
    setEnabled(Boolean(next.enabled));
    setGainDb(next.gainDb ?? 0);
    setSoloPad(next.pads?.find((pad) => pad.solo)?.index ?? -1);
    setKit(next.kit ?? '');
    setKitPath(next.kitPath ?? '');
    setKitBank(next.kitBank ?? 128);
    setKitProgram(next.kitProgram ?? 0);
  }, []);

  const send = useCallback(async (payload: {
    enabled?: boolean;
    pattern?: EngineDrumPattern;
    gainDb?: number;
    soloPad?: number;
  }) => {
    try {
      await window.electronAPI.drumsSet(layerId, payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao enviar o padrão.');
    }
  }, [layerId]);

  const flushPattern = useCallback(() => {
    if (patternTimer.current !== null) {
      window.clearTimeout(patternTimer.current);
      patternTimer.current = null;
    }
    const pending = pendingPattern.current;
    pendingPattern.current = null;
    if (pending) void send({ pattern: toEnginePattern(pending) });
  }, [send]);

  const queuePattern = useCallback((next: UiPattern) => {
    setPattern(next);
    pendingPattern.current = next;
    if (patternTimer.current !== null) window.clearTimeout(patternTimer.current);
    patternTimer.current = window.setTimeout(() => {
      patternTimer.current = null;
      const pending = pendingPattern.current;
      pendingPattern.current = null;
      if (pending) void send({ pattern: toEnginePattern(pending) });
    }, 120);
  }, [send]);

  const applyPattern = useCallback((next: UiPattern) => {
    setPattern(next);
    if (patternTimer.current !== null) {
      window.clearTimeout(patternTimer.current);
      patternTimer.current = null;
    }
    pendingPattern.current = null;
    void send({ pattern: toEnginePattern(next) });
  }, [send]);

  const markCustom = useCallback(() => {
    setSelectedFactory('');
  }, []);

  const loadFactory = (id: string) => {
    setSelectedFactory(id);
    const factory = findFactoryDrumPattern(id);
    if (!factory) return;
    applyPattern(patternFromFactory(factory));
    setNotice(`Padrão "${factory.name}" carregado`);
  };

  const queueGain = useCallback((value: number) => {
    setGainDb(value);
    pendingGain.current = value;
    if (gainTimer.current !== null) window.clearTimeout(gainTimer.current);
    gainTimer.current = window.setTimeout(() => {
      gainTimer.current = null;
      const pending = pendingGain.current;
      pendingGain.current = null;
      if (pending !== null) void send({ gainDb: pending });
    }, 120);
  }, [send]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);

    void (async () => {
      try {
        const info = await window.electronAPI.drumsInfo(layerId);
        if (cancelled) return;
        setPattern(patternFromInfo(info));
        applyInfo(info);
        setLoaded(true);
        setError(info?.kit ? null : 'Nenhum kit carregado neste instrumento.');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Falha ao ler o padrão.');
        setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [applyInfo, layerId]);

  // Indicador do passo atual: consulta leve (~16 Hz), sem trazer o padrão inteiro.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const position = await window.electronAPI.drumsPosition(layerId);
        if (!cancelled) setCurrentStep(position?.currentStep ?? -1);
      } catch {
        /* o indicador é só informativo */
      }
    };
    void tick();
    const timer = window.setInterval(tick, 60);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [layerId]);

  useEffect(() => () => {
    if (patternTimer.current !== null) window.clearTimeout(patternTimer.current);
    if (gainTimer.current !== null) window.clearTimeout(gainTimer.current);
  }, []);

  const totalSteps = pattern.stepsPerBar * pattern.bars;

  const focusCell = (pad: number, step: number) => {
    const nextPad = Math.max(0, Math.min(15, pad));
    const nextStep = Math.max(0, Math.min(totalSteps - 1, step));
    setActiveCell({ pad: nextPad, step: nextStep });
    const target = cellRefs.current[`${nextPad}:${nextStep}`];
    if (target) target.focus();
  };

  const toggleStep = (pad: number, step: number) => {
    markCustom();
    const next = clonePattern(pattern);
    const target = next.tracks[pad]?.steps[step];
    if (!target) return;
    target.on = !target.on;
    if (target.on && target.velocity <= 0) target.velocity = 100;
    applyPattern(next);
  };

  const setStepVelocity = (pad: number, step: number, velocity: number, source?: UiPattern) => {
    markCustom();
    const next = clonePattern(source ?? pattern);
    const target = next.tracks[pad]?.steps[step];
    if (!target) return;
    target.on = true;
    target.velocity = Math.max(1, Math.min(127, Math.round(velocity)));
    queuePattern(next);
  };

  const changeStepsPerBar = (value: StepsPerBar) => {
    markCustom();
    const total = value * pattern.bars;
    const next: UiPattern = {
      ...pattern,
      stepsPerBar: value,
      tracks: pattern.tracks.map((track) => ({
        ...track,
        steps: Array.from({ length: total }, (_, index) => track.steps[index] ?? makeStep()),
      })),
    };
    applyPattern(next);
  };

  const changeBars = (value: Bars) => {
    markCustom();
    const total = pattern.stepsPerBar * value;
    const next: UiPattern = {
      ...pattern,
      bars: value,
      tracks: pattern.tracks.map((track) => ({
        ...track,
        steps: Array.from({ length: total }, (_, index) => track.steps[index] ?? makeStep()),
      })),
    };
    applyPattern(next);
  };

  const toggleMute = (pad: number) => {
    markCustom();
    const next = clonePattern(pattern);
    next.tracks[pad].mute = !next.tracks[pad].mute;
    applyPattern(next);
  };

  const toggleSolo = (pad: number) => {
    const next = soloPad === pad ? -1 : pad;
    setSoloPad(next);
    void send({ soloPad: next });
  };

  const setPadLevel = (pad: number, level: number) => {
    markCustom();
    const next = clonePattern(pattern);
    next.tracks[pad].level = Math.max(-60, Math.min(12, level));
    queuePattern(next);
  };

  const preview = (pad: number) => {
    void window.electronAPI.engineMidi([0x90, FIRST_PAD_NOTE + pad, 100]);
  };

  const clearPattern = () => {
    markCustom();
    const next = clonePattern(pattern);
    for (const track of next.tracks) track.steps = track.steps.map(makeStep);
    applyPattern(next);
    setNotice('Padrão limpo');
  };

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    void send({ enabled: next });
  };

  const toggleTransport = () => {
    if (!onToggleTransport) return;
    // Tocar na janela do Drums já liga o sequenciador: o Play é o gesto de
    // ouvir o padrão, como numa drum machine.
    if (!isPlaying && !enabled) {
      setEnabled(true);
      void send({ enabled: true });
    }
    onToggleTransport();
  };

  const pickKit = async () => {
    try {
      const path = await window.electronAPI.drumsPickFile();
      if (!path) return;
      setSampleBusy(true);
      const next = await window.electronAPI.drumsLoadKit(layerId, path, kitBank, kitProgram);
      applyInfo(next);
      setNotice(`Kit carregado: ${fileName(path)}`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o kit.');
    } finally {
      setSampleBusy(false);
    }
  };

  const applyKitProgram = async () => {
    if (!kitPath) {
      setError('Escolha um arquivo de kit antes de aplicar banco/programa.');
      return;
    }
    try {
      setSampleBusy(true);
      const next = await window.electronAPI.drumsLoadKit(layerId, kitPath, kitBank, kitProgram);
      applyInfo(next);
      setNotice(`Kit: banco ${kitBank} / programa ${kitProgram}`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao aplicar o kit.');
    } finally {
      setSampleBusy(false);
    }
  };

  const openPadEditor = (pad: number) => {
    const source = info?.pads?.find((item) => item.index === pad)?.source ?? null;
    setPadEditor({
      pad,
      path: source?.path ?? '',
      bank: source?.bank ?? 128,
      program: source?.program ?? 0,
      note: source?.note ?? FIRST_PAD_NOTE + pad,
    });
  };

  const pickPadFile = async () => {
    if (!padEditor) return;
    try {
      const path = await window.electronAPI.drumsPickFile();
      if (!path) return;
      setPadEditor({ ...padEditor, path });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao escolher o sample.');
    }
  };

  const applyPadSource = async (useKit: boolean) => {
    if (!padEditor) return;
    try {
      setSampleBusy(true);
      const result = useKit || !padEditor.path
        ? await window.electronAPI.drumsSetPadSource(layerId, padEditor.pad, null)
        : await window.electronAPI.drumsSetPadSource(layerId, padEditor.pad, {
            path: padEditor.path,
            bank: padEditor.bank,
            program: padEditor.program,
            note: padEditor.note,
          } satisfies DrumPadSource);
      applyInfo(result);
      setNotice(useKit || !padEditor.path
        ? `${PAD_NAMES[padEditor.pad]} voltou ao kit`
        : `${PAD_NAMES[padEditor.pad]}: ${fileName(padEditor.path)}`);
      setPadEditor(null);
      setError(null);
      if (!useKit) void window.electronAPI.engineMidi([0x90, FIRST_PAD_NOTE + padEditor.pad, 100]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o sample do pad.');
    } finally {
      setSampleBusy(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, pad: number, step: number) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); focusCell(pad - 1, step); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); focusCell(pad + 1, step); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusCell(pad, step - 1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); focusCell(pad, step + 1); return; }
    if (event.key === 'Home') { event.preventDefault(); focusCell(pad, 0); return; }
    if (event.key === 'End') { event.preventDefault(); focusCell(pad, totalSteps - 1); return; }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggleStep(pad, step);
    }
  };

  const padSourceFor = (pad: number): DrumPadSource | null =>
    info?.pads?.find((item) => item.index === pad)?.source ?? null;

  const stepGroups = useMemo(() => Math.max(1, Math.round(pattern.stepsPerBar / 4)), [pattern.stepsPerBar]);
  const factoryPattern = useMemo(() => findFactoryDrumPattern(selectedFactory), [selectedFactory]);

  if (!loaded) {
    return (
      <div className="hw-inset p-4 text-[11px]" style={{ color: '#9A9AA0' }}>
        Carregando o Preseter Drums…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="hw-inset p-3">
        <div className="hw-label mb-2">Sequenciador</div>
        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            className="px-3 py-1 text-[11px]"
            aria-label={isPlaying ? 'Parar' : 'Tocar'}
            disabled={!onToggleTransport}
            onClick={toggleTransport}
            style={{
              background: isPlaying ? '#FF453A' : '#30D158',
              color: '#FFFFFF',
              border: '1px solid #3A3A3C',
              borderRadius: 6,
              opacity: onToggleTransport ? 1 : 0.5,
            }}
          >
            {isPlaying ? '■ Parar' : '▶ Tocar'}
          </button>

          <button
            type="button"
            className="hw-button px-3 py-1 text-[11px]"
            aria-pressed={enabled}
            aria-label={`Sequenciador ${enabled ? 'ligado' : 'desligado'}`}
            onClick={toggleEnabled}
            style={{
              background: enabled ? '#0A84FF' : '#2C2C2E',
              color: enabled ? '#FFFFFF' : '#EDEDEF',
              border: '1px solid #3A3A3C',
              borderRadius: 6,
            }}
          >
            {enabled ? 'Ligado' : 'Desligado'}
          </button>

          <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Resolução
            <select
              aria-label="Resolução"
              value={pattern.stepsPerBar}
              onChange={(event) => changeStepsPerBar(Number(event.target.value) as StepsPerBar)}
              className="rounded px-2 py-1 text-[11px]"
              style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            >
              {[8, 12, 16, 32].map((steps) => (
                <option key={steps} value={steps}>{steps} passos</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Compassos
            <select
              aria-label="Compassos"
              value={pattern.bars}
              onChange={(event) => changeBars(Number(event.target.value) as Bars)}
              className="rounded px-2 py-1 text-[11px]"
              style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            >
              {[1, 2, 4].map((bars) => (
                <option key={bars} value={bars}>{bars}</option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[140px] flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Padrão de fábrica
            <select
              aria-label="Padrão de fábrica"
              value={selectedFactory}
              onChange={(event) => loadFactory(event.target.value)}
              className="rounded px-2 py-1 text-[11px]"
              style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            >
              <option value="">Personalizado</option>
              {FACTORY_DRUM_PATTERNS.map((factory) => (
                <option key={factory.id} value={factory.id}>{factory.name}</option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[150px] flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            <span>Swing · {Math.round(pattern.swing)}%</span>
            <input
              aria-label="Swing"
              type="range"
              min={0}
              max={75}
              step={1}
              value={pattern.swing}
              onChange={(event) => {
                markCustom();
                const value = Number(event.target.value);
                const next = { ...pattern, swing: value };
                setPattern(next);
                queuePattern(next);
              }}
            />
          </label>

          <label className="flex min-w-[150px] flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            <span>Volume geral · {dbLabel(gainDb)}</span>
            <input
              aria-label="Volume geral"
              type="range"
              min={-60}
              max={12}
              step={1}
              value={gainDb}
              onChange={(event) => queueGain(Number(event.target.value))}
            />
          </label>

          <button
            type="button"
            className="px-3 py-1 text-[11px]"
            onClick={clearPattern}
            style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C', borderRadius: 6 }}
          >
            Limpar padrão
          </button>

          <span className="ml-auto max-w-[420px] truncate text-[10px]" style={{ color: error ? '#FF8A8A' : '#8E8E93' }}>
            {error ?? notice ?? (kit || `${pattern.stepsPerBar} passos × ${pattern.bars} compasso(s)`)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3" style={{ borderColor: '#2C2C2E' }}>
          <span className="min-w-0 flex-1 truncate text-[10px]" title={kitPath || kit} style={{ color: '#9A9AA0' }}>
            <span className="hw-label mr-2">Kit</span>
            {kit || 'Nenhum kit carregado'}
          </span>
          <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Banco
            <input
              aria-label="Banco do kit"
              type="number"
              min={0}
              max={128}
              value={kitBank}
              onChange={(event) => setKitBank(Math.max(0, Math.min(128, Number(event.target.value))))}
              className="w-[64px] rounded px-2 py-1 text-[11px]"
              style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Programa
            <input
              aria-label="Programa do kit"
              type="number"
              min={0}
              max={127}
              value={kitProgram}
              onChange={(event) => setKitProgram(Math.max(0, Math.min(127, Number(event.target.value))))}
              className="w-[64px] rounded px-2 py-1 text-[11px]"
              style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            />
          </label>
          <button
            type="button"
            className="px-3 py-1 text-[11px]"
            onClick={() => void applyKitProgram()}
            disabled={sampleBusy || !kitPath}
            style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C', borderRadius: 6, opacity: kitPath ? 1 : 0.5 }}
          >
            Aplicar
          </button>
          <button
            type="button"
            className="hw-button px-3 py-1 text-[11px]"
            onClick={() => void pickKit()}
            disabled={sampleBusy}
          >
            Trocar kit (SF2/SFZ)…
          </button>
        </div>

        {factoryPattern && (
          <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
            {factoryPattern.description}
          </p>
        )}
      </section>

      <section className="hw-inset p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="hw-label">Grade de passos</div>
          <div className="text-[10px]" style={{ color: enabled ? '#0A84FF' : '#8E8E93' }}>
            {enabled ? `Passo ${currentStep >= 0 ? currentStep + 1 : '—'} de ${totalSteps}` : 'Parado'}
          </div>
        </div>

        <div className="overflow-x-auto" role="grid" aria-label="Grade de passos">
          <div className="min-w-max">
            {pattern.tracks.map((track) => (
              <div key={track.pad} className="flex items-stretch gap-1" role="row">
                <div
                  className="flex w-[190px] shrink-0 items-center gap-1 py-[2px]"
                  style={{ borderTop: '1px solid #2C2C2E' }}
                >
                  <button
                    type="button"
                    aria-label={`Pré-ouvir ${PAD_NAMES[track.pad]} (nota ${FIRST_PAD_NOTE + track.pad})`}
                    title={`Nota ${FIRST_PAD_NOTE + track.pad}`}
                    data-testid={`pad-${track.pad}`}
                    onPointerDown={() => preview(track.pad)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        preview(track.pad);
                      }
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[10px]"
                    style={{ color: track.mute ? '#6E6E73' : '#EDEDEF' }}
                  >
                    {PAD_NAMES[track.pad]}
                  </button>
                  <input
                    aria-label={`Volume ${PAD_NAMES[track.pad]}`}
                    type="range"
                    min={-60}
                    max={12}
                    step={1}
                    value={track.level}
                    onChange={(event) => setPadLevel(track.pad, Number(event.target.value))}
                    className="w-[54px]"
                  />
                  <button
                    type="button"
                    aria-label={`Mudo ${PAD_NAMES[track.pad]}`}
                    aria-pressed={track.mute}
                    onClick={() => toggleMute(track.pad)}
                    className="h-4 w-4 rounded text-[8px]"
                    style={{
                      background: track.mute ? '#FF453A' : '#2C2C2E',
                      color: track.mute ? '#FFFFFF' : '#9A9AA0',
                      border: '1px solid #3A3A3C',
                    }}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    aria-label={`Solo ${PAD_NAMES[track.pad]}`}
                    aria-pressed={soloPad === track.pad}
                    onClick={() => toggleSolo(track.pad)}
                    className="h-4 w-4 rounded text-[8px]"
                    style={{
                      background: soloPad === track.pad ? '#FFD60A' : '#2C2C2E',
                      color: soloPad === track.pad ? '#1C1C1E' : '#9A9AA0',
                      border: '1px solid #3A3A3C',
                    }}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    aria-label={`Sample de ${PAD_NAMES[track.pad]}`}
                    title={padSourceFor(track.pad)
                      ? `Sample: ${fileName(padSourceFor(track.pad)!.path)} · nota ${padSourceFor(track.pad)!.note}`
                      : 'Escolher SF2/SFZ só para este pad'}
                    onClick={() => openPadEditor(track.pad)}
                    className="h-4 w-5 rounded text-[9px]"
                    style={{
                      background: padSourceFor(track.pad) ? '#0A84FF' : '#2C2C2E',
                      color: padSourceFor(track.pad) ? '#FFFFFF' : '#9A9AA0',
                      border: '1px solid #3A3A3C',
                    }}
                  >
                    …
                  </button>
                </div>

                <div className="flex gap-[2px]">
                  {track.steps.map((step, index) => {
                    const isCurrent = enabled && currentStep === index;
                    const beatStart = index % stepGroups === 0;
                    const strength = step.on ? 0.42 + (step.velocity / 127) * 0.58 : 0;
                    return (
                      <button
                        key={index}
                        type="button"
                        ref={(element) => { cellRefs.current[`${track.pad}:${index}`] = element; }}
                        data-testid={`step-${track.pad}-${index}`}
                        aria-label={`${PAD_NAMES[track.pad]} passo ${index + 1}`}
                        aria-pressed={step.on}
                        data-current={isCurrent ? 'true' : undefined}
                        data-velocity={step.velocity}
                        title={`Passo ${index + 1} · velocity ${step.velocity}`}
                        tabIndex={activeCell.pad === track.pad && activeCell.step === index ? 0 : -1}
                        onFocus={() => setActiveCell({ pad: track.pad, step: index })}
                        onKeyDown={(event) => handleKeyDown(event, track.pad, index)}
                        onClick={() => {
                          if (suppressClick.current) { suppressClick.current = false; return; }
                          toggleStep(track.pad, index);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setStepVelocity(track.pad, index, 127);
                        }}
                        onDoubleClick={() => setStepVelocity(track.pad, index, 127)}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          drag.current = {
                            pad: track.pad,
                            step: index,
                            startY: event.clientY,
                            baseVelocity: step.velocity,
                            basePattern: clonePattern(pattern),
                            moved: false,
                          };
                        }}
                        onPointerMove={(event) => {
                          const current = drag.current;
                          if (!current || current.pad !== track.pad || current.step !== index) return;
                          const delta = current.startY - event.clientY;
                          if (!current.moved && Math.abs(delta) < 4) return;
                          current.moved = true;
                          setStepVelocity(track.pad, index, current.baseVelocity + delta * 2, current.basePattern);
                        }}
                        onPointerUp={() => {
                          const current = drag.current;
                          drag.current = null;
                          if (!current) return;
                          if (current.moved) {
                            suppressClick.current = true;
                            flushPattern();
                          }
                        }}
                        style={{
                          width: 18,
                          height: 22,
                          borderRadius: 3,
                          border: isCurrent ? '1px solid #64D2FF' : '1px solid #2C2C2E',
                          borderLeft: beatStart ? '2px solid #48484A' : undefined,
                          background: step.on
                            ? `rgba(10, 132, 255, ${strength.toFixed(2)})`
                            : '#232325',
                          boxShadow: isCurrent ? '0 0 6px rgba(100, 210, 255, 0.55)' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-2 text-[9px]" style={{ color: '#8E8E93' }}>
          Clique liga/desliga. Arraste na vertical para a velocity, clique direito (ou duplo) para
          acento. Setas movem, espaço/Enter alterna. O botão … de cada linha escolhe um SF2/SFZ só
          para aquele pad; sem sample próprio, ele toca o kit do layer.
        </p>
      </section>

      {padEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.65)' }}
          role="dialog"
          aria-label={`Sample de ${PAD_NAMES[padEditor.pad]}`}
        >
          <div
            className="w-[440px] space-y-3 rounded-lg p-4"
            style={{ background: '#1C1C1E', border: '1px solid #3A3A3C' }}
          >
            <div className="flex items-center justify-between">
              <span className="hw-label">Sample do pad</span>
              <span className="text-[11px]" style={{ color: '#EDEDEF' }}>
                {PAD_NAMES[padEditor.pad]} · nota do kit {FIRST_PAD_NOTE + padEditor.pad}
              </span>
            </div>

            <p className="text-[10px]" style={{ color: '#9A9AA0' }}>
              Escolha um arquivo SF2/SFZ e a nota que ele deve tocar neste pad. Sem arquivo
              próprio, o pad usa o kit do layer.
            </p>

            <div className="flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-[10px]"
                title={padEditor.path || 'Kit do layer'}
                style={{ color: padEditor.path ? '#64D2FF' : '#8E8E93' }}
              >
                {padEditor.path ? fileName(padEditor.path) : 'Kit do layer'}
              </span>
              <button
                type="button"
                className="hw-button px-3 py-1 text-[11px]"
                onClick={() => void pickPadFile()}
                disabled={sampleBusy}
              >
                Escolher SF2/SFZ…
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
                Nota
                <input
                  aria-label="Nota do sample"
                  type="number"
                  min={0}
                  max={127}
                  value={padEditor.note}
                  onChange={(event) => setPadEditor({
                    ...padEditor,
                    note: Math.max(0, Math.min(127, Number(event.target.value))),
                  })}
                  className="w-[64px] rounded px-2 py-1 text-[11px]"
                  style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
                Banco
                <input
                  aria-label="Banco do sample"
                  type="number"
                  min={0}
                  max={128}
                  value={padEditor.bank}
                  onChange={(event) => setPadEditor({
                    ...padEditor,
                    bank: Math.max(0, Math.min(128, Number(event.target.value))),
                  })}
                  className="w-[64px] rounded px-2 py-1 text-[11px]"
                  style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px]" style={{ color: '#9A9AA0' }}>
                Programa
                <input
                  aria-label="Programa do sample"
                  type="number"
                  min={0}
                  max={127}
                  value={padEditor.program}
                  onChange={(event) => setPadEditor({
                    ...padEditor,
                    program: Math.max(0, Math.min(127, Number(event.target.value))),
                  })}
                  className="w-[64px] rounded px-2 py-1 text-[11px]"
                  style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="px-3 py-1 text-[11px]"
                onClick={() => void applyPadSource(true)}
                disabled={sampleBusy}
                style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C', borderRadius: 6 }}
              >
                Usar kit
              </button>
              <button
                type="button"
                className="px-3 py-1 text-[11px]"
                onClick={() => setPadEditor(null)}
                disabled={sampleBusy}
                style={{ background: '#2C2C2E', color: '#EDEDEF', border: '1px solid #3A3A3C', borderRadius: 6 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1 text-[11px]"
                onClick={() => void applyPadSource(false)}
                disabled={sampleBusy || !padEditor.path}
                style={{
                  background: padEditor.path ? '#0A84FF' : '#2C2C2E',
                  color: '#FFFFFF',
                  border: '1px solid #3A3A3C',
                  borderRadius: 6,
                  opacity: padEditor.path ? 1 : 0.5,
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
