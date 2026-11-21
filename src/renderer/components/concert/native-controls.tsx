import React, { useEffect, useState } from 'react';

/** Controles compartilhados pelas janelas dos instrumentos nativos. */

interface KnobProps {
  label: string;
  value: number;
  display: string;
  onChange: (value: number) => void;
}

export const Knob: React.FC<KnobProps> = ({ label, value, display, onChange }) => (
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

export const ParamKnob: React.FC<ParamKnobProps> = ({
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
