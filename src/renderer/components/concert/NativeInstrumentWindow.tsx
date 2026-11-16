import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PresetPluginAssignment } from '@shared/types';
import type { EngineParameter } from '@shared/engine-protocol';
import { useAppContext } from '../../context/AppContext';

export type NativeInstrumentKind = 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx';

interface NativeInstrumentWindowProps {
  kind: NativeInstrumentKind;
  layerId: string;
  assignment: PresetPluginAssignment;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

const DRAW_BARS: Array<[string, string]> = [
  ["Drawbar 16'", "16'"],
  ["Drawbar 5 1/3'", "5⅓'"],
  ["Drawbar 8'", "8'"],
  ["Drawbar 4'", "4'"],
  ["Drawbar 2 2/3'", "2⅔'"],
  ["Drawbar 2'", "2'"],
  ["Drawbar 1 3/5'", "1⅗'"],
  ["Drawbar 1 1/3'", "1⅓'"],
  ["Drawbar 1'", "1'"],
];

const TITLES: Record<NativeInstrumentKind, { name: string; badge: string; subtitle: string }> = {
  organ: { name: 'Preseter Organ', badge: 'Cópia tonewheel — um manual', subtitle: 'Órgão tonewheel nativo' },
  tines: { name: 'Preseter Tines (Rhodes)', badge: 'BASE MDA ePIANO', subtitle: 'Piano elétrico de tines — samples e DSP do MDA (MIT)' },
  reeds: { name: 'Preseter Wurly', badge: 'OPENWURLI', subtitle: 'Wurlitzer 200A — modelagem física (OpenWurli)' },
  piano: { name: 'Preseter Piano', badge: 'MDA PIANO', subtitle: 'Piano acústico — samples e DSP do MDA' },
  dx: { name: 'Preseter DX', badge: 'MDA DX10', subtitle: 'Sintetizador FM — MDA DX10' },
  jx: { name: 'Preseter JX', badge: 'MDA JX10', subtitle: 'Sintetizador analógico — MDA JX10' },
};

interface KnobProps {
  label: string;
  value: number;
  display: string;
  onChange: (value: number) => void;
}

const Knob: React.FC<KnobProps> = ({ label, value, display, onChange }) => (
  <div className="flex min-w-[74px] flex-col items-center gap-1">
    <div className="relative h-14 w-14 rounded-full" style={{ background: `conic-gradient(#0A84FF ${Math.round(value * 300)}deg, #343438 0)` }}>
      <div className="absolute inset-[5px] rounded-full" style={{ background: '#1C1C1E' }} />
      <div
        className="absolute left-1/2 top-[7px] h-3 w-[2px] origin-bottom rounded"
        style={{ background: '#E5E5EA', transform: `translateX(-50%) rotate(${-135 + value * 270}deg)`, transformOrigin: '50% 21px' }}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
    <span className="text-[10px] font-semibold text-white">{display}</span>
    <span className="text-[9px]" style={{ color: '#8E8E93' }}>{label}</span>
  </div>
);

const ChoiceButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded px-2 py-1 text-[10px] font-semibold"
    style={active
      ? { background: '#0A84FF', color: '#FFFFFF' }
      : { background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}
  >
    {children}
  </button>
);

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (value: number) => void;
  compact?: boolean;
}

const NumberField: React.FC<NumberFieldProps> = ({ value, min, max, step, decimals, onChange, compact = false }) => {
  const format = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(format(value));

  useEffect(() => { setText(format(value)); }, [value, decimals]);

  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setText(format(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setText(format(clamped));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setText(format(value));
          event.currentTarget.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const delta = (event.key === 'ArrowUp' ? 1 : -1) * step;
          const next = Math.max(min, Math.min(max, (Number(text.replace(',', '.')) || value) + delta));
          onChange(next);
          setText(format(next));
        }
      }}
      aria-label="Valor do parâmetro"
      className={`hw-inset px-1 py-0.5 text-center text-[10px] tabular-nums text-white ${compact ? 'w-[42px]' : 'w-[68px]'}`}
    />
  );
};

interface ParamKnobProps {
  label: string;
  paramName: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  valueOf: (name: string) => number;
  setNamed: (name: string, value: number) => void;
  display?: (real: number) => string;
}

const ParamKnob: React.FC<ParamKnobProps> = ({
  label, paramName, min, max, step, decimals, valueOf, setNamed, display,
}) => {
  const normalized = valueOf(paramName);
  const real = min + normalized * (max - min);
  const toNormalized = (value: number) => (max > min ? (value - min) / (max - min) : 0);

  return (
    <div className="flex flex-col items-center gap-1">
      <Knob
        label={label}
        value={normalized}
        display={display ? display(real) : `${real.toFixed(decimals)}`}
        onChange={(value) => setNamed(paramName, value)}
      />
      <NumberField
        value={real}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        onChange={(value) => setNamed(paramName, toNormalized(value))}
      />
    </div>
  );
};

