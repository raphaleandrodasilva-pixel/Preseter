import React, { useMemo, useRef, useState } from 'react';
import type { Preset, PresetSet } from '@shared/types';

interface PatchListProps {
  presets: Preset[];
  sets: PresetSet[];
  currentPresetId: string | null;
  concertName: string;
  concertSelected: boolean;
  onSelectConcert: () => void;
  onSelectPreset: (preset: Preset) => void;
  onEditPreset: (preset: Preset) => void;
  onNewPatch: (setId?: string) => void;
  onNewSet: () => void;
  onRenameSet: (setId: string, name: string) => void;
  onDeleteSet: (setId: string) => void;
  onToggleSetExpanded: (setId: string) => void;
  onToggleSetSkipped: (setId: string) => void;
  onTogglePresetSkipped: (presetId: string) => void;
  onMovePresetToSet: (presetId: string, setId: string | undefined) => void;
  onReorderPatches: (setId: string | undefined, orderedIds: string[]) => void;
  onReorderSets: (orderedIds: string[]) => void;
  onResetProgramNumbers: () => void;
  onDeletePreset: (presetId: string) => void;
}

function sortedSets(sets: PresetSet[]): PresetSet[] {
  return [...sets].sort((a, b) => a.order - b.order);
}

function patchesOf(presets: Preset[], setId: string | undefined): Preset[] {
  return presets
    .filter((p) => (p.setId ?? undefined) === setId)
    .sort((a, b) => (a.setOrder ?? a.programNumber) - (b.setOrder ?? b.programNumber));
}

