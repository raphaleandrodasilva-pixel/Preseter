import React, { useRef, useState } from 'react';
import type { Preset, UiElement, VstPluginInfo } from '@shared/types';
import { ControlInspector } from '../composer/ControlInspector';
import { MappingTable } from '../composer/MappingTable';

interface InspectorProps {
  draft: Preset | null;
  scannedPlugins: VstPluginInfo[];
  scannedParams: { path: string; params: { id: string; name: string }[] }[];
  selectedElement: UiElement | null;
  onPatchChange: (patch: Partial<Preset>) => void;
  onUpdateElement: (id: string, patch: Partial<UiElement>) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringFront: (id: string) => void;
  onSendBack: (id: string) => void;
  onSelectElement: (id: string) => void;
  onSave: () => void;
  saving: boolean;
}

type Tab = 'library' | 'attributes' | 'mapping' | 'notes' | 'control';

const classInput =
  'w-full rounded-lg border border-[#3A3A3C] bg-[#242426] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0A84FF]';

export const Inspector: React.FC<InspectorProps> = ({
  draft,
  scannedPlugins,
  scannedParams,
  selectedElement,
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
  const [tab, setTab] = useState<Tab>('attributes');
  const [height, setHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('preseter.inspectorHeight.v1');
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) return Math.max(160, Math.min(window.innerHeight * 0.7, parsed));
    } catch { /* ignora */ }
    return 248;
  });
  const resizing = useRef<{ startY: number; originH: number } | null>(null);
  const heightRef = useRef(height);
  heightRef.current = height;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: 'Patch Library' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'mapping', label: 'Mapping' },
    { id: 'notes', label: 'Notes' },
    ...(selectedElement ? [{ id: 'control' as Tab, label: `Control: ${selectedElement.label}` }] : []),
  ];

  if (!draft) {
    return (
      <div className="shrink-0 border-t px-4 py-3 text-xs" style={{ borderColor: '#1E1E24', background: '#0A0A0C', color: '#9A9AA0' }}>
        Selecione ou crie um patch na Patch List para ver o Inspector.
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col border-t" style={{ borderColor: '#1E1E24', background: '#0A0A0C', height }}>
      <div
        className="cursor-ns-resize pt-1.5"
        title="Arrastar para redimensionar"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          resizing.current = { startY: event.clientY, originH: height };
        }}
        onPointerMove={(event) => {
          const r = resizing.current;
          if (!r) return;
          const next = Math.max(160, Math.min(window.innerHeight * 0.7, r.originH - (event.clientY - r.startY)));
          setHeight(next);
        }}
        onPointerUp={() => {
          resizing.current = null;
          try { localStorage.setItem('preseter.inspectorHeight.v1', String(heightRef.current)); } catch { /* ignora */ }
        }}
        onPointerCancel={() => { resizing.current = null; }}
      >
        <div className="mx-auto h-1 w-16 rounded-full" style={{ background: '#303032' }} />
      </div>
      <div className="flex items-center gap-1 border-b px-3" style={{ borderColor: '#1E1E24' }}>
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
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'library' && (
          <div className="text-[11px] text-slate-400">
            <p className="mb-2">Patch Library — clique para audicionar (carrega o patch). Edição completa do som chega nas próximas fases.</p>
            <p className="text-slate-600">Use a Patch List à esquerda como library nesta fase visual.</p>
          </div>
        )}
        {tab === 'attributes' && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="text-[11px] text-slate-400">Nome<input className={`${classInput} mt-1`} value={draft.name} onChange={(e) => onPatchChange({ name: e.target.value })} /></label>
            <label className="text-[11px] text-slate-400">Categoria<input className={`${classInput} mt-1`} value={draft.category ?? ''} onChange={(e) => onPatchChange({ category: e.target.value })} /></label>
            <label className="text-[11px] text-slate-400">Programa (1-128)<input className={`${classInput} mt-1`} type="number" min={1} max={128} value={draft.programNumber + 1} onChange={(e) => onPatchChange({ programNumber: Math.max(0, Math.min(127, (Number(e.target.value) || 1) - 1)) })} /></label>
            <label className="text-[11px] text-slate-400">Banco<input className={`${classInput} mt-1`} type="number" min={0} max={127} value={draft.bankNumber ?? 0} onChange={(e) => onPatchChange({ bankNumber: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })} /></label>
            <label className="text-[11px] text-slate-400">Canal (1-16)<input className={`${classInput} mt-1`} type="number" min={1} max={16} value={draft.midiChannel + 1} onChange={(e) => onPatchChange({ midiChannel: Math.max(0, Math.min(15, (Number(e.target.value) || 1) - 1)) })} /></label>
            <label className="text-[11px] text-slate-400">Ícone<input className={`${classInput} mt-1`} value={draft.icon ?? '🎹'} onChange={(e) => onPatchChange({ icon: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-1 text-[11px] text-slate-400">
              <input type="checkbox" style={{ accentColor: '#0A84FF' }} checked={!!draft.skipped} onChange={(e) => onPatchChange({ skipped: e.target.checked })} />
              Skip (pular em Program Change)
            </label>
            <div className="text-[11px] text-slate-500">Tempo do patch: {draft.layout.tempo} BPM · {draft.layout.elements.length} controle(s)</div>
          </div>
        )}
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
      </div>
    </div>
  );
};
