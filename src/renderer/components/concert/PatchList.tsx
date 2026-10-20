import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onSetTranspose: (setId: string, semitones: number) => void;
  onToggleSetExpanded: (setId: string) => void;
  onToggleSetSkipped: (setId: string) => void;
  onTogglePresetSkipped: (presetId: string) => void;
  onReorderSets: (orderedIds: string[]) => void;
  onResetProgramNumbers: () => void;
  onCopyPatches: (ids: string[]) => void;
  onPastePatches: (setId: string | undefined, afterId: string | null) => Promise<string[]>;
  onDuplicatePatches: (ids: string[]) => Promise<string[]>;
  onDeletePatches: (ids: string[]) => Promise<void>;
  onNewPatchFromSelection: (ids: string[]) => Promise<void>;
  onNewSetFromSelection: (ids: string[]) => Promise<void>;
  onExportPatch: (presetId: string) => void;
  onImportPatch: () => void;
  onExportSet: (setId: string) => void;
  onImportSet: () => void;
  onMovePatches: (
    ids: string[],
    setId: string | undefined,
    beforeId: string | null,
    copy: boolean
  ) => Promise<string[]>;
  compact?: boolean;
}

function sortedSets(sets: PresetSet[]): PresetSet[] {
  return [...sets].sort((a, b) => a.order - b.order);
}

function patchesOf(presets: Preset[], setId: string | undefined): Preset[] {
  return presets
    .filter((p) => (p.setId ?? undefined) === setId)
    .sort((a, b) => (a.setOrder ?? a.programNumber) - (b.setOrder ?? b.programNumber));
}

