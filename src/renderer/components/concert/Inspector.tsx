import React, { useEffect, useRef, useState } from 'react';
import type { Preset, PresetPluginAssignment, UiElement, VstPluginInfo, VstPreset } from '@shared/types';
import { ControlInspector } from '../composer/ControlInspector';
import { MappingTable } from '../composer/MappingTable';
import { ChannelStripLibrary } from './ChannelStripLibrary';
import { shortcutFromKeyboardEvent } from '@shared/shortcuts';

interface InspectorProps {
  /** No Layout, mostra só o Screen Control Inspector; no Edit, as abas do patch. */
  mode: 'layout' | 'edit';
  draft: Preset | null;
  /** Todos os patches do concert, para validar atalhos duplicados. */
  presets: Preset[];
  scannedPlugins: VstPluginInfo[];
  scannedParams: { path: string; params: { id: string; name: string }[] }[];
  selectedElement: UiElement | null;
  selectedLayerId: string | null;
  /** Plugin carregado no layer selecionado (para a Channel Strip Library). */
  selectedPlugin: VstPluginInfo | null;
  onLoadPresetAsNewStrip: (preset: VstPreset) => Promise<{ ok: boolean; message: string }>;
  onApplyPresetToSelected: (
    preset: VstPreset,
    options?: { replacePlugin?: boolean }
  ) => Promise<{ ok: boolean; message: string }>;
  onLayerRangeChange: (assignment: PresetPluginAssignment, layerId: string, minNote: number, maxNote: number) => void;
  onLayerVelocityChange: (assignment: PresetPluginAssignment, layerId: string, velocityMin: number, velocityMax: number) => void;
  /** Soma do transpose do patch + set + concert (Fase 3.4). */
  transposeTotal: number;
  onPatchChange: (patch: Partial<Preset>) => void;
  onUpdateElement: (id: string, patch: Partial<UiElement>) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringFront: (id: string) => void;
  onSendBack: (id: string) => void;
  onSelectElement: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  orientation?: 'bottom' | 'left';
}

type Tab = 'library' | 'attributes' | 'strip' | 'stripLibrary' | 'mapping' | 'notes' | 'control';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteLabel = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

const classInput =
  'w-full rounded-lg border border-[#3A3A3C] bg-[#242426] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0A84FF]';

