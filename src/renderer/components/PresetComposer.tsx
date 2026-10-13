import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Preset,
  PresetPluginAssignment,
  UiElement,
  VstPluginInfo,
} from '@shared/types';
import { ControlPalette } from './composer/ControlPalette';
import { ComposerCanvas } from './composer/ComposerCanvas';
import { ControlInspector } from './composer/ControlInspector';
import { MappingTable, buildScannedParams } from './composer/MappingTable';
import {
  findPaletteItem,
  makeElement,
  snap8,
  type PaletteItem,
} from './composer/elementFactory';

interface PresetComposerProps {
  draft: Preset | null;
  scannedPlugins: VstPluginInfo[];
  onCreatePreset: () => void;
  onDraftChange: (preset: Preset) => void;
  onScanPlugins: () => Promise<unknown>;
  onSave: (preset: Preset) => Promise<boolean>;
  onBackToPerformance: () => void;
  onMidiMessage?: (message: number[]) => void;
  onSetVstParameter?: (pluginPath: string, parameterId: string, value: number) => void;
}

type ComposerMode = 'layout' | 'edit' | 'perform';

const MODES: { id: ComposerMode; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'edit', label: 'Edit' },
  { id: 'perform', label: 'Perform' },
];

const classInput =
  'w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400';

export const PresetComposer: React.FC<PresetComposerProps> = ({
  draft,
  scannedPlugins,
  onCreatePreset,
  onDraftChange,
  onScanPlugins,
  onSave,
  onBackToPerformance,
  onMidiMessage,
  onSetVstParameter,
}) => {
  const [mode, setMode] = useState<ComposerMode>('layout');
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  const selected = draft?.layout.elements.find((element) => element.id === selectedId) ?? null;
  const assignedPaths = useMemo(
    () => new Set((draft?.plugins ?? []).map((plugin) => plugin.path)),
    [draft?.plugins]
  );
  const scannedParams = useMemo(() => buildScannedParams(scannedPlugins), [scannedPlugins]);

  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const updateDraft = (update: Partial<Preset>) => {
    if (draft) onDraftChange({ ...draft, ...update, updatedAt: Date.now() });
  };

  const updateElement = (id: string, update: Partial<UiElement>) => {
    if (!draft) return;
    updateDraft({
      layout: {
        ...draft.layout,
        elements: draft.layout.elements.map((element) =>
          element.id === id ? { ...element, ...update } : element
        ),
      },
    });
  };

  const removeElement = (id: string) => {
    if (!draft) return;
    updateDraft({
      layout: { ...draft.layout, elements: draft.layout.elements.filter((element) => element.id !== id) },
    });
    setSelectedId((current) => (current === id ? null : current));
  };

  const duplicateElement = (id: string) => {
    if (!draft) return;
    const source = draft.layout.elements.find((element) => element.id === id);
    if (!source) return;
    const copy: UiElement = {
      ...source,
      id: `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      x: source.x + 16,
      y: source.y + 16,
    };
    updateDraft({ layout: { ...draft.layout, elements: [...draft.layout.elements, copy] } });
    setSelectedId(copy.id);
    showToast(`${copy.label} duplicado.`);
  };

  const bringFront = (id: string) => {
    if (!draft) return;
    const elements = draft.layout.elements.filter((element) => element.id !== id);
    const target = draft.layout.elements.find((element) => element.id === id);
    if (target) updateDraft({ layout: { ...draft.layout, elements: [...elements, target] } });
  };

  const sendBack = (id: string) => {
    if (!draft) return;
    const elements = draft.layout.elements.filter((element) => element.id !== id);
    const target = draft.layout.elements.find((element) => element.id === id);
    if (target) updateDraft({ layout: { ...draft.layout, elements: [target, ...elements] } });
  };

  const placeItems = (item: PaletteItem, x: number, y: number) => {
    if (!draft) return;
    const created: UiElement[] = [];
    if (item.group) {
      for (const member of item.group) {
        created.push({
          ...makeElement(member.type, snap8(x + member.dx), snap8(y + member.dy), member.label),
        });
      }
    } else {
      const element = makeElement(item.type, 0, 0, item.label, item.orientation);
      element.x = snap8(Math.max(0, x - element.width / 2));
      element.y = snap8(Math.max(0, y - element.height / 2));
      created.push(element);
    }
    updateDraft({ layout: { ...draft.layout, elements: [...draft.layout.elements, ...created] } });
    setSelectedId(created[0].id);
    setArmedKey(null);
    showToast(created.length > 1 ? `${created.length} controles adicionados.` : `${created[0].label} adicionado.`);
  };

  const armItem = (item: PaletteItem) => {
    if (!draft) return;
    setArmedKey((current) => (current === item.key ? null : item.key));
    if (armedKey !== item.key) {
      showToast(`Clique no canvas para posicionar: ${item.label}. Ou arraste.`);
    }
  };

  // Atalhos: Del remove, Ctrl+D duplica
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,select,textarea')) return;
      if (mode === 'perform') return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeElement(selectedId);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        duplicateElement(selectedId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedId, draft]);

  const addPlugin = (plugin: VstPluginInfo) => {
    if (!draft || assignedPaths.has(plugin.path)) return;
    const assignment: PresetPluginAssignment = {
      pluginId: plugin.id,
      name: plugin.name,
      path: plugin.path,
      role: plugin.isInstrument ? 'instrument' : 'effect',
    };
    updateDraft({ plugins: [...(draft.plugins ?? []), assignment] });
  };

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      showToast('Informe um nome para o preset antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(draft);
      showToast(saved ? 'Preset salvo.' : 'Não foi possível salvar o preset.');
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-4 text-5xl text-amber-300">✳</div>
          <h2 className="text-2xl font-semibold text-white">Monte seu preset</h2>
          <p className="my-3 text-sm text-slate-400">
            Escolha os instrumentos e efeitos, depois desenhe os controles da tela de performance.
          </p>
          <button className="rounded bg-amber-400 px-5 py-2 font-semibold text-slate-950 hover:bg-amber-300" onClick={onCreatePreset}>
            Criar preset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#101617] text-slate-200">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-5 py-2.5">
        <div className="mr-2 min-w-0">
          <div className="text-xs uppercase tracking-[0.25em] text-amber-300">Montar preset</div>
          <div className="truncate text-sm font-medium text-white">{draft.name || 'Sem nome'}</div>
        </div>
        <div className="flex items-center gap-1">
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`border-b-2 px-4 py-2 text-xs font-medium ${
                mode === id
                  ? 'border-amber-300 text-amber-200'
                  : 'border-transparent text-slate-500 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="rounded border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" onClick={onBackToPerformance}>
            Performance
          </button>
          <button
            className="rounded bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Salvando…' : 'Salvar preset'}
          </button>
        </div>
      </div>

      {mode === 'perform' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-amber-300/30 bg-amber-300/5 px-5 py-2 text-xs text-amber-200">
            <span>Modo Perform — edição travada. Os controles abaixo funcionam de verdade e enviam MIDI.</span>
            <button className="rounded border border-amber-300/50 px-3 py-1 hover:bg-amber-300/10" onClick={() => setMode('layout')}>
              Voltar ao Layout
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <ComposerCanvas
              elements={draft.layout.elements}
              selectedId={null}
              armed={false}
              locked
              interactivePreview
              channel={draft.midiChannel}
              onCanvasClick={() => undefined}
              onDropKey={() => undefined}
              onSelect={() => undefined}
              onMove={() => undefined}
              onResize={() => undefined}
              onMidiMessage={onMidiMessage ?? (() => undefined)}
              onSetVstParameter={onSetVstParameter ?? (() => undefined)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(250px,310px)_1fr]">
            <aside className="min-h-0 space-y-5 overflow-y-auto border-r border-slate-800 p-4">
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Identificação</h2>
                <label className="block text-xs text-slate-400">Nome do som<input className={`${classInput} mt-1`} value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Ex.: Grand Piano & Strings" /></label>
                <label className="block text-xs text-slate-400">Categoria<input className={`${classInput} mt-1`} value={draft.category ?? ''} onChange={(event) => updateDraft({ category: event.target.value })} placeholder="Ex.: Acoustic Pianos" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-400">Programa MIDI<input className={`${classInput} mt-1`} type="number" min={0} max={127} value={draft.programNumber} onChange={(event) => updateDraft({ programNumber: Math.max(0, Math.min(127, Number(event.target.value) || 0)) })} /></label>
                  <label className="text-xs text-slate-400">Canal MIDI<input className={`${classInput} mt-1`} type="number" min={1} max={16} value={draft.midiChannel + 1} onChange={(event) => updateDraft({ midiChannel: Math.max(0, Math.min(15, (Number(event.target.value) || 1) - 1)) })} /></label>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Instrumentos e efeitos</h2>
                  <button className="text-xs text-amber-300 hover:text-amber-200" onClick={() => void onScanPlugins()}>Escanear VSTs</button>
                </div>
                {scannedPlugins.length === 0 ? (
                  <p className="rounded border border-slate-800 p-3 text-xs text-slate-500">Nenhum plugin encontrado. Escaneie os diretórios VST3.</p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {scannedPlugins.map((plugin) => (
                      <button
                        key={plugin.id}
                        className="flex w-full items-center justify-between rounded bg-slate-900 px-2 py-2 text-left text-xs hover:bg-slate-800 disabled:opacity-40"
                        disabled={assignedPaths.has(plugin.path)}
                        onClick={() => addPlugin(plugin)}
                      >
                        <span className="truncate">{plugin.name}<span className="ml-2 text-slate-500">{plugin.isInstrument ? 'Instrumento' : 'Efeito'}</span></span>
                        <span className="ml-2 text-amber-300">{assignedPaths.has(plugin.path) ? 'Adicionado' : '+'}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  {(draft.plugins ?? []).map((plugin) => (
                    <div key={plugin.pluginId} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5 text-xs">
                      <span className="truncate">{plugin.name} <span className="text-slate-500">· {plugin.role === 'instrument' ? 'Instrumento' : 'Efeito'}</span></span>
                      <button className="ml-2 text-red-300" onClick={() => updateDraft({
                        plugins: draft.plugins?.filter((entry) => entry.pluginId !== plugin.pluginId),
                        layout: {
                          ...draft.layout,
                          elements: draft.layout.elements.map((element) =>
                            element.pluginPath === plugin.path
                              ? { ...element, pluginPath: undefined, parameterId: undefined }
                              : element
                          ),
                        },
                      })} aria-label={`Remover ${plugin.name}`}>×</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-t border-slate-800 pt-4">
                <ControlInspector
                  element={selected}
                  draft={draft}
                  scannedPlugins={scannedPlugins}
                  onUpdate={updateElement}
                  onRemove={removeElement}
                  onDuplicate={duplicateElement}
                  onBringFront={bringFront}
                  onSendBack={sendBack}
                />
              </section>
            </aside>

            <main className="flex min-h-0 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {mode === 'layout' ? 'Layout do preset' : 'Fiação do preset'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {mode === 'layout'
                        ? 'Arraste da paleta ou clique para posicionar. Del remove, Ctrl+D duplica.'
                        : 'Confira cada controle → entrada MIDI → parâmetro. Clique na linha para selecionar.'}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{draft.layout.elements.length} controle(s)</span>
                </div>
                <ComposerCanvas
                  elements={draft.layout.elements}
                  selectedId={selectedId}
                  armed={armedKey !== null}
                  locked={false}
                  interactivePreview={false}
                  channel={draft.midiChannel}
                  onCanvasClick={(x, y) => {
                    const item = findPaletteItem(armedKey);
                    if (item) placeItems(item, x, y);
                  }}
                  onDropKey={(key, x, y) => {
                    const item = findPaletteItem(key);
                    if (item) placeItems(item, x, y);
                  }}
                  onSelect={(id) => setSelectedId(id)}
                  onMove={(id, x, y) => updateElement(id, { x, y })}
                  onResize={(id, width, height) => updateElement(id, { width, height })}
                  onMidiMessage={() => undefined}
                  onSetVstParameter={() => undefined}
                />
                {mode === 'edit' && (
                  <div className="mt-4">
                    <MappingTable
                      draft={draft}
                      scannedParams={scannedParams}
                      scannedPlugins={scannedPlugins}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  </div>
                )}
              </div>
              {mode === 'layout' && (
                <ControlPalette armedKey={armedKey} onArm={armItem} />
              )}
            </main>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-8 right-8 z-50 rounded bg-slate-800 px-4 py-2 text-xs text-amber-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};
