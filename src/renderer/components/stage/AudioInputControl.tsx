import React from 'react';
import type { AudioInputSettings, AudioInputState } from '@shared/types';

interface AudioInputControlProps {
  settings?: AudioInputSettings;
  state?: AudioInputState | null;
  channels: number;
  /** No Layout o controle é apenas um preview; em Perform ele é interativo. */
  interactive?: boolean;
  editable?: boolean;
  onChange?: (update: Partial<AudioInputSettings>) => void;
  onEnable?: () => void;
  onDisable?: () => void;
  onResetFeedback?: () => void;
  onKeepMuted?: () => void;
  onDisableProtection?: () => void;
}

const meterHeight = (peakDb: number): number =>
  Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100));

/** Controle opcional de entrada de áudio (guitarra/microfone) do Layout. */
export const AudioInputControl: React.FC<AudioInputControlProps> = ({
  settings,
  state,
  channels,
  interactive = true,
  editable = true,
  onChange,
  onEnable,
  onDisable,
  onResetFeedback,
  onKeepMuted,
  onDisableProtection,
}) => {
  const locked = !interactive || !editable;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  if (!settings?.enabled) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-1 text-center">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: '#FF9F0A', color: '#1A1A1A' }}
        >
          IN
        </span>
        <span className="hw-label">Audio Input</span>
        {interactive && editable && onEnable ? (
          <button
            type="button"
            className="hw-squarebtn px-2 py-1 text-[9px]"
            onClick={(event) => {
              stop(event);
              onEnable();
            }}
          >
            + Ativar entrada
          </button>
        ) : (
          <span className="hw-badge">Desativado</span>
        )}
        <p className="text-[8px] leading-relaxed" style={{ color: '#8E8E93' }}>
          Guitarra ou microfone. O volume começa em 0 dB para evitar feedback.
        </p>
      </div>
    );
  }

  const percent = meterHeight(state?.peakDb ?? -100);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-left">
      <div className="flex items-center gap-1 border-b pb-1" style={{ borderColor: '#3A3A3C' }}>
        <span
          className="rounded px-1 py-0.5 text-[9px] font-bold"
          style={{ background: '#FF9F0A', color: '#1A1A1A' }}
        >
          IN
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">Entrada de áudio</span>
        {interactive && editable && onDisable && (
          <button
            type="button"
            className="rounded px-1 text-[10px] text-slate-500 hover:text-red-300"
            title="Desativar entrada de áudio"
            onClick={(event) => {
              stop(event);
              onDisable();
            }}
          >
            ×
          </button>
        )}
      </div>

      <label className="mt-1.5 block text-[8px]" style={{ color: '#9A9AA0' }} onPointerDown={stop}>
        ENTRADA
        <select
          className="mt-0.5 w-full rounded px-1 py-0.5 text-[8px] outline-none disabled:opacity-60"
          style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          value={settings.inputChannel}
          disabled={locked}
          onClick={stop}
          onChange={(event) => onChange?.({ inputChannel: Number(event.target.value) })}
          title="Canal de entrada do dispositivo de áudio"
        >
          {Array.from({ length: Math.max(1, channels) }, (_, index) => (
            <option key={index} value={index}>
              In {index + 1}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-1 block text-[8px]" style={{ color: '#9A9AA0' }} onPointerDown={stop}>
        FORMATO
        <select
          className="mt-0.5 w-full rounded px-1 py-0.5 text-[8px] outline-none disabled:opacity-60"
          style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#E5E5EA' }}
          value={settings.mode}
          disabled={locked}
          onClick={stop}
          onChange={(event) => onChange?.({ mode: event.target.value === 'stereo' ? 'stereo' : 'mono' })}
        >
          <option value="mono">Mono</option>
          <option value="stereo">Estéreo</option>
        </select>
      </label>

      <div className="mt-1.5 flex items-center justify-center gap-2">
        <div
          className="relative h-16 w-2 overflow-hidden rounded-sm bg-black/70"
          role="meter"
          aria-label="Pico da entrada de áudio"
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={Math.max(-60, state?.peakDb ?? -100)}
        >
          <div
            className="absolute bottom-0 w-full"
            style={{ height: `${percent}%`, background: percent > 90 ? '#FF554D' : '#30D158' }}
          />
        </div>
        <div className="flex h-16 flex-col items-center justify-between">
          <span className="text-[8px]" style={{ color: '#C6C6CB' }}>
            {settings.volumeDb.toFixed(1)} dB
          </span>
          <input
            aria-label="Volume da entrada de áudio"
            type="range"
            min={-60}
            max={6}
            step={0.1}
            value={settings.volumeDb}
            disabled={locked}
            onClick={stop}
            onChange={(event) => onChange?.({ volumeDb: Number(event.target.value) })}
            className="h-10 w-4"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#FF9F0A' }}
          />
          <span className="text-[8px]" style={{ color: '#8E8E93' }}>
            −60
          </span>
        </div>
      </div>

      <label className="mt-1 block text-[8px]" style={{ color: '#9A9AA0' }} onPointerDown={stop}>
        PAN{' '}
        <span className="float-right">
          {settings.pan === 0 ? 'C' : settings.pan < 0 ? `L ${Math.round(-settings.pan * 100)}` : `R ${Math.round(settings.pan * 100)}`}
        </span>
        <input
          aria-label="Pan da entrada de áudio"
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={settings.pan}
          disabled={locked}
          onClick={stop}
          onChange={(event) => onChange?.({ pan: Number(event.target.value) })}
          className="w-full"
          style={{ accentColor: '#FF9F0A' }}
        />
      </label>

      <button
        type="button"
        className="hw-squarebtn mt-1 w-full px-1 py-1 text-[9px]"
        aria-pressed={settings.muted}
        disabled={locked}
        onClick={(event) => {
          stop(event);
          onChange?.({ muted: !settings.muted });
        }}
        style={settings.muted ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
      >
        MUTE
      </button>

      <label className="mt-1 flex items-center gap-1 text-[8px]" style={{ color: '#9A9AA0' }} onPointerDown={stop}>
        <input
          type="checkbox"
          checked={settings.feedbackProtection}
          disabled={locked}
          onClick={stop}
          onChange={(event) => onChange?.({ feedbackProtection: event.target.checked })}
          style={{ accentColor: '#FF9F0A' }}
        />
        Feedback Protection
      </label>

      <p className="mt-1 text-[8px] leading-relaxed" style={{ color: '#FFB340' }}>
        ⚠ Guitarra/microfone pode gerar feedback. Aumente o volume devagar.
      </p>

      {channels === 0 && (
        <p className="mt-1 text-[8px]" style={{ color: '#FF8A80' }}>
          Inicie o áudio nas Configurações para liberar as entradas.
        </p>
      )}

      {state?.feedback && (
        <div
          className="mt-1 rounded border px-1 py-1 text-[8px]"
          style={{ borderColor: '#FF554D', background: 'rgba(255,85,77,0.15)', color: '#FFD1CF' }}
        >
          <div className="font-semibold">Feedback detectado — canal silenciado.</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              className="hw-squarebtn px-1 py-0.5 text-[8px]"
              onClick={(event) => {
                stop(event);
                onResetFeedback?.();
              }}
            >
              Continuar
            </button>
            <button
              type="button"
              className="hw-squarebtn px-1 py-0.5 text-[8px]"
              onClick={(event) => {
                stop(event);
                onKeepMuted?.();
              }}
            >
              Manter mudo
            </button>
            <button
              type="button"
              className="hw-squarebtn px-1 py-0.5 text-[8px]"
              onClick={(event) => {
                stop(event);
                onDisableProtection?.();
              }}
            >
              Desativar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
