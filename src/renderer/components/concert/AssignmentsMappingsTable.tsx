import React, { useMemo, useState } from 'react';
import type {
  ConcertMapping,
  LayoutConfig,
  MappableAction,
  MidiBinding,
  Preset,
  PresetSet,
  VstPluginInfo,
} from '@shared/types';
import { ModalShell } from '../ui/ModalShell';

interface AssignmentsMappingsTableProps {
  mappings: ConcertMapping[];
  presets: Preset[];
  sets: PresetSet[];
  currentPatch: Preset | null;
  currentSet: PresetSet | null;
  layout: LayoutConfig | null;
  scannedPlugins: VstPluginInfo[];
  onChange: (mappings: ConcertMapping[]) => void;
  onClose: () => void;
}

type TargetKind = 'element' | 'parameter' | 'action';
type Level = 'concert' | 'set' | 'patch';

const ACTIONS: { value: MappableAction; label: string }[] = [
  { value: 'panic', label: 'Panic' },
  { value: 'master-mute', label: 'Master Mute' },
  { value: 'tap-tempo', label: 'Tap Tempo' },
  { value: 'next-patch', label: 'Próximo patch' },
  { value: 'previous-patch', label: 'Patch anterior' },
  { value: 'next-set', label: 'Próximo set' },
  { value: 'play-stop', label: 'Play/Stop' },
  { value: 'metronome', label: 'Metrônomo' },
  { value: 'current-notes', label: 'Notas atuais' },
];

const classInput =
  'w-full rounded-lg border border-[#3A3A3C] bg-[#242426] px-2 py-1 text-xs text-slate-100 outline-none focus:border-[#0A84FF]';

function formatSource(source: MidiBinding): string {
  const channel = (source.channel ?? 0) + 1;
  switch (source.type) {
    case 'cc':
      return `CC ${source.controllerNumber ?? '?'} · canal ${channel}`;
    case 'note':
      return `Nota ${source.controllerNumber ?? '?'} · canal ${channel}`;
    case 'pc':
      return `PC ${source.programNumber ?? '?'} · canal ${channel}`;
    case 'pitch':
      return `Pitch Bend · canal ${channel}`;
    case 'aftertouch':
      return `Aftertouch · canal ${channel}`;
    default:
      return '—';
  }
}

function formatTarget(mapping: ConcertMapping, layout: LayoutConfig | null): string {
  if (mapping.action) {
    return ACTIONS.find((action) => action.value === mapping.action)?.label ?? mapping.action;
  }
  if (mapping.elementId) {
    const element = layout?.elements.find((item) => item.id === mapping.elementId);
    return `Controle: ${element?.label ?? mapping.elementId}`;
  }
  if (mapping.parameterId) {
    return `Parâmetro: ${mapping.parameterId}`;
  }
  return '—';
}

function levelOf(mapping: ConcertMapping): Level {
  if (mapping.patchId) return 'patch';
  if (mapping.setId) return 'set';
  return 'concert';
}

