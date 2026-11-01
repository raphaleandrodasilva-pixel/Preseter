import React, { useEffect } from 'react';
import type { ArpMode, ArpRate, ArpSettings } from '@shared/types';

interface ArpeggiatorModalProps {
  layerName: string;
  settings: ArpSettings;
  onChange: (settings: ArpSettings) => void;
  onClose: () => void;
}

const MODES: Array<{ value: ArpMode; label: string }> = [
  { value: 'up', label: 'Para cima ↑' },
  { value: 'down', label: 'Para baixo ↓' },
  { value: 'updown', label: 'Cima/baixo ↕' },
  { value: 'random', label: 'Aleatório ⚄' },
  { value: 'played', label: 'Ordem tocada ♪' },
];

const RATES: ArpRate[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'];

/** Modal de configuração do arpejador MIDI de um layer. */
export const ArpeggiatorModal: React.FC<ArpeggiatorModalProps> = ({
  layerName,
  settings,
  onChange,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (patch: Partial<ArpSettings>) => onChange({ ...settings, ...patch });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Arpejador — ${layerName}`}
        className="hw-panel w-full max-w-md p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="hw-label">Arpejador</div>
            <div className="truncate text-sm font-semibold text-white">{layerName}</div>
          </div>
          <button
            type="button"
            className="hw-squarebtn ml-auto px-2.5 py-1 text-sm"
            style={{ color: '#EDEDEF' }}
            onClick={onClose}
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[11px] font-semibold"
            aria-pressed={settings.enabled}
            onClick={() => update({ enabled: !settings.enabled })}
            style={settings.enabled
              ? { background: '#FF9F0A', color: '#1A1A1A', borderColor: '#FF9F0A' }
              : undefined}
          >
            {settings.enabled ? 'Arp LIGADO' : 'Arp desligado'}
          </button>
          <span className="text-[10px]" style={{ color: '#8E8E93' }}>
            Sincronizado ao tempo do concert
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-[11px]" style={{ color: '#9A9AA0' }}>
            Modo
            <select
              className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
              value={settings.mode}
              onChange={(event) => update({ mode: event.target.value as ArpMode })}
            >
              {MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px]" style={{ color: '#9A9AA0' }}>
            Rate
            <select
              className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
              value={settings.rate}
              onChange={(event) => update({ rate: event.target.value as ArpRate })}
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>{rate}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px]" style={{ color: '#9A9AA0' }}>
            Oitavas
            <select
              className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
              value={settings.octaves}
              onChange={(event) => update({ octaves: Number(event.target.value) })}
            >
              {[1, 2, 3, 4].map((octaves) => (
                <option key={octaves} value={octaves}>{octaves}</option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-[11px]" style={{ color: '#9A9AA0' }}>
            <input
              type="checkbox"
              style={{ accentColor: '#FF9F0A' }}
              checked={settings.hold}
              onChange={(event) => update({ hold: event.target.checked })}
            />
            Hold / latch
          </label>
          <label className="col-span-2 text-[11px]" style={{ color: '#9A9AA0' }}>
            Gate <span className="float-right" style={{ color: '#C6C6CB' }}>{Math.round(settings.gate)}%</span>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={settings.gate}
              onChange={(event) => update({ gate: Number(event.target.value) })}
              className="mt-1 w-full"
              style={{ accentColor: '#FF9F0A' }}
            />
          </label>
          <label className="col-span-2 text-[11px]" style={{ color: '#9A9AA0' }}>
            Swing <span className="float-right" style={{ color: '#C6C6CB' }}>{Math.round(settings.swing)}%</span>
            <input
              type="range"
              min={0}
              max={75}
              step={1}
              value={settings.swing}
              onChange={(event) => update({ swing: Number(event.target.value) })}
              className="mt-1 w-full"
              style={{ accentColor: '#FF9F0A' }}
            />
          </label>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: '#8E8E93' }}>
          O arp substitui as notas originais do layer. Funciona com teclado na tela, MIDI
          hardware e qualquer nota que chegue ao instrumento.
        </p>
      </div>
    </div>
  );
};
