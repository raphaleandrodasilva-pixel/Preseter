import React from 'react';
import type { PresetPluginAssignment } from '@shared/types';
import type { ExternalMidiConfig } from '@shared/external-midi';
import {
  buildExternalMidiLiveMessages,
  externalMidiControlRange,
} from '@shared/external-midi';

interface ExternalMidiStripProps {
  assignment: PresetPluginAssignment;
  editable: boolean;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onChange: (config: ExternalMidiConfig) => void;
  onSend: (portName: string, message: number[]) => void;
}

export const ExternalMidiStrip: React.FC<ExternalMidiStripProps> = ({
  assignment,
  editable,
  enabled,
  selected,
  onSelect,
  onRemove,
  onEdit,
  onChange,
  onSend,
}) => {
  const config = assignment.externalMidi;
  if (!config) return null;

  const controls = config.controls ?? [];
  const values = config.values ?? {};
  const bankLabel = [
    config.program?.bankMsb !== undefined ? `MSB ${config.program.bankMsb}` : null,
    config.program?.bankLsb !== undefined ? `LSB ${config.program.bankLsb}` : null,
  ].filter(Boolean).join(' · ');
  const programLabel = config.program?.pc !== undefined ? `PC ${config.program.pc}` : '';

  return (
    <section
      className="flex w-[172px] shrink-0 flex-col rounded-xl p-2"
      style={{
        border: `1px solid ${selected ? '#0A84FF' : '#3A3A3C'}`,
        background: 'linear-gradient(to bottom, #232326, #2C2C2E)',
      }}
      onClick={onSelect}
      onMouseDownCapture={onSelect}
      onFocusCapture={onSelect}
    >
      <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: '#3A3A3C' }}>
        <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: '#FF9F0A', color: '#1A1A1A' }}>
          MIDI
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white" title={assignment.name}>
          {assignment.name}
        </span>
        {editable && (
          <>
            <button
              className="rounded px-1 text-[10px] hover:text-white"
              style={{ color: '#9A9AA0' }}
              title="Editar timbre MIDI externo"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              ✎
            </button>
            <button
              className="rounded px-1 text-[10px] hover:text-red-300"
              style={{ color: '#9A9AA0' }}
              title="Remover timbre MIDI externo"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              ✕
            </button>
          </>
        )}
      </div>

      <div className="mt-1.5 space-y-0.5 text-[9px]" style={{ color: '#9A9AA0' }}>
        <div className="truncate" title={config.portName}>Porta: {config.portName || '—'}</div>
        <div>
          Canal {config.channel + 1}
          {config.program?.pc !== undefined ? ` · ${programLabel}` : ''}
        </div>
        {bankLabel && <div>{bankLabel}</div>}
      </div>

      {!enabled && (
        <div className="mt-1.5 rounded px-1.5 py-1 text-[9px]" style={{ background: '#3A2A12', color: '#FFD60A' }}>
          MIDI externo desligado nas Configurações.
        </div>
      )}

      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto">
        {controls.length === 0 && (
          <div className="text-[9px]" style={{ color: '#8E8E93' }}>
            Nenhum controle. Clique em ✎ para adicionar cutoff, resonance etc.
          </div>
        )}
        {controls.map((control) => {
          const range = externalMidiControlRange(control);
          const value = values[control.id] ?? control.default ?? range.default;
          return (
            <label key={control.id} className="block text-[9px]" style={{ color: '#9A9AA0' }}>
              <span className="flex justify-between gap-1">
                <span className="truncate" title={control.name}>{control.name}</span>
                <span className="tabular-nums" style={{ color: '#E5E5EA' }}>{value}</span>
              </span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                value={value}
                disabled={!enabled}
                className="w-full disabled:opacity-40"
                style={{ accentColor: '#FF9F0A' }}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  if (!enabled) return;
                  const next = Number(event.target.value);
                  const nextConfig: ExternalMidiConfig = {
                    ...config,
                    values: { ...config.values, [control.id]: next },
                  };
                  onChange(nextConfig);
                  for (const message of buildExternalMidiLiveMessages(nextConfig, control.id, next)) {
                    onSend(config.portName, message);
                  }
                }}
              />
            </label>
          );
        })}
      </div>

      {editable && (
        <button
          className="hw-squarebtn mt-2 w-full px-1 py-1 text-[9px] font-semibold"
          style={{ background: '#3A3A3C', color: '#E5E5EA' }}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          title="Configurar porta, programa e controles MIDI"
        >
          Editar MIDI
        </button>
      )}
    </section>
  );
};
