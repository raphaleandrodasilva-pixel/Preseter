import React, { useState } from 'react';
import type { ElementType } from '@shared/types';
import { PALETTE_CATEGORIES, PALETTE_ITEMS, type PaletteCategory, type PaletteItem } from './elementFactory';

interface ControlPaletteProps {
  armedKey: string | null;
  onArm: (item: PaletteItem) => void;
}

export const DRAG_MIME = 'application/x-preseter-control';

function PaletteIcon({ type, orientation }: { type: ElementType; orientation?: 'horizontal' | 'vertical' }) {
  const base = 'flex items-center justify-center';
  switch (type) {
    case 'knob':
      return (
        <span className={`${base} h-9 w-9 rounded-full`} style={{ border: '4px solid #3A3A41', background: '#1F1F21' }}>
          <span className="h-3 w-0.5 rounded" style={{ background: '#F2F2F2' }} />
        </span>
      );
    case 'fader':
      return (
        <span className={`${base} h-9 w-4 rounded`} style={{ background: '#242426' }}>
          <span className="h-2 w-6 rounded" style={{ background: '#0A84FF' }} />
        </span>
      );
    case 'slider':
      return (
        <span className={`${base} h-4 w-9 rounded`} style={{ background: '#242426' }}>
          <span className="h-6 w-2 rounded" style={{ background: '#0A84FF' }} />
        </span>
      );
    case 'button':
      return <span className="h-6 w-12 rounded-lg" style={{ border: '1px solid #3A3A3C', background: '#1F1F21' }} />;
    case 'toggle':
      return <span className="h-5 w-11 rounded-lg" style={{ border: '1px solid #0A84FF', background: 'rgba(10,132,255,0.18)' }} />;
    case 'pad':
      return <span className="h-8 w-8 rounded-lg" style={{ border: '1px solid #0A84FF', background: 'rgba(10,132,255,0.12)' }} />;
    case 'pedal':
      return <span className="h-6 w-9 rounded-b-xl" style={{ border: '2px solid #3A3A41', background: '#303032' }} />;
    case 'label':
      return <span className="text-xs font-semibold" style={{ color: '#EDEDEF' }}>Aa</span>;
    case 'keyboard':
      return (
        <span className="flex h-7 w-12 items-stretch gap-[1px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="flex-1 rounded-b-sm" style={{ border: '1px solid #3A3A41', background: '#F2F2F2' }} />
          ))}
        </span>
      );
    case 'meter-vertical':
      return orientation === 'horizontal' ? (
        <span className="flex h-3 w-9 items-center overflow-hidden rounded" style={{ background: '#242426' }}>
          <span className="h-full w-2/3" style={{ background: 'linear-gradient(to right, #0A84FF, #F2F2F2)' }} />
        </span>
      ) : (
        <span className="flex h-9 w-3 items-end overflow-hidden rounded" style={{ background: '#242426' }}>
          <span className="h-2/3 w-full" style={{ background: 'linear-gradient(to top, #0A84FF, #F2F2F2)' }} />
        </span>
      );
    case 'midi-activity':
      return <span className="h-4 w-4 rounded-full" style={{ border: '2px solid #0A84FF', background: '#1F1F21' }} />;
    default:
      return <span className="h-6 w-6 rounded" style={{ background: '#303032' }} />;
  }
}

export const ControlPalette: React.FC<ControlPaletteProps> = ({ armedKey, onArm }) => {
  const [category, setCategory] = useState<PaletteCategory | 'all'>('panel');
  const items = PALETTE_ITEMS.filter((item) => category === 'all' || item.category === category);

  return (
    <div className="shrink-0 border-t" style={{ borderColor: '#303032', background: '#242426' }}>
      <div className="flex items-center gap-1 border-b px-4" style={{ borderColor: '#303032' }}>
        <span className="mr-2 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9A9AA0' }}>
          Screen Controls Palette
        </span>
        {PALETTE_CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setCategory(id)}
            className="border-b-2 px-3 py-2 text-xs"
            style={
              category === id
                ? { borderColor: '#0A84FF', color: '#fff' }
                : { borderColor: 'transparent', color: '#9A9AA0' }
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto hidden py-2 text-[11px] md:block" style={{ color: '#636366' }}>
          Arraste para o canvas ou clique e depois clique no canvas
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {items.map((item) => (
          <button
            key={item.key}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, item.key);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onArm(item)}
            title={`${item.label} — ${item.hint}`}
            className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center transition-colors"
            style={
              armedKey === item.key
                ? { borderColor: '#0A84FF', background: 'rgba(10,132,255,0.12)' }
                : { borderColor: '#3A3A3C', background: '#1F1F21' }
            }
          >
            <PaletteIcon type={item.type} orientation={item.orientation} />
            <span className="text-[10px] font-medium leading-tight" style={{ color: armedKey === item.key ? '#fff' : '#EDEDEF' }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
