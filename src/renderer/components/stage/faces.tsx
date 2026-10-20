import React from 'react';
import type { PlaybackState } from '@shared/types';

/**
 * Faces — fonte única do desenho dos controles de hardware.
 * Usadas tanto pelo PreviewShape (modo Layout, estático) quanto pelo
 * StageControl (modos Edit/Perform, interativo). O que você vê parado
 * é o mesmo desenho nos três modos; a diferença está só na camada
 * de interação que o StageControl adiciona por cima.
 */

export const pct = (norm: number): string => `${Math.round(Math.max(0, Math.min(1, norm)) * 100)}%`;

const TICK_COUNT = 11;

export const KnobFace: React.FC<{
  label: string;
  norm: number;
  bodyProps?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ label, norm, bodyProps }) => (
  <>
    <div className="hw-knobface relative mb-1 h-14 w-14">
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const tickAngle = -135 + (i * 270) / (TICK_COUNT - 1);
        const lit = norm * (TICK_COUNT - 1) >= i - 1e-9;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: 'calc(50% - 1px)',
              top: 'calc(50% - 1px)',
              width: i % 5 === 0 ? 3 : 2,
              height: i % 5 === 0 ? 6 : 4,
              background: lit ? '#0A84FF' : '#F2F2F2',
              opacity: lit ? 1 : 0.35,
              boxShadow: lit ? '0 0 4px #0A84FF' : 'none',
              transform: `rotate(${tickAngle}deg) translateY(-24px)`,
              transformOrigin: '50% 50%',
            }}
          />
        );
      })}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 34,
          height: 34,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle at 35% 28%, #414149, #2C2C2E 72%)',
          border: '1px solid #55555D',
          boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 4px rgba(255,255,255,0.09)',
          cursor: bodyProps?.onPointerDown ? 'ns-resize' : undefined,
          touchAction: 'none',
        }}
        {...bodyProps}
      >
        <span
          style={{
            position: 'absolute',
            left: 'calc(50% - 1px)',
            top: 4,
            width: 3,
            height: 10,
            background: '#F2F2F2',
            transform: `rotate(${-135 + Math.max(0, Math.min(1, norm)) * 270}deg)`,
            transformOrigin: '50% 11px',
          }}
        />
      </div>
    </div>
    <span className="hw-label">{label}</span>
    <span className="hw-badge mt-1">{pct(norm)}</span>
  </>
);

