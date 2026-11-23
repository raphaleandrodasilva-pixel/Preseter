import React, { useEffect, useRef, useState } from 'react';

/** Controles compartilhados pelas janelas dos instrumentos nativos. */

/** Passo padrão da roda do mouse na posição normalizada do knob. */
const KNOB_WHEEL_STEP = 0.01;

/**
 * Fundo do knob: arco de 270° que começa no mínimo do curso (-135°, canto
 * inferior esquerdo) e termina no máximo. `position` é 0..1.
 */
export const knobArcBackground = (position: number): string => {
  const clamped = Math.max(0, Math.min(1, position));
  return `conic-gradient(from -135deg, #0A84FF ${Math.round(clamped * 270)}deg, #343438 0)`;
};

/** Pixels de arrasto vertical para percorrer o knob inteiro. */
const KNOB_DRAG_RANGE_PX = 150;

interface KnobDragState {
  lastY: number;
  value: number;
}

/**
 * Interação compartilhada dos knobs: arrasto vertical no próprio círculo
 * (subir aumenta; Shift deixa fino), roda do mouse e foco no input invisível
 * para as setas do teclado. O input não recebe ponteiro — o alvo é o círculo.
 */
export const useKnobInteraction = (
  value: number,
  onChange: (value: number) => void,
  step = KNOB_WHEEL_STEP
) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const dragRef = useRef<KnobDragState | null>(null);
  valueRef.current = value;
  onChangeRef.current = onChange;

  // Roda do mouse: o listener nativo permite `preventDefault` e impede o painel
  // de rolar junto (React registra onWheel como passivo).
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
      event.preventDefault();
      const delta = step * (event.shiftKey ? 0.2 : 1);
      const next = Math.max(0, Math.min(1, valueRef.current + (event.deltaY < 0 ? delta : -delta)));
      onChangeRef.current(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [step]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    inputRef.current?.focus({ preventScroll: true });
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    dragRef.current = { lastY: event.clientY, value: valueRef.current };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Acumula o movimento para o Shift entrar/sair no meio do arrasto sem pulo.
    const delta = ((drag.lastY - event.clientY) / KNOB_DRAG_RANGE_PX) * (event.shiftKey ? 0.2 : 1);
    const next = Math.max(0, Math.min(1, drag.value + delta));
    drag.lastY = event.clientY;
    drag.value = next;
    onChangeRef.current(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const target = event.currentTarget;
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture?.(event.pointerId);
  };

  return { containerRef, inputRef, onPointerDown, onPointerMove, onPointerUp };
};

interface KnobProps {
  label: string;
  value: number;
  display: string;
  onChange: (value: number) => void;
  /** Volta ao padrão do parâmetro no duplo clique. */
  onReset?: () => void;
  /** Passo da roda do mouse (normalizado); shift usa um quinto dele. */
  step?: number;
}

export const Knob: React.FC<KnobProps> = ({ label, value, display, onChange, onReset, step = KNOB_WHEEL_STEP }) => {
  const interaction = useKnobInteraction(value, onChange, step);

  return (
    <div className="flex min-w-[74px] flex-col items-center gap-1">
      <div
        ref={interaction.containerRef}
        className="relative h-14 w-14 cursor-ns-resize touch-none select-none rounded-full focus-within:ring-2 focus-within:ring-[#0A84FF]"
        data-knob-arc={Math.round(value * 270)}
        style={{ background: knobArcBackground(value) }}
        title={onReset ? 'Arraste para cima/baixo · duplo clique volta ao padrão' : 'Arraste para cima/baixo'}
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
        onPointerCancel={interaction.onPointerUp}
        onDoubleClick={onReset
          ? (event) => { event.preventDefault(); event.stopPropagation(); onReset(); }
          : undefined}
      >
        <div className="absolute inset-[5px] rounded-full" style={{ background: '#1C1C1E' }} />
        <div
          className="absolute left-1/2 top-[7px] h-3 w-[2px] origin-bottom rounded"
          style={{ background: '#E5E5EA', transform: `translateX(-50%) rotate(${-135 + value * 270}deg)`, transformOrigin: '50% 21px' }}
        />
        <input
          ref={interaction.inputRef}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
      <span className="text-[10px] font-semibold text-white">{display}</span>
      <span className="text-[9px]" style={{ color: '#8E8E93' }}>{label}</span>
    </div>
  );
};

export const ChoiceButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
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

export const NumberField: React.FC<NumberFieldProps> = ({ value, min, max, step, decimals, onChange, compact = false }) => {
  const format = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(format(value));
  /** Escape durante a edição: o blur descarta em vez de confirmar. */
  const cancelledRef = useRef(false);

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
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setText(format(value));
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          cancelledRef.current = true;
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
  /** Padrão do parâmetro (normalizado 0..1), usado no duplo clique. */
  defaultOf?: (name: string) => number | undefined;
}

export const ParamKnob: React.FC<ParamKnobProps> = ({
  label, paramName, min, max, step, decimals, valueOf, setNamed, display, defaultOf,
}) => {
  const normalized = valueOf(paramName);
  const real = min + normalized * (max - min);
  const toNormalized = (value: number) => (max > min ? (value - min) / (max - min) : 0);
  const fallback = defaultOf?.(paramName);

  return (
    <div className="flex flex-col items-center gap-1">
      <Knob
        label={label}
        value={normalized}
        display={display ? display(real) : `${real.toFixed(decimals)}`}
        onChange={(value) => setNamed(paramName, value)}
        onReset={fallback === undefined ? undefined : () => setNamed(paramName, fallback)}
        step={max > min ? Math.max(0.0005, step / (max - min)) : undefined}
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
