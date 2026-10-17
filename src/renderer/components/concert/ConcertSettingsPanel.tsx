import React, { useState } from 'react';
import type { ConcertSettings, PanLaw } from '@shared/types';

interface ConcertSettingsPanelProps {
  settings: ConcertSettings;
  tempo: number;
  onChange: (patch: Partial<ConcertSettings>) => void;
  onTempoChange: (tempo: number) => void;
  /** Nomes das portas de entrada MIDI, para a origem do Program Change. */
  midiInputNames: string[];
}

type Tab = 'midi' | 'timing' | 'tuning' | 'strips' | 'metronome' | 'notes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'midi', label: 'MIDI' },
  { id: 'timing', label: 'Timing' },
  { id: 'tuning', label: 'Tuning' },
  { id: 'strips', label: 'Channel Strips' },
  { id: 'metronome', label: 'Metrônomo' },
  { id: 'notes', label: 'Notes' },
];

const PAN_LAWS: { key: string; label: string; panLaw: PanLaw; compensated: boolean }[] = [
  { key: '0', label: '0 dB', panLaw: 0, compensated: false },
  { key: '-3', label: '−3 dB', panLaw: -3, compensated: false },
  { key: '-3c', label: '−3 dB comp.', panLaw: -3, compensated: true },
  { key: '-4.5', label: '−4,5 dB', panLaw: -4.5, compensated: false },
  { key: '-4.5c', label: '−4,5 dB comp.', panLaw: -4.5, compensated: true },
  { key: '-6', label: '−6 dB', panLaw: -6, compensated: false },
  { key: '-6c', label: '−6 dB comp.', panLaw: -6, compensated: true },
];

const classInput =
  'mt-1 w-full rounded-lg border border-[#3A3A3C] bg-[#242426] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0A84FF]';
const classLabel = 'text-[11px] text-slate-400';
const classCheck = 'flex items-center gap-2 text-[11px] text-slate-300';

