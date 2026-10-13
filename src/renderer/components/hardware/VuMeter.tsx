import React from 'react';

interface VuMeterProps {
  value: number; // 0..1
  label?: string;
}

/** VU analógico simplificado — fundo azul-pálido como na referência. */
export const VuMeter: React.FC<VuMeterProps> = ({ value, label = 'Reverb' }) => {
  const clamped = Math.max(0, Math.min(1, value));
  const angle = -38 + clamped * 76;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="hw-label">{label}</div>
      <div
        className="relative overflow-hidden rounded-md"
        style={{
          width: 150,
          height: 84,
          background: 'linear-gradient(to bottom, #E8ECDA, #C6D2B6)',
          border: '1px solid #0A0A0C',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
        }}
      >
        {[
          { left: 10, top: 10 },
          { left: 130, top: 10 },
          { left: 10, top: 64 },
          { left: 130, top: 64 },
        ].map((pos, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #55555E, #101013 70%)',
              ...pos,
            }}
          />
        ))}
        <svg viewBox="0 0 150 84" style={{ position: 'absolute', inset: 0 }}>
          <path d="M 18 72 A 62 62 0 0 1 132 72" fill="none" stroke="#1A1A1E" strokeWidth="5" />
          <path d="M 92 72 A 62 62 0 0 1 132 72" fill="none" stroke="#8A97A3" strokeWidth="5" />
          {[20, 10, 7, 2].map((tick, i) => {
            const a = ((-38 + i * 25) * Math.PI) / 180;
            const x1 = 75 + Math.sin(a) * 46;
            const y1 = 78 - Math.cos(a) * 46;
            const x2 = 75 + Math.sin(a) * 54;
            const y2 = 78 - Math.cos(a) * 54;
            const lx = 75 + Math.sin(a) * 62;
            const ly = 78 - Math.cos(a) * 62;
            return (
              <g key={tick}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1A1A1E" strokeWidth="2.5" />
                <text x={lx} y={ly} textAnchor="middle" fontSize="11" fontStyle="italic" fill="#1A1A1E">
                  {tick}
                </text>
              </g>
            );
          })}
          <line
            x1="75"
            y1="78"
            x2={75 + Math.sin((angle * Math.PI) / 180) * 56}
            y2={78 - Math.cos((angle * Math.PI) / 180) * 56}
            stroke="#111114"
            strokeWidth="2"
          />
          <circle cx="75" cy="78" r="4" fill="#111114" />
        </svg>
      </div>
    </div>
  );
};
