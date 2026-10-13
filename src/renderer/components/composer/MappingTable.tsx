import React from 'react';
import type { Preset, VstPluginInfo } from '@shared/types';
import { midiBindingDescription, pluginBindingDescription } from './elementFactory';

interface MappingTableProps {
  draft: Preset;
  scannedParams: { path: string; params: { id: string; name: string }[] }[];
  scannedPlugins: VstPluginInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function buildScannedParams(scannedPlugins: VstPluginInfo[]): {
  path: string;
  params: { id: string; name: string }[];
}[] {
  return scannedPlugins.map((plugin) => ({
    path: plugin.path,
    params: plugin.parameters.map((p) => ({ id: p.id, name: p.name })),
  }));
}

export const MappingTable: React.FC<MappingTableProps> = ({
  draft,
  scannedParams,
  selectedId,
  onSelect,
}) => {
  const elements = draft.layout.elements;
  if (elements.length === 0) {
    return (
      <div className="rounded border border-slate-800 p-4 text-center text-xs text-slate-500">
        Nenhum controle no layout. Adicione controles na aba Layout para mapear aqui.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-semibold">Controle</th>
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Hardware Input</th>
            <th className="px-3 py-2 font-semibold">Send Value to</th>
            <th className="px-3 py-2 font-semibold">Seção</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((element) => (
            <tr
              key={element.id}
              onClick={() => onSelect(element.id)}
              className={`cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/50 ${
                element.id === selectedId ? 'bg-amber-300/10' : ''
              }`}
            >
              <td className="px-3 py-1.5 font-medium text-slate-200">{element.label}</td>
              <td className="px-3 py-1.5 text-slate-400">{element.type}</td>
              <td className="px-3 py-1.5 text-slate-400">
                {midiBindingDescription(element, draft.midiChannel)}
              </td>
              <td className="px-3 py-1.5 text-slate-400">
                {pluginBindingDescription(element, draft, scannedParams)}
              </td>
              <td className="px-3 py-1.5 text-slate-400">{element.section ?? 'livre'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
