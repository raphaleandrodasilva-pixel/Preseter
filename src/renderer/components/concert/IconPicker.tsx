import React, { useEffect, useRef, useState } from 'react';
import {
  PATCH_ICON_LABELS,
  isPatchIconId,
  type PatchIconId,
} from '@shared/patch-icons';
import { PATCH_ICONS, PatchIcon, PICKER_ICON_IDS } from '../icons/PatchIcons';

interface IconPickerProps {
  /** ID novo ou emoji/texto legado. */
  value?: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}

/** Seletor de ícone do patch: grade de SVGs + emoji/texto personalizado. */
export const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const currentId = isPatchIconId(value) ? value : null;
  const currentLabel = currentId ? PATCH_ICON_LABELS[currentId] : value || 'Genérico';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const legacy = value && !isPatchIconId(value) ? value : '';
    setShowCustom(Boolean(legacy));
    setCustomValue(legacy);
    setOpen(true);
  };

  const select = (id: PatchIconId) => {
    onChange(id);
    setShowCustom(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        className="hw-inset flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-slate-100 disabled:opacity-50"
        aria-label="Escolher ícone do patch"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        <PatchIcon icon={value} size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
        <span className="shrink-0 text-[9px]" style={{ color: '#8E8E93' }}>▾</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Selecionar ícone"
          className="hw-panel absolute left-0 top-full z-50 mt-1 w-64 p-2"
        >
          <div className="grid grid-cols-6 gap-1">
            {PICKER_ICON_IDS.map((id) => {
              const Component = PATCH_ICONS[id];
              const active = currentId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md border"
                  aria-label={`Ícone ${PATCH_ICON_LABELS[id]}`}
                  aria-pressed={active}
                  title={PATCH_ICON_LABELS[id]}
                  style={{
                    borderColor: active ? '#0A84FF' : '#3A3A3C',
                    background: active ? 'rgba(10,132,255,0.25)' : '#242426',
                    color: active ? '#9AD1FF' : '#D1D1D6',
                  }}
                  onClick={() => select(id)}
                >
                  <Component size={17} />
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              className="hw-squarebtn flex-1 px-2 py-1 text-[10px]"
              aria-pressed={currentId === 'none'}
              onClick={() => select('none')}
            >
              Nenhum
            </button>
            <button
              type="button"
              className="hw-squarebtn flex-1 px-2 py-1 text-[10px]"
              aria-pressed={showCustom}
              onClick={() => setShowCustom((previous) => !previous)}
            >
              Personalizado…
            </button>
          </div>

          {showCustom && (
            <label className="mt-2 block text-[10px]" style={{ color: '#9A9AA0' }}>
              Emoji ou texto
              <input
                className="hw-inset mt-1 w-full px-2 py-1 text-xs text-slate-100"
                aria-label="Ícone personalizado"
                value={customValue}
                placeholder="🎹"
                maxLength={8}
                onChange={(event) => {
                  const next = event.target.value;
                  setCustomValue(next);
                  onChange(next);
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
};
