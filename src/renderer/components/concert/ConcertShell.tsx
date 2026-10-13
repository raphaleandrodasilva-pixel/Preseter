import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Preset, UiElement } from '@shared/types';
import { useAppContext } from '../../context/AppContext';
import { ModeToolbar, type ConcertMode } from './ModeToolbar';
import { PatchList } from './PatchList';
import { ChannelStrips } from './ChannelStrips';
import { Inspector } from './Inspector';
import { SettingsModal, type SettingsTab } from './SettingsModal';
import { ComposerCanvas } from '../composer/ComposerCanvas';
import { ControlPalette } from '../composer/ControlPalette';
import { buildScannedParams } from '../composer/MappingTable';
import { findPaletteItem, makeElement, snap8, type PaletteItem } from '../composer/elementFactory';
import { PatchLcd } from '../hardware/PatchLcd';
import { StageControl } from '../stage/StageControl';

interface ConcertShellProps {
  mode: ConcertMode;
  onModeChange: (mode: ConcertMode) => void;
  draft: Preset | null;
  onDraftChange: (preset: Preset) => void;
  selectedId: string | null;
  onSelectedId: (id: string | null) => void;
  armedKey: string | null;
  onArmedKey: (key: string | null) => void;
  saving: boolean;
  toast: string;
  error: string | null;
  onSelectPreset: (preset: Preset) => void;
  onNewPatch: (setId?: string) => void;
  onEditPreset: (preset: Preset) => void;
  onSaveDraft: () => void;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
}

