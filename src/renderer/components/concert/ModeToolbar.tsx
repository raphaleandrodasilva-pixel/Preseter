import React, { useEffect, useState } from 'react';
import { PatchLcd } from '../hardware/PatchLcd';
import { NumberField } from '../ui/NumberField';

export type ConcertMode = 'layout' | 'edit' | 'perform';

import type { SettingsTab } from './SettingsModal';

interface ModeToolbarProps {
  mode: ConcertMode;
  onModeChange: (mode: ConcertMode) => void;
  concertName: string;
  onConcertNameChange: (name: string) => void;
  tempo: number;
  onTempoChange: (tempo: number) => void;
  programNumber: number;
  presetCount: number;
  currentPresetName: string | null;
  midiLastMessage: string | null;
  /** Incrementa a cada nota MIDI enviada; acende o LED redondo. */
  midiOutPulse: number;
  /** Teclado do PC como instrumento (Ableton). */
  computerKeyboardMidi: boolean;
  onToggleComputerKeyboardMidi: () => void;
  isMetronomeOn: boolean;
  onToggleMetronome: () => void;
  /** Abre os ajustes do concert na aba do metrônomo. */
  onOpenConcertSettings: () => void;
  onPanic: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
}

const MODES: { id: ConcertMode; label: string; hint: string }[] = [
  { id: 'layout', label: 'Layout', hint: 'Organizar controles e assignments (Ctrl+1)' },
  { id: 'edit', label: 'Edit', hint: 'Editar sons, timbres e mappings (Ctrl+2)' },
  { id: 'perform', label: 'Perform', hint: 'Tocar em tela cheia (Ctrl+3/4)' },
];

export const ModeToolbar: React.FC<ModeToolbarProps> = ({
  mode,
  onModeChange,
  concertName,
  onConcertNameChange,
  tempo,
  onTempoChange,
  programNumber,
  presetCount,
  currentPresetName,
  midiLastMessage,
  midiOutPulse,
  computerKeyboardMidi,
  onToggleComputerKeyboardMidi,
  isMetronomeOn,
  onToggleMetronome,
  onOpenConcertSettings,
  onPanic,
  onOpenSettings,
}) => {
  const midiActive = !!midiLastMessage;
  const [midiOutLit, setMidiOutLit] = useState(false);

  useEffect(() => {
    if (midiOutPulse <= 0) return;
    setMidiOutLit(true);
    const timer = window.setTimeout(() => setMidiOutLit(false), 140);
    return () => window.clearTimeout(timer);
  }, [midiOutPulse]);

  return (
    <header
      className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-3"
      style={{
        background: 'linear-gradient(to bottom, #4A4A4D, #333335)',
        borderColor: '#0E0E10',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex items-center gap-px overflow-hidden rounded-md"
          style={{ border: '1px solid #151517', boxShadow: '0 1px 0 rgba(255,255,255,0.08)' }}
        >
          {MODES.map(({ id, label, hint }) => (
            <button
              key={id}
              title={hint}
              onClick={() => onModeChange(id)}
              className="px-4 py-1.5 text-xs font-medium transition-colors"
              style={
                mode === id
                  ? { background: 'linear-gradient(to bottom, #2F93FF, #0A6FE0)', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }
                  : { background: 'linear-gradient(to bottom, #4F4F52, #3E3E40)', color: '#E5E5EA' }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={concertName}
          onChange={(e) => onConcertNameChange(e.target.value)}
          className="w-44 min-w-0 truncate bg-transparent text-sm font-semibold outline-none"
          style={{ color: '#F2F2F7' }}
          title="Nome do concert"
        />
      </div>

      <PatchLcd programNumber={programNumber} patchName={currentPresetName} tempo={tempo} />

      <div className="flex items-center justify-end gap-2 text-[11px]">
        <button
          onClick={() => onOpenSettings('general')}
          title="Configurações"
          className="hw-squarebtn flex items-center gap-2 px-3 py-1.5 text-xs"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: midiActive ? '#30D158' : '#636366',
              boxShadow: midiActive ? '0 0 6px #30D158' : 'none',
            }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full transition-shadow"
            title="Atividade MIDI de saída"
            style={{
              background: midiOutLit ? '#0A84FF' : '#3A3A3C',
              boxShadow: midiOutLit ? '0 0 8px #0A84FF' : 'none',
            }}
          />
          Configurações
        </button>

        <button
          onClick={onToggleComputerKeyboardMidi}
          title="Teclado do PC como instrumento (Ableton)"
          aria-pressed={computerKeyboardMidi}
          className="hw-squarebtn flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          style={computerKeyboardMidi
            ? { background: 'rgba(10,132,255,0.18)', color: '#7FB6FF', border: '1px solid #0A84FF' }
            : { color: '#9A9AA0' }}
        >
          ⌨
        </button>

        <label
          className="hw-squarebtn flex items-center gap-1.5 px-2.5 py-1.5"
          title="Tempo do concert"
          style={{ color: '#9A9AA0' }}
        >
          <span className="hw-label" style={{ fontSize: 9 }}>Tempo</span>
          <NumberField
            min={20}
            max={300}
            value={tempo}
            onCommit={onTempoChange}
            className="w-12 bg-transparent text-right text-[11px] tabular-nums outline-none"
            style={{ color: '#EDEDEF' }}
          />
        </label>
        <button
          onClick={onToggleMetronome}
          title="Metrônomo — clique para ligar/desligar"
          className={`hw-squarebtn px-2.5 py-1.5${isMetronomeOn ? ' on' : ''}`}
        >
          Metro
        </button>
        <button
          onClick={onOpenConcertSettings}
          title="Ajustes do metrônomo — compasso e volume"
          aria-label="Ajustes do metrônomo"
          className="hw-squarebtn px-1.5 py-1.5"
          style={{ color: '#9A9AA0' }}
        >
          ▾
        </button>
        <button
          onClick={onPanic}
          title="Panic — corta o som de todos os plugins (Ctrl+P)"
          className="hw-squarebtn px-2.5 py-1.5"
        >
          Panic
        </button>
        <span className="hidden tabular-nums xl:inline" style={{ color: '#9A9AA0' }} title="Patches no concert">
          {presetCount} patch(es)
        </span>
      </div>
    </header>
  );
};