export const FaderFace: React.FC<{
  label: string;
  norm: number;
  trackProps?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ label, norm, trackProps }) => {
  const n = Math.max(0, Math.min(1, norm));
  return (
    <>
      <div
        className="hw-fadertrack relative mb-2 h-24 w-4 rounded"
        style={{ background: '#242426', cursor: trackProps?.onPointerDown ? 'ns-resize' : undefined, touchAction: 'none' }}
        {...trackProps}
      >
        <div className="absolute bottom-0 left-0 w-full rounded-b" style={{ height: `${n * 100}%`, background: 'linear-gradient(to top, #0A84FF, #5AA9FF)', opacity: 0.68 }} />
        <div
          className="absolute left-1/2 rounded-[2px]"
          style={{
            top: `${(1 - n) * 100}%`,
            width: 26,
            height: 14,
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(to bottom, #494950, #202025)',
            border: '1px solid #5A5A62',
            boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        />
      </div>
      <span className="hw-label">{label}</span>
      <span className="hw-badge mt-1">{pct(n)}</span>
    </>
  );
};

export const SliderFace: React.FC<{
  label: string;
  norm: number;
  trackProps?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ label, norm, trackProps }) => {
  const n = Math.max(0, Math.min(1, norm));
  return (
    <>
      <div
        className="hw-slidertrack relative mb-2 h-4 w-28 rounded-full"
        style={{ background: '#242426', cursor: trackProps?.onPointerDown ? 'ew-resize' : undefined, touchAction: 'none' }}
        {...trackProps}
      >
        <div className="absolute left-0 top-0 h-full rounded-l-full" style={{ width: `${n * 100}%`, background: 'linear-gradient(to right, #0A84FF, #5AA9FF)', opacity: 0.68 }} />
        <div
          className="absolute top-1/2 rounded-[3px]"
          style={{
            left: `${n * 100}%`,
            width: 14,
            height: 26,
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(to right, #202025, #494950, #202025)',
            border: '1px solid #5A5A62',
            boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        />
      </div>
      <span className="hw-label">{label}</span>
      <span className="hw-badge mt-1">{pct(n)}</span>
    </>
  );
};

const resetButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: 'inherit',
  font: 'inherit',
  touchAction: 'manipulation',
};

export const ButtonFace: React.FC<{ label: string }> = ({ label }) => (
  <>
    <span className="hw-squarebtn hw-button-face">{label}</span>
    <span className="hw-label mt-1">{label}</span>
  </>
);

export const ToggleFace: React.FC<{ label: string; on: boolean }> = ({ label, on }) => (
  <>
    <div className={`hw-toggle-track${on ? ' is-on' : ''}`} aria-hidden="true">
      <span className="hw-toggle-thumb" />
    </div>
    <span className="hw-label">{label}</span>
  </>
);

export const PadFace: React.FC<{ label: string }> = ({ label }) => (
  <>
    <span className="hw-squarebtn hw-pad-face">{label}</span>
    <span className="hw-label mt-1">{label}</span>
  </>
);

export const PedalFace: React.FC<{ label: string; active: boolean; value?: number }> = ({ label, active, value }) => (
  <>
    <div
      className={`hw-pedal-face relative mb-1 h-10 w-14 overflow-hidden rounded-b-xl${active ? ' is-on' : ''}`}
      style={
        active || (value !== undefined && value > 0)
          ? { background: 'linear-gradient(to bottom, #303037, #151519)', border: '2px solid #0A84FF', boxShadow: '0 0 8px rgba(10,132,255,0.35), inset 0 2px 6px rgba(0,0,0,0.5)' }
          : { background: 'linear-gradient(to bottom, #303037, #151519)', border: '2px solid #55555D', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)' }
      }
    >
      {value !== undefined && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: `${Math.max(0, Math.min(1, value)) * 100}%`, background: 'rgba(10,132,255,0.35)' }}
        />
      )}
      <span />
    </div>
    <span className="hw-label">{label}</span>
  </>
);

/** Drawbar de órgão: vertical, discreto, 0–8. */
export const DrawbarFace: React.FC<{
  label: string;
  value: number;
  max?: number;
  trackProps?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ label, value, max = 8, trackProps }) => {
  const steps = Math.max(1, Math.round(max));
  const current = Math.max(0, Math.min(steps, Math.round(value)));
  const n = current / steps;
  return (
    <>
      <div
        className="hw-fadertrack relative mb-1 h-24 w-5 rounded"
        style={{
          background: '#242426',
          cursor: trackProps?.onPointerDown ? 'ns-resize' : undefined,
          touchAction: 'none',
        }}
        {...trackProps}
      >
        {Array.from({ length: steps + 1 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-0 right-0"
            style={{
              top: `${(1 - i / steps) * 100}%`,
              height: 1,
              background: i <= current ? 'rgba(198,161,91,0.85)' : '#3A3A41',
            }}
          />
        ))}
        <div
          className="absolute left-1/2 rounded-[2px]"
          style={{
            top: `${(1 - n) * 100}%`,
            width: 30,
            height: 12,
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(to bottom, #494950, #202025)',
            border: '1px solid #5A5A62',
            boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        />
      </div>
      <span className="hw-label" style={{ fontSize: 9 }}>{label}</span>
      <span className="hw-badge mt-0.5">{current}</span>
    </>
  );
};

/** Controle opcional de Playback no Layout. */
export const PlaybackFace: React.FC<{
  state?: PlaybackState | null;
  onLoad?: () => void;
  onPlay?: () => void;
  onStop?: () => void;
}> = ({ state, onLoad, onPlay, onStop }) => {
  const file = state?.path ? state.path.split(/[\\/]/).pop() : null;
  const buttonClass = 'hw-squarebtn px-1.5 py-0.5 text-[9px] font-semibold';
  return (
    <>
      <div className="flex w-full items-center justify-center gap-1">
        <span
          className="rounded px-1 py-0.5 text-[9px] font-bold"
          style={{ background: state?.playing ? '#30D158' : '#5E5CE6', color: '#FFFFFF' }}
        >
          PB
        </span>
        <span className="hw-label min-w-0 truncate" title={state?.path ?? ''}>
          {file ?? 'Playback'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-center gap-1">
        {onLoad ? (
          <button type="button" className={buttonClass} onClick={(event) => { event.stopPropagation(); onLoad(); }}>LOAD</button>
        ) : (
          <span className={`${buttonClass} opacity-50`}>LOAD</span>
        )}
        {onPlay ? (
          <button type="button" className={buttonClass} onClick={(event) => { event.stopPropagation(); onPlay(); }}>PLAY</button>
        ) : (
          <span className={`${buttonClass} opacity-50`}>PLAY</span>
        )}
        {onStop ? (
          <button type="button" className={buttonClass} onClick={(event) => { event.stopPropagation(); onStop(); }}>STOP</button>
        ) : (
          <span className={`${buttonClass} opacity-50`}>STOP</span>
        )}
      </div>
      <span className="mt-0.5 text-[8px]" style={{ color: '#8E8E93' }}>
        {state?.playing ? 'Playing' : state?.loaded ? 'Ready' : 'No file'}
      </span>
    </>
  );
};

export const MeterFace: React.FC<{ label: string; norm: number; horizontal?: boolean }> = ({
  label,
  norm,
  horizontal,
}) => {
  const n = Math.max(0, Math.min(1, norm));
  return horizontal ? (
    <>
      <div className="mb-1 flex h-3 w-24 items-center overflow-hidden rounded" style={{ background: '#242426' }}>
        <div className="h-full" style={{ width: `${n * 100}%`, background: 'linear-gradient(to right, #30D158 0%, #30D158 65%, #F5C542 82%, #FF5D5D 100%)' }} />
      </div>
      <span className="hw-label">{label}</span>
    </>
  ) : (
    <>
      <div className="mb-1 flex h-20 w-3 items-end overflow-hidden rounded" style={{ background: '#242426' }}>
        <div className="w-full" style={{ height: `${n * 100}%`, background: 'linear-gradient(to top, #30D158 0%, #30D158 65%, #F5C542 82%, #FF5D5D 100%)' }} />
      </div>
      <span className="hw-label">{label}</span>
    </>
  );
};

export const ActivityFace: React.FC<{ label: string }> = ({ label }) => (
  <>
    <div className="hw-activity-led mb-1 h-4 w-4 rounded-full" />
    <span className="hw-label">{label}</span>
  </>
);

export const LabelFace: React.FC<{ label: string }> = ({ label }) => (
  <span style={{ color: '#F2F2F2', fontSize: 14 }}>{label}</span>
);

/** Envolve uma face num botão resetado sem alterar o desenho. */
export const FaceButton: React.FC<{
  title?: string;
  onActivate: () => void;
  onPress?: (down: boolean) => void;
  children: React.ReactNode;
}> = ({ title, onActivate, onPress, children }) => {
  const [pressed, setPressed] = React.useState(false);
  const pressedRef = React.useRef(false);
  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setPressed(false);
    onPress?.(false);
  };
  const press = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    setPressed(true);
    onPress?.(true);
  };

  return (
    <button
      type="button"
      title={title}
      className={`hw-facebutton${pressed ? ' is-pressed' : ''}`}
      style={resetButton}
      onClick={onActivate}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) press();
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') release();
      }}
      onBlur={release}
    >
      {children}
    </button>
  );
};
