import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Preset, PresetSet } from '@shared/types';
import { ModalShell } from '../ui/ModalShell';

interface PatchLibraryModalProps {
  presets: Preset[];
  sets: PresetSet[];
  currentPresetId: string | null;
  onSelect: (preset: Preset) => void;
  onClose: () => void;
}

/** Patch Library com busca (Fase 5.5). Lista os patches salvos do concert. */
export const PatchLibraryModal: React.FC<PatchLibraryModalProps> = ({
  presets,
  sets,
  currentPresetId,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...presets]
      .filter((preset) => {
        if (!term) return true;
        const setName = sets.find((set) => set.id === preset.setId)?.name ?? '';
        return `${preset.name} ${setName} ${preset.category ?? ''} ${preset.programNumber + 1}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => a.programNumber - b.programNumber);
  }, [presets, sets, query]);

  const choose = (preset: Preset) => {
    onSelect(preset);
    onClose();
  };

  return (
    <ModalShell
      label="Biblioteca"
      title="Patch Library"
      lcd={`${presets.length} patch(es)`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      maxHeight="max-h-[80vh]"
    >
      <div className="px-5 pb-2 pt-3">
        <div className="hw-label mb-1">Buscar patch</div>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && rows[0]) choose(rows[0]);
            if (event.key === 'Escape') onClose();
          }}
          placeholder="Buscar patch por nome, set, categoria ou número…"
          className="hw-inset w-full px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#0A84FF]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: '#8E8E93' }}>
            Nenhum patch encontrado.
          </div>
        )}
        {rows.map((preset) => {
          const set = sets.find((item) => item.id === preset.setId);
          const active = preset.id === currentPresetId;
          return (
            <button
              key={preset.id}
              onClick={() => choose(preset)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[#2C2C2E]"
              style={active ? { background: 'rgba(10,132,255,0.22)', color: '#fff' } : { color: '#E5E5EA' }}
            >
              <span className="w-8 shrink-0 text-right tabular-nums" style={{ color: '#8E8E93' }}>
                {String(preset.programNumber + 1).padStart(3, '0')}
              </span>
              <span className="w-5 shrink-0 text-center">{preset.icon ?? '🎹'}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{preset.name}</span>
              {preset.category && <span className="shrink-0 text-[10px]" style={{ color: '#8E8E93' }}>{preset.category}</span>}
              <span className="shrink-0 text-[10px]" style={{ color: '#8E8E93' }}>
                {set ? `📁 ${set.name}` : 'Sem set'}
              </span>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
};
