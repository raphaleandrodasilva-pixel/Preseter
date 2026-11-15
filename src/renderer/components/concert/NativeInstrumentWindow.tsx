import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PresetPluginAssignment } from '@shared/types';
import type { EngineParameter } from '@shared/engine-protocol';
import { useAppContext } from '../../context/AppContext';

export type NativeInstrumentKind = 'organ' | 'tines' | 'reeds';

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
  tines: { name: 'Preseter Tines (Rhodes)', badge: 'MODELAGEM FÍSICA', subtitle: 'Piano elétrico de tines — inspirado no Rhodes' },
  reeds: { name: 'Preseter Reeds (Wurlitzer)', badge: 'MODELAGEM FÍSICA', subtitle: 'Piano elétrico de palhetas — inspirado no Wurlitzer' },
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

function formatHz(value: number): string {
  return `${value.toFixed(1)} Hz`;
}

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
  const modalMode = !drawbarMode;
  const tremDepth = valueOf('Profundidade do tremolo');
  const tremRate = valueOf('Tremolo (Hz)') * 10;
  const tremMode = valueOf('Tremolo: auto-pan');

  const programNames = useMemo(() => {
    if (kind === 'organ') return ['Jazz', 'Gospel', 'Rock', 'Combo'];
    if (kind === 'tines') return ['Suitcase', 'Stage', 'Mellow', 'Bark'];
    return ['Clássico', 'Suave', 'Bark', 'Brilhante'];
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

              <div className="grid gap-3 md:grid-cols-2">
                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Como o som é formado</div>
                  <svg viewBox="0 0 320 90" className="w-full">
                    <rect x="10" y="58" width="48" height="8" rx="2" fill="#3A3A3C" />
                    <line x1="34" y1="58" x2="150" y2="38" stroke="#C6C6CB" strokeWidth="2" />
                    <line x1="150" y1="38" x2="270" y2="48" stroke="#0A84FF" strokeWidth="3" />
                    <circle cx="270" cy="48" r="9" fill="#FF9F0A" />
                    <text x="12" y="82" fill="#8E8E93" fontSize="9">base</text>
                    <text x="80" y="24" fill="#8E8E93" fontSize="9">palheta (reed)</text>
                    <text x="190" y="24" fill="#8E8E93" fontSize="9">captador</text>
                    <text x="245" y="76" fill="#8E8E93" fontSize="9">sino</text>
                    <text x="120" y="60" fill="#8E8E93" fontSize="9">martelo</text>
                  </svg>
                  <p className="text-[10px]" style={{ color: '#8E8E93' }}>O martelo bate na palheta e a vibração chega ao captador. Mais força = mais bark.</p>
                </section>

                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Resposta à velocity</div>
                  <svg viewBox="0 0 220 80" className="w-full">
                    <line x1="10" y1="68" x2="210" y2="68" stroke="#3A3A3C" />
                    <line x1="10" y1="8" x2="10" y2="68" stroke="#3A3A3C" />
                    <polyline points="10,66 210,18" fill="none" stroke="#0A84FF" strokeWidth="2" />
                    <circle cx={10 + valueOf(kind === 'tines' ? 'Sensibilidade a velocity' : 'Sensibilidade a velocity') * 190} cy={66 - valueOf(kind === 'tines' ? 'Sensibilidade a velocity' : 'Sensibilidade a velocity') * 46} r="4" fill="#fff" />
                    <text x="10" y="78" fill="#8E8E93" fontSize="8">suave</text>
                    <text x="175" y="78" fill="#8E8E93" fontSize="8">forte</text>
                  </svg>
                </section>
              </div>

              <section className="hw-inset p-3">
                <div className="hw-label mb-2">Tremolo / Auto-Pan</div>
                <div className="flex flex-wrap items-center gap-1">
                  <ChoiceButton active={tremDepth > 0.01} onClick={() => void setNamed('Profundidade do tremolo', tremDepth > 0.01 ? 0 : 0.35)}>Ligado</ChoiceButton>
                  <ChoiceButton active={tremMode < 0.5 && tremDepth > 0.01} onClick={() => {
                    void setNamed('Tremolo: auto-pan', 0);
                    if (tremDepth <= 0.01) void setNamed('Profundidade do tremolo', 0.35);
                  }}>Tremolo</ChoiceButton>
                  <ChoiceButton active={tremMode >= 0.5} onClick={() => {
                    void setNamed('Tremolo: auto-pan', 1);
                    if (tremDepth <= 0.01) void setNamed('Profundidade do tremolo', 0.45);
                  }}>Auto-pan</ChoiceButton>
                  <span className="ml-2 text-[10px]" style={{ color: '#8E8E93' }}>
                    Taxa {formatHz(tremRate)} · Profundidade {Math.round(tremDepth * 100)}%
                  </span>
                </div>
                <div className="mt-3 flex items-start justify-around gap-3">
                  <Knob
                    label="Taxa"
                    value={Math.max(0, Math.min(1, tremRate / 10))}
                    display={formatHz(tremRate)}
                    onChange={(value) => void setNamed('Tremolo (Hz)', value)}
                  />
                  <Knob
                    label="Profundidade"
                    value={tremDepth}
                    display={`${Math.round(tremDepth * 100)}%`}
                    onChange={(value) => void setNamed('Profundidade do tremolo', value)}
                  />
                </div>
                <div className="mt-1 text-[9px]" style={{ color: '#8E8E93' }}>
                  CC1 (modulação) controla a profundidade do tremolo.
                </div>
              </section>
            </div>
          )}

          <section className="hw-inset mt-3 p-3">
            <div className="hw-label mb-2">Som</div>
            <div className="flex flex-wrap items-start justify-around gap-3">
              {kind === 'organ' ? (
                <>
                  <Knob label="Overdrive" value={valueOf('Overdrive')} display={`${Math.round(valueOf('Overdrive') * 100)}%`} onChange={(value) => void setNamed('Overdrive', value)} />
                  <Knob label="Reverb" value={valueOf('Reverb')} display={`${Math.round(valueOf('Reverb') * 100)}%`} onChange={(value) => void setNamed('Reverb', value)} />
                  <Knob label="Key click" value={valueOf('Key click')} display={`${Math.round(valueOf('Key click') * 100)}%`} onChange={(value) => void setNamed('Key click', value)} />
                  <Knob label="Volume" value={valueOf('Volume')} display={`${(valueOf('Volume') * 24 - 12).toFixed(1)} dB`} onChange={(value) => void setNamed('Volume', value)} />
                </>
              ) : (
                <>
                  <Knob label="Gain" value={valueOf('Gain')} display={`${Math.round(valueOf('Gain') * 100)}%`} onChange={(value) => void setNamed('Gain', value)} />
                  <Knob label={kind === 'tines' ? 'Sino' : 'Brilho do martelo'} value={valueOf(kind === 'tines' ? 'Sino (tonebar)' : 'Brilho do martelo')} display={`${Math.round(valueOf(kind === 'tines' ? 'Sino (tonebar)' : 'Brilho do martelo') * 100)}%`} onChange={(value) => void setNamed(kind === 'tines' ? 'Sino (tonebar)' : 'Brilho do martelo', value)} />
                  <Knob label="Tom" value={valueOf('Tom')} display={`${Math.round(valueOf('Tom') * 100)}%`} onChange={(value) => void setNamed('Tom', value)} />
                  <Knob label="Sensib. velocity" value={valueOf('Sensibilidade a velocity')} display={`${Math.round(valueOf('Sensibilidade a velocity') * 100)}%`} onChange={(value) => void setNamed('Sensibilidade a velocity', value)} />
                  <Knob label="Volume" value={valueOf('Volume')} display={`${(valueOf('Volume') * 24 - 12).toFixed(1)} dB`} onChange={(value) => void setNamed('Volume', value)} />
                </>
              )}
            </div>
          </section>

          {error && <div className="mt-2 rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>{error}</div>}
        </div>

        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
          <span style={{ color: '#30D158' }}>● Ativo</span>
          <span>Polifonia {Math.min(64, programCount)}/64</span>
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