/** Lê a lista de patches arrastados (MainStage permite arrastar a seleção inteira). */
function draggedPatchIds(e: React.DragEvent): string[] | null {
  const raw = e.dataTransfer.getData('application/x-preseter-patches');
  if (!raw) return null;
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
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
  onSetTranspose,
  onToggleSetExpanded,
  onToggleSetSkipped,
  onTogglePresetSkipped,
  onReorderSets,
  onResetProgramNumbers,
  onCopyPatches,
  onPastePatches,
  onDuplicatePatches,
  onDeletePatches,
  onNewPatchFromSelection,
  onNewSetFromSelection,
  onExportPatch,
  onImportPatch,
  onExportSet,
  onImportSet,
  onMovePatches,
  compact = false,
}) => {
  const [query, setQuery] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [renamingSetId, setRenamingSetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  /** Patches selecionados na lista (clique, Cmd/Ctrl-clique e Shift-clique). */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Último item clicado, base do Shift-clique. */
  const anchorRef = useRef<string | null>(null);
  /** Sentido do último movimento, usado pelo "Mover novamente" do MainStage. */
  const [moveDirection, setMoveDirection] = useState<1 | -1>(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const orderedSets = useMemo(() => sortedSets(sets), [sets]);

  // Ordem visual completa da lista: sets na ordem, patches de cada set, depois "Sem set".
  const visualPatches = useMemo(() => {
    const ordered: Preset[] = [];
    for (const set of orderedSets) ordered.push(...patchesOf(presets, set.id));
    ordered.push(...patchesOf(presets, undefined));
    return ordered;
  }, [presets, orderedSets]);

  // Mantém a seleção coerente com a lista (patch deletado deixa de existir).
  useEffect(() => {
    setSelectedIds((previous) => {
      const next = previous.filter((id) => presets.some((preset) => preset.id === id));
      return next.length === previous.length ? previous : next;
    });
  }, [presets]);

  // O patch carregado entra na seleção, como no MainStage.
  useEffect(() => {
    if (!currentPresetId) return;
    setSelectedIds((previous) =>
      previous.includes(currentPresetId) ? previous : [currentPresetId]
    );
    anchorRef.current = currentPresetId;
  }, [currentPresetId]);

  const focusList = () => listRef.current?.focus({ preventScroll: true });

  /** Aplica o resultado de uma operação e seleciona os patches resultantes. */
  const adopt = async (operation: Promise<string[]>) => {
    const ids = await operation;
    if (ids.length > 0) {
      setSelectedIds(ids);
      anchorRef.current = ids[0];
    }
    focusList();
  };

  const handlePatchClick = (e: React.MouseEvent, preset: Preset) => {
    const additive = e.metaKey || e.ctrlKey;
    if (e.shiftKey && anchorRef.current) {
      const from = visualPatches.findIndex((item) => item.id === anchorRef.current);
      const to = visualPatches.findIndex((item) => item.id === preset.id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelectedIds(visualPatches.slice(start, end + 1).map((item) => item.id));
        onSelectPreset(preset);
        focusList();
        return;
      }
    }
    if (additive) {
      setSelectedIds((previous) =>
        previous.includes(preset.id)
          ? previous.filter((id) => id !== preset.id)
          : [...previous, preset.id]
      );
      anchorRef.current = preset.id;
      onSelectPreset(preset);
      focusList();
      return;
    }
    setSelectedIds([preset.id]);
    anchorRef.current = preset.id;
    onSelectPreset(preset);
    focusList();
  };

  const handleCopy = (ids: string[]) => {
    if (ids.length === 0) return;
    onCopyPatches(ids);
  };

  const handlePaste = () => {
    const lastSelected = [...visualPatches]
      .reverse()
      .find((preset) => selectedIds.includes(preset.id));
    void adopt(
      onPastePatches(lastSelected ? lastSelected.setId ?? undefined : undefined, lastSelected?.id ?? null)
    );
  };

  const handleDuplicate = (ids: string[]) => {
    if (ids.length === 0) return;
    void adopt(onDuplicatePatches(ids));
  };

  const handleDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedIds((previous) => previous.filter((id) => !ids.includes(id)));
    void onDeletePatches(ids);
  };

  /**
   * Move Again do MainStage: repete o último movimento (uma posição por vez,
   * no mesmo sentido) para levar a seleção várias casas sem arrastar de novo.
   */
  const moveAgain = () => {
    if (selectedIds.length === 0) return;
    const first = visualPatches.find((preset) => preset.id === selectedIds[0]);
    if (!first) return;
    const setId = first.setId ?? undefined;
    const list = patchesOf(presets, setId);
    const idsInSet = list.filter((preset) => selectedIds.includes(preset.id)).map((preset) => preset.id);
    if (idsInSet.length === 0) return;
    const firstIndex = list.findIndex((preset) => preset.id === idsInSet[0]);
    const lastIndex = list.findIndex((preset) => preset.id === idsInSet[idsInSet.length - 1]);

    if (moveDirection > 0) {
      if (lastIndex < 0 || lastIndex >= list.length - 1) return;
      const beforeId = list[lastIndex + 2]?.id ?? null;
      void adopt(onMovePatches(idsInSet, setId, beforeId, false));
    } else {
      if (firstIndex <= 0) return;
      void adopt(onMovePatches(idsInSet, setId, list[firstIndex - 1].id, false));
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input,textarea,select')) return;
    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.altKey && key === 'c' && selectedIds.length > 0) {
      e.preventDefault();
      handleCopy(selectedIds);
      return;
    }
    if (mod && !e.altKey && key === 'v') {
      e.preventDefault();
      handlePaste();
      return;
    }
    if (mod && !e.altKey && key === 'd' && selectedIds.length > 0) {
      e.preventDefault();
      handleDuplicate(selectedIds);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault();
      handleDelete(selectedIds);
      return;
    }
    if (e.altKey && e.shiftKey && key === 'm') {
      e.preventDefault();
      moveAgain();
      return;
    }
    if (e.key === 'Escape') {
      setSelectedIds([]);
      anchorRef.current = null;
    }
  };

  const handlePatchDragStart = (e: React.DragEvent, preset: Preset) => {
    e.stopPropagation();
    const ids = selectedIds.includes(preset.id) ? selectedIds : [preset.id];
    if (!selectedIds.includes(preset.id)) {
      setSelectedIds([preset.id]);
      anchorRef.current = preset.id;
    }
    const ordered = visualPatches.map((item) => item.id).filter((id) => ids.includes(id));
    e.dataTransfer.setData('application/x-preseter-patches', JSON.stringify(ordered));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handlePatchDrop = (e: React.DragEvent, target: Preset | null, setId: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = draggedPatchIds(e);
    if (!ids || ids.length === 0) return;
    if (target && ids.includes(target.id)) return;
    const targetIndex = target ? visualPatches.findIndex((preset) => preset.id === target.id) : -1;
    const firstIndex = visualPatches.findIndex((preset) => ids.includes(preset.id));
    if (!e.altKey && targetIndex !== -1 && firstIndex !== -1) {
      setMoveDirection(targetIndex > firstIndex ? 1 : -1);
    }
    // Option-arrastar copia, como no MainStage.
    void adopt(onMovePatches(ids, setId, target?.id ?? null, e.altKey));
  };

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
        setSelectedIds([match.id]);
        anchorRef.current = match.id;
        setQuery('');
      }
    }
  };

  const renderPatchRow = (preset: Preset) => {
    const active = preset.id === currentPresetId;
    const selected = selectedIds.includes(preset.id);
    const skipped = !!preset.skipped;
    return (
      <div
        key={preset.id}
        draggable
        onDragStart={(e) => handlePatchDragStart(e, preset)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handlePatchDrop(e, preset, preset.setId ?? undefined)}
        onClick={(e) => handlePatchClick(e, preset)}
        className="group flex cursor-default items-center gap-1 rounded px-1.5 py-[3px] text-xs"
        style={
          active
            ? { background: 'linear-gradient(to bottom, #2F93FF, #0A6FE0)', color: '#fff' }
            : selected
              ? { background: 'rgba(10,132,255,0.28)', color: '#EDEDEF' }
              : { color: '#EDEDEF' }
        }
        title={`${preset.name} — prog ${preset.programNumber + 1}${preset.bankNumber ? ` banco ${preset.bankNumber}` : ''}`}
      >
        <span className="w-7 shrink-0 text-right tabular-nums" style={{ color: active ? 'rgba(255,255,255,0.8)' : '#8E8E93' }}>
          {String(preset.programNumber + 1).padStart(3, '0')}
        </span>
        <span className="w-4 shrink-0 text-center">{preset.icon ?? '🎹'}</span>
        <span className="min-w-0 flex-1 truncate text-left">{preset.name}</span>
        {preset.shortcut && (
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold"
            style={{ background: '#2C2C2E', color: '#9AD1FF', border: '1px solid #3A3A3C' }}
            title={`Atalho: ${preset.shortcut}`}
          >
            {preset.shortcut}
          </span>
        )}
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-amber-200 group-hover:block"
          title={skipped ? 'Ativar (Don’t Skip)' : 'Pular (Skip) — ignora em Program Change'}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePresetSkipped(preset.id);
          }}
        >
          {skipped ? '○' : '⊘'}
        </button>
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-amber-200 group-hover:block"
          title="Editar"
          onClick={(e) => {
            e.stopPropagation();
            onEditPreset(preset);
          }}
        >
          ✎
        </button>
        <button
          className="hidden shrink-0 rounded px-1 text-[10px] text-slate-500 hover:text-red-300 group-hover:block"
          title="Deletar patch"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete([preset.id]);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  const multipleSelection = selectedIds.length > 1;

  return (
    <aside
      ref={listRef}
      data-patch-list
      tabIndex={0}
      onKeyDown={handleListKeyDown}
      className={`flex shrink-0 flex-col border-r outline-none ${compact ? 'w-[200px]' : 'w-[264px]'}`}
      style={{ borderColor: '#0E0E10', background: '#262628' }}
    >
      <div className="flex items-center gap-1 border-b px-2 py-2" style={{ borderColor: '#303032' }}>
        <div className="hw-label" title={multipleSelection ? `${selectedIds.length} patches selecionados` : undefined}>
          {multipleSelection ? `Multiple Selection (${selectedIds.length})` : 'Patch List'}
        </div>
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
            title="Action menu — novo set, copiar, colar, mover novamente"
            onClick={() => setActionOpen((v) => !v)}
          >
            ⚙
          </button>
          {actionOpen && (
            <div className="absolute right-0 top-7 z-30 w-60 rounded-lg p-1 shadow-xl" style={{ border: '1px solid #3A3A3C', background: '#1F1F21' }}>
              <button className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]" style={{ color: '#EDEDEF' }} onClick={() => { onNewSet(); setActionOpen(false); }}>
                + Novo Set
              </button>
              <button className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]" style={{ color: '#EDEDEF' }} onClick={() => { onNewPatch(undefined); setActionOpen(false); }}>
                + Novo Patch
              </button>
              <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { handleCopy(selectedIds); setActionOpen(false); }}
              >
                Copiar patches <span style={{ color: '#8E8E93' }}>Ctrl+C</span>
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]"
                style={{ color: '#EDEDEF' }}
                onClick={() => { handlePaste(); setActionOpen(false); }}
              >
                Colar patches <span style={{ color: '#8E8E93' }}>Ctrl+V</span>
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { handleDuplicate(selectedIds); setActionOpen(false); }}
              >
                Duplicar patches <span style={{ color: '#8E8E93' }}>Ctrl+D</span>
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { moveAgain(); setActionOpen(false); }}
              >
                Mover novamente <span style={{ color: '#8E8E93' }}>Shift+Alt+M</span>
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { handleDelete(selectedIds); setActionOpen(false); }}
              >
                Deletar patches <span style={{ color: '#8E8E93' }}>Delete</span>
              </button>
              <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { void onNewPatchFromSelection(selectedIds); setActionOpen(false); }}
              >
                Novo patch a partir da seleção
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { void onNewSetFromSelection(selectedIds); setActionOpen(false); }}
              >
                Novo set a partir da seleção
              </button>
              <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E] disabled:opacity-40"
                style={{ color: '#EDEDEF' }}
                disabled={selectedIds.length === 0}
                onClick={() => { onExportPatch(selectedIds[0]); setActionOpen(false); }}
              >
                Exportar patch selecionado…
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]"
                style={{ color: '#EDEDEF' }}
                onClick={() => { onImportPatch(); setActionOpen(false); }}
              >
                Importar patch…
              </button>
              <button
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[#2C2C2E]"
                style={{ color: '#EDEDEF' }}
                onClick={() => { onImportSet(); setActionOpen(false); }}
              >
                Importar set…
              </button>
              <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />
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
                const patchIds = draggedPatchIds(e);
                if (patchIds && patchIds.length > 0) {
                  void adopt(onMovePatches(patchIds, set.id, null, e.altKey));
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
                <label className="flex items-center gap-0.5 text-[9px] text-slate-600" title="Transpose do set (semitons)">
                  <span>↕</span>
                  <input
                    type="number"
                    min={-24}
                    max={24}
                    value={set.transpose ?? 0}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onSetTranspose(set.id, Math.max(-24, Math.min(24, Number(event.target.value) || 0)))}
                    className="w-7 rounded px-0.5 py-0 text-[9px] outline-none"
                    style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
                  />
                </label>
                <button className="rounded px-1 text-[11px] text-slate-500 hover:text-amber-200" title="Novo patch neste set" onClick={() => onNewPatch(set.id)}>
                  +
                </button>
                <button className="rounded px-1 text-[10px] text-slate-500 hover:text-slate-200" title={set.skipped ? 'Ativar set' : 'Pular set'} onClick={() => onToggleSetSkipped(set.id)}>
                  {set.skipped ? '○' : '⊘'}
                </button>
                <button className="rounded px-1 text-[10px] text-slate-500 hover:text-sky-300" title="Exportar set…" onClick={() => onExportSet(set.id)}>
                  ⇩
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
                    e.stopPropagation();
                    const patchIds = draggedPatchIds(e);
                    if (patchIds && patchIds.length > 0) {
                      void adopt(onMovePatches(patchIds, set.id, null, e.altKey));
                    }
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
            const patchIds = draggedPatchIds(e);
            if (patchIds && patchIds.length > 0) {
              void adopt(onMovePatches(patchIds, undefined, null, e.altKey));
            }
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
        <span className="ml-auto truncate" title="Ctrl+C copia · Ctrl+V cola · Ctrl+D duplica · Option-arrastar copia · Shift+Alt+M move novamente">
          F busca · Ctrl+C/V/D · ⌥arrasta copia · ⇧⌥M move de novo
        </span>
      </div>
    </aside>
  );
};
