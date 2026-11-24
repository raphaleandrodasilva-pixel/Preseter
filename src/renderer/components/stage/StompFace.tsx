import React, { useEffect, useRef, useState } from 'react';
import type { UiElement } from '@shared/types';

/**
 * Pedal de efeito (`pedalKind: 'stomp'`): LED, footswitch (bypass do insert) e
 * knobs do próprio insert. Compartilhado entre o Perform (interativo) e o
 * Layout (preview).
 */

const MiniKnob: React.FC<{
  label: string;
  value: number;
  interactive: boolean;
  onChange: (value: number) => void;
}> = ({ label, value, interactive, onChange }) => {
  const drag = useRef<{ y: number; value: number } | null>(null);
  return (
    <div className="flex flex-col items-center" style={{ width: 46 }}>
      <div
        className={`relative h-8 w-8 rounded-full ${interactive ? 'cursor-ns-resize touch-none' : ''}`}
        style={{ background: `conic-gradient(from -135deg, #0A84FF ${Math.round(value * 270)}deg, #343438 0)` }}
        title={interactive ? `${label} — arraste para cima/baixo` : label}
        onPointerDown={interactive
          ? (event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              drag.current = { y: event.clientY, value };
            }
          : undefined}
        onPointerMove={interactive
          ? (event) => {
              const current = drag.current;
              if (!current) return;
              const next = Math.max(0, Math.min(1, current.value + (current.y - event.clientY) / 120));
              current.y = event.clientY;
              current.value = next;
              onChange(next);
            }
          : undefined}
        onPointerUp={interactive
          ? (event) => {
              drag.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }
          : undefined}
        onPointerCancel={interactive ? () => { drag.current = null; } : undefined}
      >
        <div className="absolute inset-[3px] rounded-full" style={{ background: '#1C1C1E' }} />
        <div
          className="absolute left-1/2 top-[4px] h-2 w-[2px] origin-bottom rounded"
          style={{ background: '#E5E5EA', transform: `translateX(-50%) rotate(${-135 + value * 270}deg)`, transformOrigin: '50% 12px' }}
        />
      </div>
      <span className="mt-0.5 text-center text-[7px] leading-tight" style={{ color: '#B8B8BD' }}>{label}</span>
    </div>
  );
};

export interface StompFaceProps {
  element: UiElement;
  /** Desliga o efeito (bypass do insert). */
  onToggle?: (on: boolean) => void;
  /** Knob do insert: id do parâmetro e valor normalizado 0..1. */
  onParam?: (parameterId: string, value: number) => void;
  /** `false` desenha só o preview (Layout). */
  interactive?: boolean;
}

export const StompFace: React.FC<StompFaceProps> = ({
  element,
  onToggle,
  onParam,
  interactive = true,
}) => {
  const [on, setOn] = useState((element.value ?? 1) >= 0.5);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const param of element.stompParams ?? []) initial[param.parameterId] = param.value ?? 0.5;
    return initial;
  });

  useEffect(() => {
    setOn((element.value ?? 1) >= 0.5);
  }, [element.id, element.value]);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-between rounded-lg p-1.5"
      style={{
        background: 'linear-gradient(to bottom, #3A3A3C, #26262A)',
        border: '1px solid #4A4A4F',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex w-full items-center gap-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: on ? '#30D158' : '#5A5A5E', boxShadow: on ? '0 0 6px #30D158' : 'none' }}
        />
        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-white">{element.label}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {(element.stompParams ?? []).map((param) => (
          <MiniKnob
            key={param.parameterId}
            label={param.label}
            value={values[param.parameterId] ?? 0.5}
            interactive={interactive}
            onChange={(next) => {
              setValues((previous) => ({ ...previous, [param.parameterId]: next }));
              onParam?.(param.parameterId, next);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="mt-1 w-full rounded-md px-2 py-1 text-[9px] font-bold disabled:cursor-default"
        style={{
          background: on ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.06)',
          color: on ? '#7BE38F' : '#9A9AA0',
          border: `1px solid ${on ? '#30D158' : '#4A4A4F'}`,
        }}
        aria-disabled={!interactive}
        onClick={interactive
          ? () => {
              const next = !on;
              setOn(next);
              onToggle?.(next);
            }
          : undefined}
        title={interactive ? (on ? 'Desligar efeito' : 'Ligar efeito') : element.label}
      >
        {on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
};
