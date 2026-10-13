import React from 'react';
import type { Preset } from '@shared/types';

interface StageHeaderProps {
  preset: Preset | null;
  onEditPreset: (preset: Preset) => void;
  onNewPreset: () => void;
  onOpenMidi: () => void;
  onOpenVst: () => void;
  onOpenPresetManager: () => void;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  preset,
  onEditPreset,
  onNewPreset,
  onOpenMidi,
  onOpenVst,
  onOpenPresetManager,
}) => (
  <header className="stg-header">
    <div className="stg-progbox" title="Número do programa MIDI">
      <span className="stg-prognum">
        {preset ? String(preset.programNumber + 1) : '––'}
      </span>
    </div>
    <div className="stg-titleblock">
      <div className="stg-cat">{preset?.category?.trim() || 'Sem categoria'}</div>
      <h1 className="stg-name">{preset?.name ?? 'Nenhum patch selecionado'}</h1>
      <div className="stg-sub">
        {preset
          ? `Canal MIDI ${preset.midiChannel + 1} · ${preset.plugins?.length ?? 0} plugin(s) associado(s)`
          : 'Escolha um patch na lista ao lado'}
      </div>
    </div>
    <div className="stg-actions">
      <button className="stg-btn" onClick={onOpenPresetManager}>Gerenciar</button>
      <button className="stg-btn" onClick={onOpenMidi}>MIDI</button>
      <button className="stg-btn" onClick={onOpenVst}>VSTs</button>
      {preset && (
        <button className="stg-btn" onClick={() => onEditPreset(preset)}>Editar</button>
      )}
      <button className="stg-btn stg-btn-primary" onClick={onNewPreset}>+ Preset</button>
    </div>
  </header>
);