export const NativeInstrumentWindow: React.FC<NativeInstrumentWindowProps> = ({
  kind,
  layerId,
  assignment,
  onClose,
  onSave,
}) => {
  const { getVstParameters, setVstParameter, loadedPlugins } = useAppContext();
  const [params, setParams] = useState<EngineParameter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ x: 80, y: 80, w: 980, h: 640 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const plugin = loadedPlugins.find((item) => item.layerId === layerId);
  const program = plugin?.program ?? assignment.programIndex ?? 0;
  const programCount = plugin?.programCount ?? (kind === 'organ' ? 4 : kind === 'tines' ? 4 : 4);

  const refresh = async () => {
    try {
      setParams(await getVstParameters(layerId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao ler os parâmetros.');
    }
  };

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastParamChangeRef = useRef(0);

  useEffect(() => { void refresh(); }, [layerId]);

  // O CC1 muda o Leslie no motor; atualiza os botões da janela sem fechar.
  useEffect(() => {
    if (kind !== 'organ') return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastParamChangeRef.current < 600) return;
      void refreshRef.current();
    }, 400);
    return () => window.clearInterval(timer);
  }, [kind, layerId]);

  useEffect(() => {
    const width = Math.min(980, window.innerWidth - 48);
    const height = Math.min(640, window.innerHeight - 48);
    setBox({ x: Math.max(24, Math.round((window.innerWidth - width) / 2)), y: Math.max(24, Math.round((window.innerHeight - height) / 2)), w: width, h: height });
  }, []);

  const param = (name: string) => params.find((item) => item.name === name);
  const valueOf = (name: string, fallback = 0) => param(name)?.value ?? fallback;

  const setNamed = async (name: string, value: number) => {
    const target = param(name);
    if (!target) return;
    lastParamChangeRef.current = Date.now();
    await setVstParameter(layerId, String(target.index), Math.max(0, Math.min(1, value)));
    setParams((previous) => previous.map((item) => item.index === target.index ? { ...item, value } : item));
  };

  const setPhysical = (name: string, value: number, max: number) => setNamed(name, value / max);

  const changeProgram = async (index: number) => {
    try {
      await window.electronAPI.vstSetProgram(layerId, index);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao trocar o preset.');
    }
  };

  const title = TITLES[kind];
  const drawbarMode = kind === 'organ';

  const programNames = useMemo(() => {
    if (kind === 'organ') return ['Jazz', 'Gospel', 'Rock', 'Combo'];
    if (kind === 'tines') return ['Suitcase', 'Stage', 'Mellow', 'Bark'];
    return ['Clássico', 'Suitcase', 'Stage', 'Bark'];
  }, [kind]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, background: '#151517', border: '1px solid #3A3A3C' }}
      >
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
          <div className="mr-auto min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{title.name}</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(10,132,255,0.2)', color: '#7FB6FF' }}>NATIVO</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}>{title.badge}</span>
            </div>
            <div className="truncate text-[10px]" style={{ color: '#8E8E93' }}>{title.subtitle}</div>
          </div>
          <select
            value={program}
            onChange={(event) => void changeProgram(Number(event.target.value))}
            className="hw-inset px-2 py-1 text-[10px] text-white"
            aria-label="Preset do instrumento"
          >
            {programNames.slice(0, programCount).map((name, index) => (
              <option key={name} value={index}>{name}</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold"
            style={{ background: '#0A84FF', color: '#fff' }}
            onClick={() => void onSave()}
          >
            Salvar
          </button>
          <button
            type="button"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-[12px] hover:bg-white/10"
            style={{ color: '#8E8E93' }}
            onClick={onClose}
            aria-label="Fechar janela"
            title="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {drawbarMode ? (
            <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section className="hw-inset p-3">
                <div className="hw-label mb-3">Barras (drawbars)</div>
                <div className="flex items-end justify-between gap-1">
                  {DRAW_BARS.map(([name, label]) => {
                    const raw = Math.round(valueOf(name) * 8);
                    return (
                      <div key={name} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <input
                          type="range"
                          min={0}
                          max={8}
                          step={1}
                          value={raw}
                          onChange={(event) => void setPhysical(name, Number(event.target.value), 8)}
                          aria-label={label}
                          className="h-28 w-4"
                          style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
                        />
                        <span className="text-[11px] font-bold text-white">{raw}</span>
                        <NumberField
                          value={raw}
                          min={0}
                          max={8}
                          step={1}
                          decimals={0}
                          compact
                          onChange={(value) => void setNamed(name, value / 8)}
                        />
                        <span className="text-[8px]" style={{ color: '#8E8E93' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="space-y-3">
                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Percussão</div>
                  <div className="flex flex-wrap gap-1">
                    <ChoiceButton active={valueOf('Percussao') > 0.5} onClick={() => void setNamed('Percussao', valueOf('Percussao') > 0.5 ? 0 : 1)}>Ligado</ChoiceButton>
                    <ChoiceButton active={valueOf('Volume da percussao') < 0.5} onClick={() => void setNamed('Volume da percussao', 0.3)}>Suave</ChoiceButton>
                    <ChoiceButton active={valueOf('Volume da percussao') >= 0.5} onClick={() => void setNamed('Volume da percussao', 0.7)}>Normal</ChoiceButton>
                    <ChoiceButton active={valueOf('Decaimento da percussao') < 0.5} onClick={() => void setNamed('Decaimento da percussao', 0.3)}>Lenta</ChoiceButton>
                    <ChoiceButton active={valueOf('Decaimento da percussao') >= 0.5} onClick={() => void setNamed('Decaimento da percussao', 0.7)}>Rápida</ChoiceButton>
                    <ChoiceButton active={valueOf('Harmonico da percussao') < 0.5} onClick={() => void setNamed('Harmonico da percussao', 0.3)}>2º Harm.</ChoiceButton>
                    <ChoiceButton active={valueOf('Harmonico da percussao') >= 0.5} onClick={() => void setNamed('Harmonico da percussao', 0.7)}>3º Harm.</ChoiceButton>
                  </div>
                </section>

                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Vibrato / Chorus</div>
                  <div className="flex flex-wrap gap-1">
                    <ChoiceButton active={valueOf('Vibrato/Chorus') < 0.5} onClick={() => void setNamed('Vibrato/Chorus', 0)}>Desligado</ChoiceButton>
                    {['V1', 'V2', 'V3', 'C1', 'C2', 'C3'].map((name, index) => (
                      <ChoiceButton key={name} active={Math.round(valueOf('Vibrato/Chorus') * 6) === index + 1} onClick={() => void setNamed('Vibrato/Chorus', (index + 1) / 6)}>{name}</ChoiceButton>
                    ))}
                  </div>
                </section>

                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Leslie</div>
                  <div className="flex flex-wrap gap-1">
                    {['Parado', 'Lento', 'Rápido', 'Freio'].map((name, index) => (
                      <ChoiceButton key={name} active={Math.round(valueOf('Leslie (0 parado, 1 lento, 2 rapido, 3 freio)') * 3) === index} onClick={() => void setNamed('Leslie (0 parado, 1 lento, 2 rapido, 3 freio)', index / 3)}>{name}</ChoiceButton>
                    ))}
                  </div>

                </section>
              </div>
            </div>

            <details className="hw-inset p-3">
              <summary className="hw-label cursor-pointer select-none">Digitar valores</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {params.map((item) => {
                  const isDrawbar = item.name.startsWith('Drawbar');
                  const isLeslie = item.name.startsWith('Leslie');
                  const isVibrato = item.name === 'Vibrato/Chorus';
                  const min = isDrawbar ? 0 : isLeslie ? 0 : isVibrato ? 0 : 0;
                  const max = isDrawbar ? 8 : isLeslie ? 3 : isVibrato ? 6 : 1;
                  const step = isDrawbar || isLeslie || isVibrato ? 1 : 0.01;
                  const decimals = isDrawbar || isLeslie || isVibrato ? 0 : 2;
                  const real = min + item.value * (max - min);
                  return (
                    <label key={item.index} className="flex items-center justify-between gap-2 rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="truncate text-[10px]" style={{ color: '#C6C6CB' }}>{item.name}</span>
                      <NumberField
                        value={real}
                        min={min}
                        max={max}
                        step={step}
                        decimals={decimals}
                        onChange={(value) => void setNamed(item.name, max > min ? (value - min) / (max - min) : 0)}
                      />
                    </label>
                  );
                })}
              </div>
            </details>
            </div>
          ) : kind === 'tines' ? (
            <div className="space-y-3">
              <section className="hw-inset p-3">
                <div className="hw-label mb-2">Presets</div>
                <div className="flex flex-wrap gap-1">
                  {programNames.slice(0, programCount).map((name, index) => (
                    <ChoiceButton key={name} active={program === index} onClick={() => void changeProgram(index)}>{name}</ChoiceButton>
                  ))}
                </div>
              </section>

              <section className="hw-inset p-3">
                <div className="hw-label mb-2">MDA ePiano</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <ParamKnob label="Decaimento" paramName="Envelope Decay" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="Liberação" paramName="Envelope Release" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="Dureza" paramName="Hardness" min={-50} max={50} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)}%`} />
                  <ParamKnob label="Brilho (agudos)" paramName="Treble Boost" min={-50} max={50} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />

                  <ParamKnob label="Modulação" paramName="Modulation" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed}
                    display={(v) => v > 0.5001 ? `Trem ${Math.round((v - 0.5) * 200)}%` : v < 0.4999 ? `Pan ${Math.round((0.5 - v) * 200)}%` : 'Desligado'} />
                  <div className="flex flex-col items-center gap-1">
                    <Knob
                      label="Taxa do LFO"
                      value={valueOf('LFO Rate')}
                      display={`${Math.exp(6.22 * valueOf('LFO Rate') - 2.61).toFixed(2)} Hz`}
                      onChange={(value) => void setNamed('LFO Rate', value)}
                    />
                    <NumberField
                      value={Math.exp(6.22 * valueOf('LFO Rate') - 2.61)}
                      min={0.07}
                      max={37}
                      step={0.01}
                      decimals={2}
                      onChange={(hz) => void setNamed('LFO Rate', Math.max(0, Math.min(1, (Math.log(Math.max(0.001, hz)) + 2.61) / 6.22)))}
                    />
                  </div>
                  <ParamKnob label="Sensib. velocity" paramName="Velocity Sensitivity" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="Largura estéreo" paramName="Stereo Width" min={0} max={200} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />

                  <ParamKnob label="Polifonia" paramName="Polyphony" min={1} max={32} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)} vozes`} />
                  <ParamKnob label="Afinação fina" paramName="Fine Tuning" min={-50} max={50} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)} cents`} />
                  <ParamKnob label="Variação por nota" paramName="Random Tuning" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${(50 * v * v).toFixed(1)} cents`} />
                  <ParamKnob label="Overdrive" paramName="Overdrive" min={0} max={100} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)}%`} />

                  <ParamKnob label="Gain" paramName="Gain" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
                  <ParamKnob label="Volume" paramName="Volume" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
                </div>
                <p className="mt-3 text-[9px]" style={{ color: '#8E8E93' }}>
                  Base: MDA ePiano (MIT). CC1 (modulação) controla a profundidade do tremolo/auto-pan.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-3">
              <section className="hw-inset p-3">
                <div className="hw-label mb-2">Presets</div>
                <div className="flex flex-wrap gap-1">
                  {programNames.slice(0, programCount).map((name, index) => (
                    <ChoiceButton key={name} active={program === index} onClick={() => void changeProgram(index)}>{name}</ChoiceButton>
                  ))}
                </div>
              </section>

              <section className="hw-inset p-3">
                <div className="hw-label mb-2">OpenWurli — Wurlitzer 200A</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <ParamKnob label="Volume" paramName="Volume" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="Tremolo" paramName="Tremolo Depth" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="Speaker" paramName="Speaker Character" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob label="MLP" paramName="MLP Corrections" min={0} max={1} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => v > 0.5 ? 'Ligado' : 'Desligado'} />

                  <ParamKnob label="Hammer" paramName="Hammer Contact" min={0.5} max={2} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => v.toFixed(2)} />
                  <ParamKnob label="Damper" paramName="Damper" min={0.25} max={4} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => v.toFixed(2)} />
                  <ParamKnob label="Reed trim" paramName="Reed Bar Trim" min={0} max={25000} step={10} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)} Ω`} />
                  <ParamKnob label="Noise" paramName="Noise" min={0} max={1} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => v > 0.5 ? 'Ligado' : 'Desligado'} />
                  <ParamKnob label="Noise gain" paramName="Noise Gain" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                </div>
                <p className="mt-3 text-[9px]" style={{ color: '#8E8E93' }}>
                  Base: OpenWurli (GPL-3.0-or-later). CC1 (modulação) controla a profundidade do tremolo.
                </p>
              </section>
            </div>
          )}

          {kind === 'organ' && (
          <section className="hw-inset mt-3 p-3">
            <div className="hw-label mb-2">Som</div>
            <div className="flex flex-wrap items-start justify-around gap-3">
              <ParamKnob label="Overdrive" paramName="Overdrive" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob label="Reverb" paramName="Reverb" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob label="Key click" paramName="Key click" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob label="Volume" paramName="Volume" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${(v * 24 - 12).toFixed(1)} dB`} />
            </div>
          </section>
          )}

          {error && <div className="mt-2 rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>{error}</div>}
        </div>

        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
          <span style={{ color: '#30D158' }}>● Ativo</span>
          <span>Polifonia {kind === 'tines' ? Math.round(valueOf('Polyphony')) : 64}/64</span>
          <span>CPU —</span>
          <span>Motor: Preseter ({kind})</span>
          <span className="ml-auto truncate">{assignment.name}</span>
        </footer>

        <div
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