/** Inspector de Concert Settings (Fase 2.4), mostrado ao selecionar o concert. */
export const ConcertSettingsPanel: React.FC<ConcertSettingsPanelProps> = ({
  settings,
  tempo,
  onChange,
  onTempoChange,
  midiInputNames,
}) => {
  const [tab, setTab] = useState<Tab>('midi');

  const currentPanLawKey =
    PAN_LAWS.find(
      (item) => item.panLaw === settings.channelStrips.panLaw && item.compensated === settings.channelStrips.panLawCompensated
    )?.key ?? '-3';

  return (
    <div className="flex shrink-0 flex-col border-t" style={{ borderColor: '#1E1E24', background: '#0A0A0C', height: 248 }}>
      <div className="flex items-center gap-1 border-b px-3" style={{ borderColor: '#1E1E24' }}>
        <span className="mr-2 text-[11px] font-semibold" style={{ color: '#EDEDEF' }}>Concert Settings</span>
        {TABS.map(({ id, label }) => (
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
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'midi' && (
          <div className="grid max-w-4xl gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className={classCheck}>
                <input
                  type="checkbox"
                  style={{ accentColor: '#0A84FF' }}
                  checked={settings.midi.cc7ControlsVolume}
                  onChange={(e) => onChange({ midi: { ...settings.midi, cc7ControlsVolume: e.target.checked } })}
                />
                CC7 controla o volume dos channel strips
              </label>
              <label className={classCheck}>
                <input
                  type="checkbox"
                  style={{ accentColor: '#0A84FF' }}
                  checked={settings.midi.cc10ControlsPan}
                  onChange={(e) => onChange({ midi: { ...settings.midi, cc10ControlsPan: e.target.checked } })}
                />
                CC10 controla o pan dos channel strips
              </label>
              <label className={classCheck}>
                <input
                  type="checkbox"
                  style={{ accentColor: '#0A84FF' }}
                  checked={settings.midi.sendUnassignedMidiToStrips}
                  onChange={(e) =>
                    onChange({ midi: { ...settings.midi, sendUnassignedMidiToStrips: e.target.checked } })
                  }
                />
                Enviar MIDI não atribuído a todos os channel strips
              </label>
              <label className={classCheck}>
                <input
                  type="checkbox"
                  style={{ accentColor: '#0A84FF' }}
                  checked={settings.midi.sendUnusedProgramChangeToStrips}
                  onChange={(e) =>
                    onChange({ midi: { ...settings.midi, sendUnusedProgramChangeToStrips: e.target.checked } })
                  }
                />
                Enviar Program Change não usado aos channel strips
              </label>
            </div>

            <div className="grid gap-3">
              <label className={classLabel}>
                Transpose do concert (semitons)
                <input
                  className={classInput}
                  type="number"
                  min={-24}
                  max={24}
                  value={settings.midi.transpose}
                  onChange={(e) =>
                    onChange({ midi: { ...settings.midi, transpose: Math.max(-24, Math.min(24, Number(e.target.value) || 0)) } })
                  }
                />
              </label>
              <label className={classLabel}>
                Origem do Program Change — dispositivo
                <select
                  className={classInput}
                  value={settings.midi.programChange.device}
                  onChange={(e) =>
                    onChange({ midi: { ...settings.midi, programChange: { ...settings.midi.programChange, device: e.target.value } } })
                  }
                >
                  <option value="">Qualquer dispositivo</option>
                  {midiInputNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  {settings.midi.programChange.device && !midiInputNames.includes(settings.midi.programChange.device) && (
                    <option value={settings.midi.programChange.device}>{settings.midi.programChange.device}</option>
                  )}
                </select>
              </label>
              <label className={classLabel}>
                Origem do Program Change — canal
                <select
                  className={classInput}
                  value={settings.midi.programChange.channel === null ? '' : String(settings.midi.programChange.channel)}
                  onChange={(e) =>
                    onChange({
                      midi: {
                        ...settings.midi,
                        programChange: {
                          ...settings.midi.programChange,
                          channel: e.target.value === '' ? null : Number(e.target.value),
                        },
                      },
                    })
                  }
                >
                  <option value="">Qualquer canal</option>
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i} value={i}>Canal {i + 1}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {tab === 'timing' && (
          <div className="flex max-w-xl flex-wrap items-end gap-4">
            <label className={classLabel}>
              Tempo (BPM)
              <input
                className={classInput}
                type="number"
                min={20}
                max={300}
                value={tempo}
                onChange={(e) => onTempoChange(Math.max(20, Math.min(300, Number(e.target.value) || 120)))}
              />
            </label>
            <label className={classLabel}>
              Compasso — numerador
              <input
                className={classInput}
                type="number"
                min={1}
                max={32}
                value={settings.timeSignature.numerator}
                onChange={(e) =>
                  onChange({
                    timeSignature: {
                      ...settings.timeSignature,
                      numerator: Math.max(1, Math.min(32, Number(e.target.value) || 4)),
                    },
                  })
                }
              />
            </label>
            <label className={classLabel}>
              Compasso — denominador
              <select
                className={classInput}
                value={settings.timeSignature.denominator}
                onChange={(e) => onChange({ timeSignature: { ...settings.timeSignature, denominator: Number(e.target.value) } })}
              >
                {[1, 2, 4, 8, 16, 32].map((value) => (
                  <option key={value} value={value}>1/{value}</option>
                ))}
              </select>
            </label>
            <div className="pb-1 text-[11px]" style={{ color: '#9A9AA0' }}>
              {settings.timeSignature.numerator}/{settings.timeSignature.denominator} · ♩ = {tempo}
            </div>
          </div>
        )}

        {tab === 'tuning' && (
          <div className="max-w-xl text-[11px]" style={{ color: '#9A9AA0' }}>
            A afinação mestre do concert (em cents) chega junto com os channel strips completos da Fase 3.
            Por enquanto os instrumentos usam a afinação própria de cada plugin.
          </div>
        )}

        {tab === 'strips' && (
          <div className="max-w-xl">
            <label className={classLabel}>
              Pan law
              <select
                className={classInput}
                value={currentPanLawKey}
                onChange={(e) => {
                  const option = PAN_LAWS.find((item) => item.key === e.target.value);
                  if (option) {
                    onChange({
                      channelStrips: { panLaw: option.panLaw, panLawCompensated: option.compensated },
                    });
                  }
                }}
              >
                {PAN_LAWS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-[10px]" style={{ color: '#636366' }}>
              A lei de pan define quanto o nível cai ao posicionar o som no centro. Aplicada aos channel strips
              quando as strips completas chegarem (Fase 3).
            </p>
          </div>
        )}

        {tab === 'metronome' && (
          <div className="flex max-w-xl flex-col gap-3">
            <label className={classCheck}>
              <input
                type="checkbox"
                style={{ accentColor: '#0A84FF' }}
                checked={settings.metronome.enabled}
                onChange={(e) => onChange({ metronome: { ...settings.metronome, enabled: e.target.checked } })}
              />
              Metrônomo ligado
            </label>
            <label className={classLabel}>
              Volume do clique (dB)
              <input
                className={classInput}
                type="number"
                min={-60}
                max={0}
                value={settings.metronome.volumeDb}
                onChange={(e) =>
                  onChange({ metronome: { ...settings.metronome, volumeDb: Math.max(-60, Math.min(0, Number(e.target.value) || -12)) } })
                }
              />
            </label>
            <label className={classCheck}>
              <input
                type="checkbox"
                style={{ accentColor: '#0A84FF' }}
                checked={settings.metronome.accentFirstBeat}
                onChange={(e) => onChange({ metronome: { ...settings.metronome, accentFirstBeat: e.target.checked } })}
              />
              Acentuar o primeiro tempo do compasso
            </label>
          </div>
        )}

        {tab === 'notes' && (
          <textarea
            value={settings.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Anotações do concert — repertório, ordem das músicas, avisos de palco…"
            className="h-full min-h-[140px] w-full rounded-lg border border-[#3A3A3C] bg-[#242426] p-2 text-xs text-slate-200 outline-none focus:border-[#0A84FF]"
          />
        )}
      </div>
    </div>
  );
};