export const AssignmentsMappingsTable: React.FC<AssignmentsMappingsTableProps> = ({
  mappings,
  presets,
  sets,
  currentPatch,
  currentSet,
  layout,
  scannedPlugins,
  onChange,
  onClose,
}) => {
  const [level, setLevel] = useState<Level>('concert');
  const [sourceType, setSourceType] = useState<MidiBinding['type']>('cc');
  const [channel, setChannel] = useState(1);
  const [number, setNumber] = useState(1);
  const [targetKind, setTargetKind] = useState<TargetKind>('element');
  const [elementId, setElementId] = useState('');
  const [pluginPath, setPluginPath] = useState('');
  const [parameterId, setParameterId] = useState('');
  const [action, setAction] = useState<MappableAction>('panic');

  const instruments = useMemo(
    () => (currentPatch?.plugins ?? []).filter((plugin) => plugin.role === 'instrument'),
    [currentPatch]
  );
  const parameters = useMemo(
    () => scannedPlugins.find((plugin) => plugin.path === pluginPath)?.parameters ?? [],
    [scannedPlugins, pluginPath]
  );

  const addMapping = () => {
    const source: MidiBinding = {
      type: sourceType,
      channel: Math.max(0, Math.min(15, channel - 1)),
      ...(sourceType === 'cc' || sourceType === 'note'
        ? { controllerNumber: Math.max(0, Math.min(127, number)) }
        : {}),
      ...(sourceType === 'pc'
        ? { programNumber: Math.max(0, Math.min(127, number)) }
        : {}),
    };
    const mapping: ConcertMapping = {
      id: `mapping_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source,
      ...(level === 'set' && currentSet ? { setId: currentSet.id } : {}),
      ...(level === 'patch' && currentPatch ? { patchId: currentPatch.id } : {}),
      ...(targetKind === 'element' && elementId ? { elementId } : {}),
      ...(targetKind === 'parameter' && parameterId
        ? { pluginPath, parameterId }
        : {}),
      ...(targetKind === 'action' ? { action } : {}),
    };
    onChange([...mappings, mapping]);
  };

  const removeMapping = (id: string) => {
    onChange(mappings.filter((mapping) => mapping.id !== id));
  };

  const missingScope =
    (level === 'set' && !currentSet) || (level === 'patch' && !currentPatch);

  return (
    <ModalShell
      label="Configurações"
      title="Assignments & Mappings"
      lcd="concert → set → patch"
      onClose={onClose}
      maxWidth="max-w-5xl"
      maxHeight="max-h-[85vh]"
    >
      <div className="p-4">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ color: '#8E8E93' }}>
                <th className="border-b px-2 py-2" style={{ borderColor: '#303032' }}>Nível</th>
                <th className="border-b px-2 py-2" style={{ borderColor: '#303032' }}>Origem MIDI</th>
                <th className="border-b px-2 py-2" style={{ borderColor: '#303032' }}>Destino</th>
                <th className="border-b px-2 py-2" style={{ borderColor: '#303032' }} />
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center" style={{ color: '#8E8E93' }}>
                    Nenhum mapping ainda. Use o formulário abaixo.
                  </td>
                </tr>
              )}
              {mappings.map((mapping) => {
                const mappingLevel = levelOf(mapping);
                const set = mapping.setId ? sets.find((item) => item.id === mapping.setId) : undefined;
                const patch = mapping.patchId ? presets.find((item) => item.id === mapping.patchId) : undefined;
                return (
                  <tr key={mapping.id} className="border-t" style={{ borderColor: '#2C2C2E' }}>
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: mappingLevel === 'patch' ? '#0A84FF' : mappingLevel === 'set' ? '#FF9F0A' : '#3A3A3C',
                          color: mappingLevel === 'patch' ? '#fff' : mappingLevel === 'set' ? '#1A1A1A' : '#E5E5EA',
                        }}
                      >
                        {mappingLevel === 'patch' ? `Patch: ${patch?.name ?? '?'}` : mappingLevel === 'set' ? `Set: ${set?.name ?? '?'}` : 'Concert'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#E5E5EA' }}>{formatSource(mapping.source)}</td>
                    <td className="px-2 py-1.5" style={{ color: '#E5E5EA' }}>{formatTarget(mapping, layout)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        className="rounded px-2 py-0.5 text-[10px] text-red-300 hover:text-red-200"
                        onClick={() => removeMapping(mapping.id)}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 rounded-lg p-3" style={{ border: '1px solid #303032', background: '#242426' }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#9A9AA0' }}>
              Novo mapping
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Nível
                <select className={`${classInput} mt-1`} value={level} onChange={(event) => setLevel(event.target.value as Level)}>
                  <option value="concert">Concert</option>
                  <option value="set" disabled={!currentSet}>Set atual</option>
                  <option value="patch" disabled={!currentPatch}>Patch atual</option>
                </select>
              </label>
              <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Tipo
                <select className={`${classInput} mt-1`} value={sourceType} onChange={(event) => setSourceType(event.target.value as MidiBinding['type'])}>
                  <option value="cc">Control Change</option>
                  <option value="note">Note On/Off</option>
                  <option value="pc">Program Change</option>
                  <option value="pitch">Pitch Bend</option>
                  <option value="aftertouch">Aftertouch</option>
                </select>
              </label>
              <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Canal
                <input className={`${classInput} mt-1`} type="number" min={1} max={16} value={channel} onChange={(event) => setChannel(Number(event.target.value) || 1)} />
              </label>
              <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Número
                <input
                  className={`${classInput} mt-1`}
                  type="number"
                  min={0}
                  max={127}
                  value={number}
                  disabled={sourceType === 'pitch' || sourceType === 'aftertouch'}
                  onChange={(event) => setNumber(Number(event.target.value) || 0)}
                />
              </label>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Destino
                <select className={`${classInput} mt-1`} value={targetKind} onChange={(event) => setTargetKind(event.target.value as TargetKind)}>
                  <option value="element">Controle de tela</option>
                  <option value="parameter">Parâmetro de plugin</option>
                  <option value="action">Ação</option>
                </select>
              </label>
              {targetKind === 'element' && (
                <label className="text-[11px] md:col-span-2" style={{ color: '#9A9AA0' }}>Controle
                  <select className={`${classInput} mt-1`} value={elementId} onChange={(event) => setElementId(event.target.value)}>
                    <option value="">Selecione…</option>
                    {(layout?.elements ?? []).map((element) => (
                      <option key={element.id} value={element.id}>{element.label} ({element.type})</option>
                    ))}
                  </select>
                </label>
              )}
              {targetKind === 'parameter' && (
                <>
                  <label className="text-[11px]" style={{ color: '#9A9AA0' }}>Plugin
                    <select className={`${classInput} mt-1`} value={pluginPath} onChange={(event) => { setPluginPath(event.target.value); setParameterId(''); }}>
                      <option value="">Selecione…</option>
                      {instruments.map((plugin) => (
                        <option key={plugin.layerId ?? plugin.path} value={plugin.path}>{plugin.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] md:col-span-2" style={{ color: '#9A9AA0' }}>Parâmetro
                    <select className={`${classInput} mt-1`} value={parameterId} onChange={(event) => setParameterId(event.target.value)} disabled={!pluginPath}>
                      <option value="">Selecione…</option>
                      {parameters.map((parameter) => (
                        <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {targetKind === 'action' && (
                <label className="text-[11px] md:col-span-2" style={{ color: '#9A9AA0' }}>Ação
                  <select className={`${classInput} mt-1`} value={action} onChange={(event) => setAction(event.target.value as MappableAction)}>
                    {ACTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="mt-5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                style={{ background: '#0A84FF', color: '#FFF' }}
                disabled={
                  missingScope
                  || (targetKind === 'element' && !elementId)
                  || (targetKind === 'parameter' && !parameterId)
                }
                onClick={addMapping}
              >
                Adicionar
              </button>
            </div>
            {missingScope && (
              <p className="mt-2 text-[11px]" style={{ color: '#FF8A80' }}>
                Selecione um patch/set na Patch List para criar mappings nesse nível.
              </p>
            )}
          </div>
        </div>
      </ModalShell>
  );
};
