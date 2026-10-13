import React from 'react';

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
              background: lit ? '#2DFF6A' : '#F2F2F2',
              opacity: lit ? 1 : 0.35,
              boxShadow: lit ? '0 0 4px #2DFF6A' : 'none',
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
          background: 'radial-gradient(circle at 35% 28%, #414149, #19191D 72%)',
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
        style={{ background: '#101013', cursor: trackProps?.onPointerDown ? 'ns-resize' : undefined, touchAction: 'none' }}
        {...trackProps}
      >
        <div className="absolute bottom-0 left-0 w-full rounded-b" style={{ height: `${n * 100}%`, background: 'linear-gradient(to top, #2DFF6A, #72F2A0)', opacity: 0.68 }} />
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
        style={{ background: '#101013', cursor: trackProps?.onPointerDown ? 'ew-resize' : undefined, touchAction: 'none' }}
        {...trackProps}
      >
        <div className="absolute left-0 top-0 h-full rounded-l-full" style={{ width: `${n * 100}%`, background: 'linear-gradient(to right, #2DFF6A, #72F2A0)', opacity: 0.68 }} />
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

export const PedalFace: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <>
    <div
      className={`hw-pedal-face mb-1 h-10 w-14 rounded-b-xl${active ? ' is-on' : ''}`}
      style={
        active
          ? { background: 'linear-gradient(to bottom, #303037, #151519)', border: '2px solid #2DFF6A', boxShadow: '0 0 8px rgba(45,255,106,0.35), inset 0 2px 6px rgba(0,0,0,0.5)' }
          : { background: 'linear-gradient(to bottom, #303037, #151519)', border: '2px solid #55555D', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)' }
      }
    >
      <span />
    </div>
    <span className="hw-label">{label}</span>
  </>
);

export const MeterFace: React.FC<{ label: string; norm: number; horizontal?: boolean }> = ({
  label,
  norm,
  horizontal,
}) => {
  const n = Math.max(0, Math.min(1, norm));
  return horizontal ? (
    <>
      <div className="mb-1 flex h-3 w-24 items-center overflow-hidden rounded" style={{ background: '#101013' }}>
        <div className="h-full" style={{ width: `${n * 100}%`, background: 'linear-gradient(to right, #2DFF6A 0%, #2DFF6A 65%, #F5C542 82%, #FF5D5D 100%)' }} />
      </div>
      <span className="hw-label">{label}</span>
    </>
  ) : (
    <>
      <div className="mb-1 flex h-20 w-3 items-end overflow-hidden rounded" style={{ background: '#101013' }}>
        <div className="w-full" style={{ height: `${n * 100}%`, background: 'linear-gradient(to top, #2DFF6A 0%, #2DFF6A 65%, #F5C542 82%, #FF5D5D 100%)' }} />
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
