import React, { useEffect } from 'react';
import type { ConcertSettings } from '@shared/types';
import { ModalShell } from '../ui/ModalShell';
import { ConcertSettingsPanel, type ConcertSettingsTab } from './ConcertSettingsPanel';

interface ConcertSettingsModalProps {
  settings: ConcertSettings;
  tempo: number;
  onChange: (patch: Partial<ConcertSettings>) => void;
  onTempoChange: (tempo: number) => void;
  midiInputNames: string[];
  initialTab?: ConcertSettingsTab;
  onClose: () => void;
}

/** Janela de ajustes do concert, com foco no metrônomo (compasso e volume). */
export const ConcertSettingsModal: React.FC<ConcertSettingsModalProps> = ({
  settings,
  tempo,
  onChange,
  onTempoChange,
  midiInputNames,
  initialTab = 'metronome',
  onClose,
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const signature = `${settings.timeSignature.numerator}/${settings.timeSignature.denominator}`;

  return (
    <ModalShell
      label="Concert"
      title="Ajustes do concert"
      lcd={`${signature} · ${tempo} BPM`}
      onClose={onClose}
      maxWidth="max-w-4xl"
      maxHeight="max-h-[88vh]"
      zIndex="z-[1100]"
    >
      <div className="flex h-[min(560px,72vh)] min-h-0 flex-col">
        <ConcertSettingsPanel
          settings={settings}
          tempo={tempo}
          onChange={onChange}
          onTempoChange={onTempoChange}
          midiInputNames={midiInputNames}
          initialTab={initialTab}
          variant="modal"
        />
      </div>
    </ModalShell>
  );
};
