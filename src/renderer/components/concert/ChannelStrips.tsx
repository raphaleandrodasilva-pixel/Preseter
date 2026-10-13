import React, { useRef, useState } from 'react';
import type { Preset } from '@shared/types';

interface ChannelStripsProps {
  preset: Preset | null;
}

/** Channel strip visual em tema navy (mock fase 1 — sem áudio real). */
const Strip: React.FC<{
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
}> = ({ title, subtitle, badge }) => {
  const [volume, setVolume] = useState(75);
  const [pan, setPan] = useState(50);
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState(false);
  return (
    <div className={`flex w-[132px] shrink-0 flex-col rounded-2xl ${muted ? 'opacity-50' : ''}`} style={{ border: '1px solid #2E2E34', background: 'linear-gradient(to bottom, #232326, #1C1C1F)' }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ borderBottom: '1px solid #2E2E34' }}>
        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ background: '#2DFF6A', color: '#0B120C' }}>
          {badge}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold" style={{ color: '#EDEDEF' }} title={title}>
          {title}
        </span>
      </div>
      <div className="hw-label px-2 py-1" style={{ fontSize: 8 }}>{subtitle}</div>
      <div className="flex flex-1 gap-1 px-1.5">
        <div className="flex flex-col items-center gap-1">
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-20 w-1"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#2DFF6A' } as React.CSSProperties}
            title={`Volume ${volume}`}
          />
          <span className="hw-badge" style={{ minWidth: 40, fontSize: 9 }}>{volume}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label className="hw-label" style={{ fontSize: 8 }}>
            Pan
            <input type="range" min={0} max={100} value={pan} onChange={(e) => setPan(Number(e.target.value))} className="w-full" style={{ accentColor: '#2DFF6A' }} />
          </label>
          <div className="hw-badge" style={{ fontSize: 9, minWidth: 0 }}>Pan {pan}</div>
          <div className="hw-inset px-1 py-0.5 text-[9px]" style={{ color: '#9A9AA0' }}>
            Insert: —
          </div>
          <div className="hw-inset px-1 py-0.5 text-[9px]" style={{ color: '#9A9AA0' }}>
            Send: —
          </div>
          <div className="mt-auto flex gap-1">
            <button
              onClick={() => setMuted((v) => !v)}
              className="hw-squarebtn flex-1 px-1 py-0.5 text-[10px] font-bold"
              style={muted
                ? { background: '#2DFF6A', color: '#0B120C', borderColor: '#2DFF6A' }
                : { background: '#131316', color: '#9A9AA0' }}
              title="Mute"
            >
              M
            </button>
            <button
              onClick={() => setSolo((v) => !v)}
              className="hw-squarebtn flex-1 px-1 py-0.5 text-[10px] font-bold"
              style={solo
                ? { background: '#2DFF6A', color: '#0B120C', borderColor: '#2DFF6A' }
                : { background: '#131316', color: '#9A9AA0' }}
              title="Solo"
            >
              S
            </button>
          </div>
        </div>
      </div>
      <div className="mt-1 h-1.5" style={{ background: '#131316' }}>
        <div className="h-full" style={{ width: `${muted ? 0 : volume}%`, background: 'linear-gradient(to right, #2DFF6A, #F2F2F2)' }} />
      </div>
    </div>
  );
};

export const ChannelStrips: React.FC<ChannelStripsProps> = ({ preset }) => {
  const plugins = preset?.plugins ?? [];
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('preseter.channelStripsWidth.v1');
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) return Math.max(200, Math.min(520, parsed));
    } catch { /* ignora */ }
    return 300;
  });
  const resizing = useRef<{ startX: number; originW: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  return (
    <aside className="relative flex shrink-0 flex-col border-l" style={{ borderColor: '#26262B', background: '#101013', width }}>
      <div
        className="absolute bottom-0 left-[-4px] top-0 w-[7px] cursor-ew-resize"
        title="Arrastar para redimensionar"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          resizing.current = { startX: event.clientX, originW: widthRef.current };
        }}
        onPointerMove={(event) => {
          const r = resizing.current;
          if (!r) return;
          setWidth(Math.max(200, Math.min(520, r.originW - (event.clientX - r.startX))));
        }}
        onPointerUp={() => {
          resizing.current = null;
          try { localStorage.setItem('preseter.channelStripsWidth.v1', String(widthRef.current)); } catch { /* ignora */ }
        }}
        onPointerCancel={() => { resizing.current = null; }}
      />
      <div className="hw-label px-3 py-2.5" style={{ borderBottom: '1px solid #2E2E34' }}>
        Channel Strips {preset ? `— ${preset.name}` : ''}
      </div>
      <div className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto p-2">
        {plugins.length === 0 && (
          <div className="hw-inset w-full p-2 text-[10px] leading-relaxed" style={{ color: '#9A9AA0' }}>
            Nenhum channel strip neste patch.
            <br />
            No modo Edit, adicione instrumentos/efeitos para vê-los aqui.
          </div>
        )}
        {plugins.map((p) => (
          <Strip
            key={p.pluginId}
            title={p.name}
            subtitle={p.role === 'instrument' ? 'Software Instrument' : 'Audio FX'}
            badge={p.role === 'instrument' ? 'INST' : 'FX'}
            badgeColor={p.role === 'instrument' ? '#2DFF6A' : '#2DFF6A'}
          />
        ))}
        <Strip title="Master" subtitle="Output 1-2" badge="OUT" badgeColor="#2DFF6A" />
      </div>
      <div className="px-2 py-1 text-[9px]" style={{ borderTop: '1px solid #2E2E34', color: '#9A9AA0' }}>
        Mock visual — áudio real chega nas próximas fases
      </div>
    </aside>
  );
};