export const Inspector: React.FC<InspectorProps> = ({
  mode,
  draft,
  presets,
  scannedPlugins,
  scannedParams,
  selectedElement,
  selectedLayerId,
  selectedPlugin,
  onLoadPresetAsNewStrip,
  onApplyPresetToSelected,
  onLayerRangeChange,
  onLayerVelocityChange,
  transposeTotal,
  onPatchChange,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  onBringFront,
  onSendBack,
  onSelectElement,
  onSave,
  saving,
}) => {
  const isLeft = orientation === 'left';
  const [width, setWidth] = useState<number>(() => {
    try { const raw = localStorage.getItem('preseter.inspectorWidth.v1'); const parsed = raw ? Number(raw) : NaN; if (Number.isFinite(parsed)) return Math.max(240, Math.min(480, parsed)); } catch { /* ignora */ }
    return 300;
  });
  const widthRef = useRef(width); widthRef.current = width;
  const [tab, setTab] = useState<Tab>('attributes');
  const [height, setHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('preseter.inspectorHeight.v2');
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) return Math.max(160, Math.min(window.innerHeight * 0.7, parsed));
    } catch { /* ignora */ }
    // 50% da janela
    return Math.round(window.innerHeight * 0.5);
  });
  const [maxHeight, setMaxHeight] = useState(() => Math.max(160, window.innerHeight * 0.7));
  const panelRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ startY: number; originH: number } | null>(null);
  const widthResize = useRef<{ startX: number; originW: number } | null>(null);
  const heightRef = useRef(height);
  heightRef.current = height;
  const [learningShortcut, setLearningShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    if (isLeft) return;
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;

    const resizeObserver = new ResizeObserver(() => {
      const fixedHeight = Array.from(parent.children).reduce((total, child) => {
        const element = child as HTMLElement;
        if (element === panel || element.hasAttribute('data-workspace-region')) return total;
        return total + element.getBoundingClientRect().height;
      }, 0);
      const available = Math.max(160, parent.clientHeight - fixedHeight - 160);
      setMaxHeight(available);
      setHeight((current) => Math.min(current, available));
    });
    const mutationObserver = new MutationObserver(() => {
      Array.from(parent.children).forEach((child) => resizeObserver.observe(child));
    });
    resizeObserver.observe(parent);
    Array.from(parent.children).forEach((child) => resizeObserver.observe(child));
    mutationObserver.observe(parent, { childList: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  // No Edit, selecionar um screen control abre direto a aba de mapeamento.
  useEffect(() => {
    if (mode === 'layout') return;
    setTab((previous) => {
      if (selectedElement) return 'control';
      return previous === 'control' ? 'attributes' : previous;
    });
  }, [mode, selectedElement?.id]);

  useEffect(() => {
    if (!learningShortcut || !draft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setLearningShortcut(false);
        setShortcutError(null);
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      const conflict = presets.find(
        (preset) => preset.id !== draft.id && (preset.shortcut ?? '') === shortcut
      );
      if (conflict) {
        setShortcutError(`Atalho já usado por “${conflict.name}”.`);
        setLearningShortcut(false);
        return;
      }
      setShortcutError(null);
      onPatchChange({ shortcut });
      setLearningShortcut(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [learningShortcut, presets, draft, onPatchChange]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: 'Patch Library' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'strip', label: 'Channel Strip' },
    { id: 'stripLibrary', label: 'Channel Strip Library' },
    { id: 'mapping', label: 'Mapping' },
    { id: 'notes', label: 'Notes' },
    ...(selectedElement ? [{ id: 'control' as Tab, label: `Control: ${selectedElement.label}` }] : []),
  ];

  if (!draft && isLeft) {
    return (
      <aside className="flex shrink-0 flex-col border-r overflow-hidden" style={{ width, borderColor: '#1E1E24', background: '#0A0A0C' }}>
        <div className="flex items-center border-b px-3 py-2" style={{ borderColor: '#1E1E24' }}>
          <span className="text-[11px] font-semibold text-white">Screen Control Inspector</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 text-[11px] text-slate-400">
          {mode === 'layout'
            ? 'Selecione um patch e clique em Editar para desenhar o layout, ou selecione um controle no canvas.'
            : 'Selecione um patch na Patch List para ver o Inspector.'}
        </div>
        <div className="border-t px-3 py-2" style={{ borderColor: '#1E1E24' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: '#8E8E93' }}>Quick Help</div>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: '#636366' }}>Selecione um controle no canvas para ver Hardware Input, aparência e textos. Arraste controles da palette para o workspace.</p>
        </div>
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize"
          style={{ background: 'transparent' }}
          title="Arrastar para redimensionar"
          onPointerDown={(event) => {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            widthResize.current = { startX: event.clientX, originW: width };
          }}
          onPointerMove={(event) => {
            const r = widthResize.current;
            if (!r) return;
            const next = Math.max(240, Math.min(480, r.originW + (event.clientX - r.startX)));
            setWidth(next);
          }}
          onPointerUp={() => {
            widthResize.current = null;
            try { localStorage.setItem('preseter.inspectorWidth.v1', String(widthRef.current)); } catch { /* ignora */ }
          }}
          onPointerCancel={() => { widthResize.current = null; }}
        />
      </aside>
    );
  }
  if (!draft) {
    return (
      <div className="shrink-0 border-t px-4 py-3 text-xs" style={{ borderColor: '#1E1E24', background: '#0A0A0C', color: '#9A9AA0' }}>
        {mode === 'layout'
          ? 'Selecione um patch e clique em Editar para desenhar o layout.'
          : 'Selecione ou crie um patch na Patch List para ver o Inspector.'}
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex shrink-0 flex-col border-t" style={{ borderColor: '#1E1E24', background: '#0A0A0C', height, maxHeight }}>
      <div
        className="cursor-ns-resize pt-1.5"
        title="Arrastar para redimensionar · duplo clique para 50/50"
        onDoubleClick={() => {
          const next = Math.min(maxHeight, Math.round(window.innerHeight * 0.5));
          setHeight(next);
          try { localStorage.setItem('preseter.inspectorHeight.v2', String(next)); } catch { /* ignora */ }
        }}
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          resizing.current = { startY: event.clientY, originH: height };
        }}
        onPointerMove={(event) => {
          const r = resizing.current;
          if (!r) return;
          const next = Math.max(160, Math.min(maxHeight, r.originH - (event.clientY - r.startY)));
          setHeight(next);
        }}
        onPointerUp={() => {
          resizing.current = null;
          try { localStorage.setItem('preseter.inspectorHeight.v2', String(heightRef.current)); } catch { /* ignora */ }
        }}
        onPointerCancel={() => { resizing.current = null; }}
      >
        <div className="mx-auto h-1 w-16 rounded-full" style={{ background: '#303032' }} />
      </div>
      <div className="flex items-center gap-1 border-b px-3" style={{ borderColor: '#1E1E24' }}>
        {mode === 'layout' ? (
          <>
            <span className="px-1 py-2 text-[11px] font-semibold text-white">Layout</span>
            <span className="ml-auto px-1 py-2 text-[10px]" style={{ color: '#8E8E93' }}>
              Layout salvo com o concert (Ctrl+S)
            </span>
          </>
        ) : (
          <>
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`border-b-2 px-3 py-2 text-[11px] ${
                  tab === id ? 'text-white' : 'border-transparent hover:text-slate-200'
                }`}
                style={tab === id ? { borderColor: '#0A84FF' } : { color: '#9A9AA0' }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={onSave}
              disabled={saving}
              className="ml-auto rounded-lg px-3 py-1 text-[11px] font-semibold hover:brightness-110 disabled:opacity-50"
              style={{ background: '#0A84FF', color: '#FFFFFF' }}
            >
              {saving ? 'Salvando…' : 'Salvar patch'}
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {mode === 'layout' ? (
          selectedElement ? (
            <div className="max-w-3xl">
              <ControlInspector
                mode="layout"
                element={selectedElement}
                draft={draft}
                scannedPlugins={scannedPlugins}
                onUpdate={onUpdateElement}
                onRemove={onRemoveElement}
                onDuplicate={onDuplicateElement}
                onBringFront={onBringFront}
                onSendBack={onSendBack}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-[#303032] bg-[#141416] p-3 text-[11px] leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Screen Control Inspector</span>
              <br />
              Selecione um controle no canvas para editar Hardware Input, aparência e textos.
              Use a Screen Controls Palette embaixo para adicionar controles.
            </div>
          )
        ) : (
          <>
        {tab === 'library' && (
          <div className="text-[11px] text-slate-400">
            <p className="mb-2">Patch Library — clique para audicionar (carrega o patch). Edição completa do som chega nas próximas fases.</p>
            <p className="text-slate-600">Use a Patch List à esquerda como library nesta fase visual.</p>
          </div>
        )}
        {tab === 'stripLibrary' && (
          <div className="h-full min-h-[220px]">
            <ChannelStripLibrary
              selectedLayerId={selectedLayerId}
              selectedPlugin={selectedPlugin}
              onLoadPresetAsNewStrip={onLoadPresetAsNewStrip}
              onApplyPresetToSelected={onApplyPresetToSelected}
            />
          </div>
        )}
        {tab === 'attributes' && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="text-[11px] text-slate-400">Nome<input className={`${classInput} mt-1`} value={draft.name} onChange={(e) => onPatchChange({ name: e.target.value })} /></label>
            <label className="text-[11px] text-slate-400">Categoria<input className={`${classInput} mt-1`} value={draft.category ?? ''} onChange={(e) => onPatchChange({ category: e.target.value })} /></label>
            <label className="text-[11px] text-slate-400">Programa (1-128)<input className={`${classInput} mt-1`} type="number" min={1} max={128} value={draft.programNumber + 1} onChange={(e) => onPatchChange({ programNumber: Math.max(0, Math.min(127, (Number(e.target.value) || 1) - 1)) })} /></label>
            <label className="text-[11px] text-slate-400">Banco<input className={`${classInput} mt-1`} type="number" min={0} max={127} value={draft.bankNumber ?? 0} onChange={(e) => onPatchChange({ bankNumber: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })} /></label>
            <div className="text-[11px] text-slate-400">
              Atalho
              <div className="mt-1 flex gap-1">
                <input
                  className={`${classInput} min-w-0`}
                  value={learningShortcut ? 'Pressione uma tecla…' : (draft.shortcut ?? '')}
                  readOnly
                  placeholder="Nenhum"
                />
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                  style={{ background: learningShortcut ? '#FF9F0A' : '#0A84FF', color: '#fff' }}
                  onClick={() => {
                    setShortcutError(null);
                    setLearningShortcut((value) => !value);
                  }}
                >
                  {learningShortcut ? 'Aguardando…' : 'Aprender'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border px-2 py-1 text-[10px]"
                  style={{ borderColor: '#3A3A3C', background: '#242426', color: '#D1D1D6' }}
                  onClick={() => {
                    setShortcutError(null);
                    setLearningShortcut(false);
                    onPatchChange({ shortcut: '' });
                  }}
                >
                  Limpar
                </button>
              </div>
              {shortcutError && <span className="mt-1 block text-[10px]" style={{ color: '#FF8A80' }}>{shortcutError}</span>}
              <span className="mt-1 block text-[10px] text-slate-600">Qualquer tecla do computador; não pode repetir em outro patch.</span>
            </div>
            <label className="text-[11px] text-slate-400">Transpose (semitons)<input className={`${classInput} mt-1`} type="number" min={-24} max={24} value={draft.transpose ?? 0} onChange={(e) => onPatchChange({ transpose: Math.max(-24, Math.min(24, Number(e.target.value) || 0)) })} /></label>
            <label className="text-[11px] text-slate-400">Tempo do patch (BPM)<input className={`${classInput} mt-1`} type="number" min={20} max={300} value={draft.layout.tempo} onChange={(e) => onPatchChange({ layout: { ...draft.layout, tempo: Math.max(20, Math.min(300, Number(e.target.value) || 120)) } })} /></label>
            <label className="text-[11px] text-slate-400">Compasso — numerador<input className={`${classInput} mt-1`} type="number" min={1} max={32} value={draft.timeSignature?.numerator ?? 4} onChange={(e) => onPatchChange({ timeSignature: { numerator: Math.max(1, Math.min(32, Number(e.target.value) || 4)), denominator: draft.timeSignature?.denominator ?? 4 } })} /></label>
            <label className="text-[11px] text-slate-400">Compasso — denominador<select className={`${classInput} mt-1`} value={draft.timeSignature?.denominator ?? 4} onChange={(e) => onPatchChange({ timeSignature: { numerator: draft.timeSignature?.numerator ?? 4, denominator: Number(e.target.value) } })}>{[1, 2, 4, 8, 16, 32].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-[11px] text-slate-400">Tuning (A4 Hz)<input className={`${classInput} mt-1`} type="number" min={400} max={480} step={0.1} value={draft.tuningReferenceHz ?? 440} onChange={(e) => onPatchChange({ tuningReferenceHz: Math.max(400, Math.min(480, Number(e.target.value) || 440)) })} /></label>
            <label className="flex items-end gap-2 pb-1 text-[11px] text-slate-400">
              <input type="checkbox" style={{ accentColor: '#0A84FF' }} checked={draft.changeTempoOnSelect === true} onChange={(e) => onPatchChange({ changeTempoOnSelect: e.target.checked })} />
              Mudar tempo ao selecionar
            </label>
            <label className="text-[11px] text-slate-400">Canal (1-16)<input className={`${classInput} mt-1`} type="number" min={1} max={16} value={draft.midiChannel + 1} onChange={(e) => onPatchChange({ midiChannel: Math.max(0, Math.min(15, (Number(e.target.value) || 1) - 1)) })} /></label>
            <label className="text-[11px] text-slate-400">Ícone<input className={`${classInput} mt-1`} value={draft.icon ?? '🎹'} onChange={(e) => onPatchChange({ icon: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-1 text-[11px] text-slate-400">
              <input type="checkbox" style={{ accentColor: '#0A84FF' }} checked={!!draft.skipped} onChange={(e) => onPatchChange({ skipped: e.target.checked })} />
              Skip (pular em Program Change)
            </label>
            <div className="text-[11px] text-slate-500">Tempo do patch: {draft.layout.tempo} BPM · {draft.layout.elements.length} controle(s)</div>
            <div className="text-[11px] text-slate-500">Transpose total: {transposeTotal >= 0 ? '+' : ''}{transposeTotal} semitons (patch + set + concert)</div>
          </div>
        )}
        {tab === 'strip' && (() => {
          const layers = (draft.plugins ?? []).map((assignment, index) => ({
            assignment,
            layerId: assignment.layerId ?? `${draft.id}:layer:${index}`,
          }));
          const current = layers.find((layer) => layer.layerId === selectedLayerId) ?? layers[0];
          if (!current) {
            return <div className="text-[11px] text-slate-400">Este patch ainda não tem channel strips. Use “＋ Adicionar layer” no painel Layers.</div>;
          }
          const low = current.assignment.minNote ?? 0;
          const high = current.assignment.maxNote ?? 127;
          const apply = (min: number, max: number) => {
            const clampedMin = Math.max(0, Math.min(127, min));
            const clampedMax = Math.max(clampedMin, Math.min(127, max));
            onLayerRangeChange(current.assignment, current.layerId, clampedMin, clampedMax);
          };
          return (
            <div className="max-w-xl">
              <div className="mb-2 text-[11px] text-slate-400">Channel strip: <span className="font-semibold text-white">{current.assignment.name}</span> — Layers e Splits</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Low Key ({noteLabel(low)})
                  <input className={`${classInput} mt-1`} type="number" min={0} max={127} value={low} onChange={(e) => apply(Number(e.target.value) || 0, high)} />
                </label>
                <label className="text-[11px] text-slate-400">High Key ({noteLabel(high)})
                  <input className={`${classInput} mt-1`} type="number" min={0} max={127} value={high} onChange={(e) => apply(low, Number(e.target.value) || 0)} />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Velocity mínima
                  <input
                    className={`${classInput} mt-1`}
                    type="number"
                    min={1}
                    max={127}
                    value={current.assignment.velocityMin ?? 1}
                    onChange={(e) => onLayerVelocityChange(current.assignment, current.layerId, Math.max(1, Math.min(127, Number(e.target.value) || 1)), current.assignment.velocityMax ?? 127)}
                  />
                </label>
                <label className="text-[11px] text-slate-400">Velocity máxima
                  <input
                    className={`${classInput} mt-1`}
                    type="number"
                    min={1}
                    max={127}
                    value={current.assignment.velocityMax ?? 127}
                    onChange={(e) => onLayerVelocityChange(current.assignment, current.layerId, current.assignment.velocityMin ?? 1, Math.max(1, Math.min(127, Number(e.target.value) || 1)))}
                  />
                </label>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Notas fora desta faixa não tocam este instrumento. Use faixas diferentes para criar splits ou a mesma faixa para criar layers.</p>
              <svg
                viewBox="0 0 128 24"
                className="mt-2 h-6 w-full max-w-xs"
                role="img"
                aria-label={`Faixa de velocity ${current.assignment.velocityMin ?? 1} a ${current.assignment.velocityMax ?? 127}`}
              >
                <rect x="0" y="0" width="128" height="24" fill="#1F1F21" stroke="#3A3A3C" strokeWidth="1" />
                <rect
                  x={((current.assignment.velocityMin ?? 1) / 127) * 128}
                  y="0"
                  width={Math.max(1, (((current.assignment.velocityMax ?? 127) - (current.assignment.velocityMin ?? 1)) / 127) * 128)}
                  height="24"
                  fill="#0A84FF"
                  opacity="0.22"
                />
                <line
                  x1={((current.assignment.velocityMin ?? 1) / 127) * 128}
                  y1={24 - ((current.assignment.velocityMin ?? 1) / 127) * 24}
                  x2={((current.assignment.velocityMax ?? 127) / 127) * 128}
                  y2={24 - ((current.assignment.velocityMax ?? 127) / 127) * 24}
                  stroke="#0A84FF"
                  strokeWidth="2"
                />
              </svg>
              <p className="mt-1 text-[10px] text-slate-500">Velocity fora da faixa {current.assignment.velocityMin ?? 1}–{current.assignment.velocityMax ?? 127} é filtrada antes do plugin.</p>
            </div>
          );
        })()}
        {tab === 'mapping' && (
          <MappingTable draft={draft} scannedParams={scannedParams} scannedPlugins={scannedPlugins} selectedId={selectedElement?.id ?? null} onSelect={onSelectElement} />
        )}
        {tab === 'notes' && (
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => onPatchChange({ notes: e.target.value })}
            placeholder="Anotações do patch — ex. letra, viradas, avisos de palco…"
            className="h-full min-h-[140px] w-full rounded-lg border border-[#3A3A3C] bg-[#242426] p-2 text-xs text-slate-200 outline-none focus:border-[#0A84FF]"
          />
        )}
        {tab === 'control' && selectedElement && (
          <div className="max-w-3xl">
            <ControlInspector
              mode="edit"
              element={selectedElement}
              draft={draft}
              scannedPlugins={scannedPlugins}
              onUpdate={onUpdateElement}
              onRemove={onRemoveElement}
              onDuplicate={onDuplicateElement}
              onBringFront={onBringFront}
              onSendBack={onSendBack}
            />
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
