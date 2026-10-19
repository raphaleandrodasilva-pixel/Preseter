import React from 'react';
import type { AudioInputState } from '@shared/types';
import { ModalShell } from '../ui/ModalShell';

interface TunerModalProps {
  state: AudioInputState | null;
  referenceHz: number;
  onClose: () => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const TunerModal: React.FC<TunerModalProps> = ({ state, referenceHz, onClose }) => {
  const pitch = state?.pitchHz ?? 0;
  const midi = pitch > 0 ? Math.round(69 + 12 * Math.log2(pitch / referenceHz)) : null;
  const note = midi !== null ? NOTES[((midi % 12) + 12) % 12] : '—';
  const octave = midi !== null ? Math.floor(midi / 12) - 1 : '';
  const reference = midi !== null ? referenceHz * Math.pow(2, (midi - 69) / 12) : 0;
  const cents = pitch > 0 && reference > 0 ? 1200 * Math.log2(pitch / reference) : 0;
  const needle = Math.max(-50, Math.min(50, cents));

  return (
    <ModalShell
      label="Ferramenta"
      title="Afinador"
      lcd={state?.enabled ? 'Entrada ativa' : 'Entrada inativa'}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="px-5 pb-5 pt-2">
        <div className="hw-label mb-3">
          {state?.enabled ? 'Toque uma nota para afinar' : 'Ative o strip de entrada de áudio no patch'}
        </div>

        <div className="hw-inset p-4 text-center">
          <div className="text-6xl font-semibold text-white">
            {note}<span className="text-2xl" style={{ color: '#8E8E93' }}>{octave}</span>
          </div>
          <div className="mt-1 text-xs" style={{ color: '#9A9AA0' }}>
            {pitch > 0 ? `${pitch.toFixed(1)} Hz · ${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cents` : 'Toque uma nota para afinar'}
          </div>

          <div className="relative mt-5 h-16 overflow-hidden rounded-lg" style={{ border: '1px solid #303032', background: '#242426' }}>
            <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: '#30D158' }} />
            {[-50, -25, 25, 50].map((mark) => (
              <div
                key={mark}
                className="absolute top-0 h-3 w-px"
                style={{ left: `${((mark + 50) / 100) * 100}%`, background: '#3A3A3C' }}
              />
            ))}
            <div
              className="absolute bottom-0 top-0 w-1 rounded"
              style={{
                left: `calc(${((needle + 50) / 100) * 100}% - 2px)`,
                background: Math.abs(cents) < 5 ? '#30D158' : '#FF9F0A',
                transition: 'left 120ms linear',
              }}
            />
            <div className="absolute bottom-1 left-2 text-[10px]" style={{ color: '#636366' }}>−50</div>
            <div className="absolute bottom-1 right-2 text-[10px]" style={{ color: '#636366' }}>+50</div>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px]" style={{ color: '#8E8E93' }}>
          Afinação: A4 = {referenceHz} Hz (referência do patch vem do Patch Settings)
        </p>
      </div>
    </ModalShell>
  );
};
