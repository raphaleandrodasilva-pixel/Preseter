import React, { useEffect, useRef, useState } from 'react';
import { PatchLcd } from '../hardware/PatchLcd';

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
  isMetronomeOn: boolean;
  onToggleMetronome: () => void;
  onPanic: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
}

const MODES: { id: ConcertMode; label: string; hint: string }[] = [
  { id: 'layout', label: 'Layout', hint: 'Organizar controles e assignments (Cmd+1)' },
  { id: 'edit', label: 'Edit', hint: 'Editar sons, channel strips e mappings (Cmd+2)' },
  { id: 'perform', label: 'Perform', hint: 'Tocar em tela cheia (Cmd+3/4)' },
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
  isMetronomeOn,
  onToggleMetronome,
  onPanic,
  onOpenSettings,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openTab = (tab: SettingsTab) => {
    setMenuOpen(false);
    onOpenSettings(tab);
  };

  const midiActive = !!midiLastMessage;

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-b px-4"
      style={{
        background: 'linear-gradient(to bottom, #17171A, #0B0B0D)',
        borderColor: '#26262B',
      }}
    >
      <div className="flex items-center gap-2.5">
        <PatchLcd programNumber={programNumber} patchName={currentPresetName} tempo={tempo} />
        <input
          value={concertName}
          onChange={(e) => onConcertNameChange(e.target.value)}
          className="w-40 bg-transparent text-sm font-semibold tracking-wide outline-none"
          style={{ color: '#EDEDEF' }}
          title="Nome do concert"
        />
      </div>

      <div
        className="ml-2 flex items-center gap-0.5 rounded-lg p-1"
        style={{ background: '#131316', border: '1px solid #2E2E34' }}
      >
        {MODES.map(({ id, label, hint }) => (
          <button
            key={id}
            title={hint}
            onClick={() => onModeChange(id)}
            className="rounded-md px-4 py-1.5 text-xs font-medium transition-all"
            style={
              mode === id
                ? { background: '#131316', color: '#fff', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)', border: '1px solid #2E2E34' }
                : { color: '#9A9AA0' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 text-[11px]">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Configurações — MIDI e VST"
            className="hw-squarebtn flex items-center gap-2 px-3 py-1.5 text-xs"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: midiActive ? '#2DFF6A' : '#55555E',
                boxShadow: midiActive ? '0 0 6px #2DFF6A' : 'none',
              }}
            />
            Configurações
            <span style={{ color: '#9A9AA0' }}>▾</span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl"
              style={{ background: '#1C1C1F', border: '1px solid #2E2E34', boxShadow: '0 18px 45px rgba(0,0,0,0.6)' }}
            >
              <button
                onClick={() => openTab('midi')}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
                style={{ color: '#EDEDEF' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: midiActive ? '#2DFF6A' : '#55555E',
                    boxShadow: midiActive ? '0 0 6px #2DFF6A' : 'none',
                  }}
                />
                <span className="flex-1">Dispositivos MIDI</span>
                <span style={{ color: '#9A9AA0' }}>→</span>
              </button>
              <div style={{ height: 1, background: '#2E2E34' }} />
              <button
                onClick={() => openTab('vst')}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
                style={{ color: '#EDEDEF' }}
              >
                <span className="hw-label" style={{ fontSize: 9 }}>VST</span>
                <span className="flex-1">Plugins VST</span>
                <span style={{ color: '#9A9AA0' }}>→</span>
              </button>
            </div>
          )}
        </div>

        <label
          className="hw-squarebtn flex items-center gap-1.5 px-2.5 py-1.5"
          title="Tempo do concert"
          style={{ color: '#9A9AA0' }}
        >
          <span className="hw-label" style={{ fontSize: 9 }}>Tempo</span>
          <input
            type="number"
            min={20}
            max={300}
            value={tempo}
            onChange={(e) => onTempoChange(Math.max(20, Math.min(300, Number(e.target.value) || 120)))}
            className="w-12 bg-transparent text-right text-[11px] tabular-nums outline-none"
            style={{ color: '#EDEDEF' }}
          />
        </label>
        <button
          onClick={onToggleMetronome}
          title="Metrônomo"
          className={`hw-squarebtn px-2.5 py-1.5${isMetronomeOn ? ' on' : ''}`}
        >
          Metro
        </button>
        <button
          onClick={onPanic}
          title="Panic — silencia notas MIDI"
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