export const ConcertShell: React.FC<ConcertShellProps> = ({
  mode,
  onModeChange,
  draft,
  onDraftChange,
  selectedId,
  onSelectedId,
  armedKey,
  onArmedKey,
  saving,
  toast,
  error,
  onSelectPreset,
  onNewPatch,
  onEditPreset,
  onSaveDraft,
  onMidiMessage,
  onSetVstParameter,
}) => {
  const ctx = useAppContext();
  const {
    presets, sets, concertName, setConcertName,
    currentPreset, scannedPlugins, midiLastMessage, appStatus, setAppStatus,
    createSet, renameSet, deleteSet, toggleSetExpanded, toggleSetSkipped,
    movePresetToSet, reorderPatchesInSet, reorderSets, togglePresetSkipped,
    resetProgramNumbers, deletePreset, activeNotes, sendMidiMessage,
  } = ctx;
  const toastTimer = useRef<number | undefined>(undefined);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const activePreset = draft ?? currentPreset;
  const scannedParams = useMemo(() => buildScannedParams(scannedPlugins), [scannedPlugins]);
  const selected = activePreset?.layout.elements.find((e) => e.id === selectedId) ?? null;

  const updateDraft = (update: Partial<Preset>) => {
    if (draft) onDraftChange({ ...draft, ...update, updatedAt: Date.now() });
  };
  const updateElement = (id: string, update: Partial<UiElement>) => {
    if (!draft) return;
    onDraftChange({
      ...draft,
      layout: {
        ...draft.layout,
        elements: draft.layout.elements.map((el) => (el.id === id ? { ...el, ...update } : el)),
      },
      updatedAt: Date.now(),
    });
  };
  const removeElement = (id: string) => {
    if (!draft) return;
    onDraftChange({
      ...draft,
      layout: { ...draft.layout, elements: draft.layout.elements.filter((el) => el.id !== id) },
      updatedAt: Date.now(),
    });
    if (selectedId === id) onSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    if (!draft) return;
    const src = draft.layout.elements.find((el) => el.id === id);
    if (!src) return;
    const copy: UiElement = { ...src, id: `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, x: src.x + 16, y: src.y + 16 };
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, copy] }, updatedAt: Date.now() });
    onSelectedId(copy.id);
  };
  const bringFront = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...els, t] }, updatedAt: Date.now() });
  };
  const sendBack = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [t, ...els] }, updatedAt: Date.now() });
  };
  const placeItems = (item: PaletteItem, x: number, y: number) => {
    if (!draft) return;
    const created: UiElement[] = [];
    if (item.group) {
      for (const m of item.group) created.push({ ...makeElement(m.type, snap8(x + m.dx), snap8(y + m.dy), m.label) });
    } else {
      const el = makeElement(item.type, 0, 0, item.label, item.orientation);
      el.x = snap8(Math.max(0, x - el.width / 2));
      el.y = snap8(Math.max(0, y - el.height / 2));
      created.push(el);
    }
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, ...created] }, updatedAt: Date.now() });
    onSelectedId(created[0].id);
    onArmedKey(null);
  };
  const armItem = (item: PaletteItem) => {
    if (!draft) return;
    onArmedKey(armedKey === item.key ? null : item.key);
  };

  // Atalhos globais: Cmd+1/2/3 modos, Del remove, Ctrl+D duplica, F foca busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); onModeChange('layout'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); onModeChange('edit'); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === '3' || e.key === '4')) { e.preventDefault(); onModeChange('perform'); return; }
      if (target?.closest('input,select,textarea')) return;
      if (e.key.toLowerCase() === 'f') {
        const input = document.querySelector('aside input[placeholder*="Buscar"]') as HTMLInputElement | null;
        if (input) { e.preventDefault(); input.focus(); }
        return;
      }
      if (mode === 'perform') {
        if (e.key === 'Escape') onModeChange('edit');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          // Navega patches pulando skipped (MainStage: Cmd+setas pula skip; simples aqui)
          const ordered = [...presets].sort((a, b) => a.programNumber - b.programNumber).filter((p) => !p.skipped);
          const idx = ordered.findIndex((p) => p.id === currentPreset?.id);
          const next = e.key === 'ArrowDown' ? ordered[idx + 1] : ordered[idx - 1];
          if (next) { e.preventDefault(); onSelectPreset(next); }
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); removeElement(selectedId); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicateElement(selectedId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedId, draft, presets, currentPreset]);

  const panic = () => {
    // All Notes Off em todos os canais
    for (let ch = 0; ch < 16; ch++) void sendMidiMessage([0xb0 | ch, 123, 0]);
  };

  if (mode === 'perform') {
    const elements = currentPreset?.layout.elements ?? [];
    return (
      <div className="flex h-full flex-col text-slate-200" style={{ background: '#0B0B0D' }}>
        <div
          className="flex h-14 shrink-0 items-center gap-3 border-b px-4 text-xs"
          style={{ background: 'linear-gradient(to bottom, #17171A, #0B0B0D)', borderColor: '#26262B' }}
        >
          <PatchLcd
            programNumber={currentPreset?.programNumber ?? appStatus.currentProgramNumber}
            patchName={currentPreset?.name ?? null}
            tempo={appStatus.tempo}
          />
          <span className="font-semibold" style={{ color: '#EDEDEF' }}>{concertName}</span>
          <span style={{ color: '#9A9AA0' }}>Perform — tela cheia · Esc sai · ↑/↓ troca patch</span>
          <select
            className="ml-2 rounded-lg px-2 py-1 text-xs outline-none"
            style={{ border: '1px solid #2E2E34', background: '#131316', color: '#EDEDEF' }}
            value={currentPreset?.id ?? ''}
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) onSelectPreset(p);
            }}
          >
            <option value="">Selecionar patch…</option>
            {[...presets].sort((a, b) => a.programNumber - b.programNumber).map((p) => (
              <option key={p.id} value={p.id}>{String(p.programNumber + 1).padStart(3, '0')} — {p.name}{p.skipped ? ' (skip)' : ''}</option>
            ))}
          </select>
          <button
            className="hw-squarebtn px-3 py-1.5 text-xs"
            onClick={() => setSettingsTab('midi')}
            title="Configurações — MIDI e VST"
          >
            Configurações
          </button>
          <button
            className="hw-squarebtn ml-auto px-3 py-1.5"
            onClick={() => onModeChange('edit')}
          >
            Sair do Perform
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {currentPreset ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-3 text-center">
                <div className="text-3xl font-semibold text-white">{currentPreset.name}</div>
                <div className="text-xs" style={{ color: '#9A9AA0' }}>Programa {currentPreset.programNumber + 1} · Canal {currentPreset.midiChannel + 1}</div>
              </div>
              <div className="relative min-h-[480px] rounded-xl border border-[#26262B] bg-[#101013] p-4">
                {elements.map((el) => (
                  <StageControl key={el.id} element={el} channel={currentPreset.midiChannel} layoutMode="absolute" activeNotes={activeNotes} onMidiMessage={onMidiMessage} onSetVstParameter={onSetVstParameter} />
                ))}
                {elements.length === 0 && (
                  <div className="flex h-[400px] items-center justify-center text-sm text-slate-600">
                    Patch sem controles — volte ao Layout para adicionar.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Nenhum patch selecionado — escolha na lista ou com ↑/↓.
            </div>
          )}
        </div>
        {settingsTab && (
          <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-slate-200" style={{ background: '#0B0B0D' }}>
      <ModeToolbar
        mode={mode}
        onModeChange={onModeChange}
        concertName={concertName}
        onConcertNameChange={setConcertName}
        tempo={appStatus.tempo}
        onTempoChange={(tempo) => void setAppStatus({ tempo })}
        programNumber={appStatus.currentProgramNumber}
        presetCount={presets.length}
        currentPresetName={currentPreset?.name ?? null}
        midiLastMessage={midiLastMessage}
        isMetronomeOn={appStatus.isMetronomeOn}
        onToggleMetronome={() => void setAppStatus({ isMetronomeOn: !appStatus.isMetronomeOn })}
        onPanic={panic}
        onOpenSettings={(tab) => setSettingsTab(tab)}
      />
      <div className="flex min-h-0 flex-1">
        <PatchList
          presets={presets}
          sets={sets}
          currentPresetId={currentPreset?.id ?? null}
          onSelectPreset={onSelectPreset}
          onEditPreset={onEditPreset}
          onNewPatch={onNewPatch}
          onNewSet={() => createSet()}
          onRenameSet={renameSet}
          onDeleteSet={deleteSet}
          onToggleSetExpanded={toggleSetExpanded}
          onToggleSetSkipped={toggleSetSkipped}
          onTogglePresetSkipped={(id) => void togglePresetSkipped(id)}
          onMovePresetToSet={(pid, sid) => void movePresetToSet(pid, sid)}
          onReorderPatches={(sid, ids) => void reorderPatchesInSet(sid, ids)}
          onReorderSets={reorderSets}
          onResetProgramNumbers={() => void resetProgramNumbers()}
          onDeletePreset={(id) => void deletePreset(id)}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-1.5 text-xs" style={{ borderColor: '#26262B' }}>
            <span className="font-medium text-white">
              {mode === 'layout' ? 'Workspace — Layout do concert' : 'Workspace — Edit + Mapping'}
            </span>
            <span style={{ color: '#9A9AA0' }}>
              {(draft ?? currentPreset) ? `${(draft ?? currentPreset)?.name} · ${(draft ?? currentPreset)?.layout.elements.length ?? 0} controle(s)${draft ? ' · editando (não salvo)' : ''}` : 'Nenhum patch'}
            </span>
          </div>
          {error && <div className="border-b border-red-900 bg-red-950/40 px-4 py-1 text-[11px] text-red-300">{error}</div>}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {(draft ?? currentPreset) ? (
              <>
                <ComposerCanvas
                  elements={(draft ?? currentPreset)?.layout.elements ?? []}
                  selectedId={mode === 'layout' ? selectedId : selectedId}
                  armed={mode === 'layout' && armedKey !== null && !!draft}
                  locked={!draft || mode !== 'layout'}
                  interactivePreview={mode === 'edit'}
                  channel={(draft ?? currentPreset)?.midiChannel ?? 0}
                  onCanvasClick={(x, y) => {
                    const item = findPaletteItem(armedKey);
                    if (item) placeItems(item, x, y);
                  }}
                  onDropKey={(key, x, y) => {
                    const item = findPaletteItem(key);
                    if (item) placeItems(item, x, y);
                  }}
                  onSelect={(id) => onSelectedId(id)}
                  onMove={(id, x, y) => updateElement(id, { x, y })}
                  onResize={(id, width, height) => updateElement(id, { width, height })}
                  onMidiMessage={onMidiMessage}
                  onSetVstParameter={onSetVstParameter}
                />
                {!draft && (
                  <div className="mt-2 rounded-lg px-3 py-1.5 text-[11px]" style={{ border: '1px solid rgba(45,255,106,0.4)', background: 'rgba(45,255,106,0.08)', color: '#EDEDEF' }}>
                    Visualizando patch salvo. Clique em um patch → Editar (✎) ou crie um novo para desenhar o layout.
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-2 text-4xl" style={{ color: '#2DFF6A' }}>♫</div>
                  <div className="font-semibold text-white">Concert vazio</div>
                  <p className="my-2 text-xs" style={{ color: '#9A9AA0' }}>Crie um Set e o primeiro Patch na Patch List.</p>
                  <button className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: '#2DFF6A', color: '#0B120C' }} onClick={() => onNewPatch(undefined)}>
                    Criar primeiro patch
                  </button>
                </div>
              </div>
            )}
          </div>
          {draft && (
            <Inspector
              draft={draft}
              scannedPlugins={scannedPlugins}
              scannedParams={scannedParams}
              selectedElement={selected}
              onPatchChange={updateDraft}
              onUpdateElement={updateElement}
              onRemoveElement={removeElement}
              onDuplicateElement={duplicateElement}
              onBringFront={bringFront}
              onSendBack={sendBack}
              onSelectElement={(id) => onSelectedId(id)}
              onSave={onSaveDraft}
              saving={saving}
            />
          )}
          {mode === 'layout' && (
            <ControlPalette armedKey={armedKey} onArm={armItem} />
          )}
        </main>
        {mode === 'edit' && <ChannelStrips preset={draft ?? currentPreset} />}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-4 border-t px-4 text-[10px]" style={{ borderColor: '#2E2E34', background: '#131316', color: '#9A9AA0' }}>
        <span>Programa {appStatus.currentProgramNumber + 1}</span>
        <span>Patches: {presets.length} · Sets: {sets.length}</span>
        {midiLastMessage && <span className="truncate" style={{ color: '#2DFF6A' }}>{midiLastMessage}</span>}
        {toast && <span className="truncate" style={{ color: '#EDEDEF' }}>{toast}</span>}
        <span className="ml-auto" style={{ color: 'rgba(45,255,106,0.7)' }}>Host VST de áudio ainda não implementado</span>
      </div>
      {settingsTab && (
        <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
      )}
    </div>
  );
};