export const PatchList: React.FC<PatchListProps> = ({
  presets,
  sets,
  currentPresetId,
  concertName,
  concertSelected,
  onSelectConcert,
  onSelectPreset,
  onEditPreset,
  onNewPatch,
  onNewSet,
  onRenameSet,
  onDeleteSet,
  onToggleSetExpanded,
  onToggleSetSkipped,
  onTogglePresetSkipped,
  onMovePresetToSet,
  onReorderPatches,
  onReorderSets,
  onResetProgramNumbers,
  onDeletePreset,
}) => {
  const [query, setQuery] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [renamingSetId, setRenamingSetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const orderedSets = useMemo(() => sortedSets(sets), [sets]);

  // Seleção rápida estilo MainStage: F foca, número ou nome seleciona
  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const q = query.trim().toLowerCase();
      if (!q) return;
      const byNumber = /^\d+$/.test(q)
        ? presets.find((p) => p.programNumber + 1 === Number(q))
        : undefined;
      const match =
        byNumber ?? presets.find((p) => p.name.toLowerCase().includes(q));
      if (match) {
        onSelectPreset(match);
        setQuery('');
      }
    }
  };

  const renderPatchRow = (preset: Preset) => {
    const active = preset.id === currentPresetId;
    const skipped = !!preset.skipped;
    return (
      <div
        key={preset.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-preseter-patch', preset.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('application/x-preseter-patch');
          if (!draggedId || draggedId === preset.id) return;
          const setId = preset.setId ?? undefined;
          const list = patchesOf(presets, setId);
          const without = list.map((p) => p.id).filter((id) => id !== draggedId);
          const idx = without.indexOf(preset.id);
          without.splice(idx, 0, draggedId);
          // Se arrastou de outro set, move junto
          const dragged = presets.find((p) => p.id === draggedId);
          if (dragged && (dragged.setId ?? undefined) !== setId) {
            onMovePresetToSet(draggedId, setId);
          }
          onReorderPatches(setId, without);
        }}
        className="group flex items-center gap-1 rounded px-1.5 py-[3px] text-xs"
        style={active ? { background: 'linear-gradient(to bottom, #2F93FF, #0A6FE0)', color: '#fff' } : { color: '#EDEDEF' }}
      >
        <span className="w-7 shrink-0 text-right tabular-nums" style={{ color: active ? 'rgba(255,255,255,0.8)' : '#8E8E93' }}>
          {String(preset.programNumber + 1).padStart(3, '0')}
        </span>
        <span className="w-4 shrink-0 text-center">{preset.icon ?? '🎹'}</span>
        <button
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelectPreset(preset)}
          title={`${preset.name} — prog ${preset.programNumber + 1}${preset.bankNumber ? ` banco ${preset.bankNumber}` : ''}`}
        >
          {preset.name}
        </button>
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-amber-200 group-hover:block"
          title={skipped ? 'Ativar (Don’t Skip)' : 'Pular (Skip) — ignora em Program Change'}
          onClick={() => onTogglePresetSkipped(preset.id)}
        >
          {skipped ? '○' : '⊘'}
        </button>
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-amber-200 group-hover:block"
          title="Editar"
          onClick={() => onEditPreset(preset)}
        >
          ✎
        </button>
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-red-300 group-hover:block"
          title="Deletar patch"
          onClick={() => onDeletePreset(preset.id)}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r" style={{ borderColor: '#0E0E10', background: '#262628' }}>
      <div className="flex items-center gap-1 border-b px-2 py-2" style={{ borderColor: '#303032' }}>
        <div className="hw-label">Patch List</div>
        <span className="ml-auto text-[10px]" style={{ color: '#636366' }}>{presets.length}</span>
        <button
          className="hw-squarebtn px-1.5 py-0.5 text-sm"
          title="Adicionar patch no fim"
          onClick={() => onNewPatch(undefined)}
        >
          +
        </button>
        <div className="relative">
          <button
            className="hw-squarebtn px-1.5 py-0.5 text-xs"
            title="Action menu — novo set, reset program numbers"
            onClick={() => setActionOpen((v) => !v)}
          >
            ⚙
          </button>
          {actionOpen && (
            <div className="absolute right-0 top-7 z-30 w-56 rounded-lg p-1 shadow-xl" style={{ border: '1px solid #3A3A3C', background: '#1F1F21' }}>
              <button className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]" style={{ color: '#EDEDEF' }} onClick={() => { onNewSet(); setActionOpen(false); }}>
                + Novo Set
              </button>
              <button className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]" style={{ color: '#EDEDEF' }} onClick={() => { onNewPatch(undefined); setActionOpen(false); }}>
                + Novo Patch
              </button>
              <button className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]" style={{ color: '#EDEDEF' }} onClick={() => { onResetProgramNumbers(); setActionOpen(false); }}>
                Reset Program Change Numbers
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="border-b px-2 py-1.5" style={{ borderColor: '#303032' }}>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder="Buscar: nº ou nome + Enter (F foca)"
          className="w-full rounded-lg px-2 py-1 text-[11px] outline-none"
          style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#EDEDEF' }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <button
          onClick={onSelectConcert}
          className="mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-[5px] text-left text-xs font-semibold"
          style={
            concertSelected
              ? { background: 'linear-gradient(to bottom, #2F93FF, #0A6FE0)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.06)', color: '#EDEDEF' }
          }
          title="Concert — abrir as configurações do concert"
        >
          <span className="w-4 shrink-0 text-center">♫</span>
          <span className="min-w-0 flex-1 truncate">{concertName}</span>
          <span style={{ color: concertSelected ? 'rgba(255,255,255,0.8)' : '#8E8E93' }}>Concert</span>
        </button>
        {presets.length === 0 && (
          <div className="rounded-lg p-3 text-center text-[11px]" style={{ border: '1px solid #3A3A3C', color: '#9A9AA0' }}>
            Concert vazio. Crie um Set e seu primeiro Patch.
          </div>
        )}
        {orderedSets.map((set) => {
          const list = patchesOf(presets, set.id);
          const expanded = set.expanded !== false;
          return (
            <section
              key={set.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-preseter-set', set.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.types.includes('application/x-preseter-patch')) {
                  const patchId = e.dataTransfer.getData('application/x-preseter-patch');
                  if (patchId) onMovePresetToSet(patchId, set.id);
                  return;
                }
                const draggedSet = e.dataTransfer.getData('application/x-preseter-set');
                if (!draggedSet || draggedSet === set.id) return;
                const ids = orderedSets.map((s) => s.id).filter((id) => id !== draggedSet);
                ids.splice(orderedSets.findIndex((s) => s.id === set.id), 0, draggedSet);
                onReorderSets(ids);
              }}
              className="mb-0.5"
              style={set.skipped ? { opacity: 0.5 } : undefined}
            >
              <div className="flex items-center gap-1 rounded px-1.5 py-[3px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <button
                  className="text-[10px] text-slate-500 hover:text-slate-200"
                  onClick={() => onToggleSetExpanded(set.id)}
                  title={expanded ? 'Recolher' : 'Expandir'}
                >
                  {expanded ? '▾' : '▸'}
                </button>
                {renamingSetId === set.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) onRenameSet(set.id, renameValue.trim());
                      setRenamingSetId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renameValue.trim()) {
                        onRenameSet(set.id, renameValue.trim());
                        setRenamingSetId(null);
                      }
                      if (e.key === 'Escape') setRenamingSetId(null);
                    }}
                    className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-xs outline-none"
                    style={{ border: '1px solid #0A84FF', background: '#242426', color: '#fff' }}
                  />
                ) : (
                  <button
                    className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-200"
                    onDoubleClick={() => {
                      setRenamingSetId(set.id);
                      setRenameValue(set.name);
                    }}
                    title="Duplo clique renomeia"
                  >
                    📁 {set.name}
                  </button>
                )}
                <span className="text-[10px] text-slate-600">{list.length}</span>
                <button className="rounded px-1 text-[11px] text-slate-500 hover:text-amber-200" title="Novo patch neste set" onClick={() => onNewPatch(set.id)}>
                  +
                </button>
                <button className="rounded px-1 text-[10px] text-slate-500 hover:text-slate-200" title={set.skipped ? 'Ativar set' : 'Pular set'} onClick={() => onToggleSetSkipped(set.id)}>
                  {set.skipped ? '○' : '⊘'}
                </button>
                <button className="rounded px-1 text-[10px] text-slate-500 hover:text-red-300" title="Deletar set (patches voltam p/ sem set)" onClick={() => onDeleteSet(set.id)}>
                  ×
                </button>
              </div>
              {expanded && (
                <div
                  className="px-1 pb-1"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const patchId = e.dataTransfer.getData('application/x-preseter-patch');
                    if (patchId) onMovePresetToSet(patchId, set.id);
                  }}
                >
                  {list.length === 0 && (
                    <div className="px-2 py-1 text-[10px] text-slate-600">Arraste patches para cá</div>
                  )}
                  {list.map(renderPatchRow)}
                </div>
              )}
            </section>
          );
        })}
        <div
          className="mt-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const patchId = e.dataTransfer.getData('application/x-preseter-patch');
            if (patchId) onMovePresetToSet(patchId, undefined);
          }}
        >
          <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Sem set
          </div>
          {patchesOf(presets, undefined).map(renderPatchRow)}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2 py-1.5 text-[10px]" style={{ borderColor: '#303032', color: '#636366' }}>
        <span>Set</span>
        <span>Patch</span>
        <span className="ml-auto">F busca · ←/→ navega · duplo clique renomeia set</span>
      </div>
    </aside>
  );
};
