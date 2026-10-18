/**
 * Strip de entrada de áudio (Fase 3.5).
 *
 * O patch guarda a configuração; o motor mantém o processador e devolve o
 * estado em tempo real (peak/feedback). Estas funções são puras.
 */

import type { AudioInputSettings, AudioInputState } from './types';

export const MAX_AUDIO_INPUT_CHANNELS = 16;

/** Valores iniciais iguais ao MainStage: volume 0 dB e proteção ligada. */
export function defaultAudioInput(): AudioInputSettings {
  return {
    enabled: true,
    inputChannel: 0,
    mode: 'mono',
    volumeDb: 0,
    pan: 0,
    muted: false,
    feedbackProtection: true,
    output: 1,
  };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Completa/normaliza uma configuração vinda do arquivo do concert. */
export function normalizeAudioInput(value: unknown): AudioInputSettings {
  const defaults = defaultAudioInput();
  if (!value || typeof value !== 'object') return { ...defaults, enabled: false };
  const input = value as Partial<AudioInputSettings>;
  const mode: AudioInputSettings['mode'] = input.mode === 'stereo' ? 'stereo' : 'mono';
  return {
    enabled: input.enabled === true,
    inputChannel: isNumber(input.inputChannel)
      ? clamp(Math.round(input.inputChannel), 0, MAX_AUDIO_INPUT_CHANNELS - 1)
      : defaults.inputChannel,
    mode,
    volumeDb: isNumber(input.volumeDb) ? clamp(input.volumeDb, -60, 6) : defaults.volumeDb,
    pan: isNumber(input.pan) ? clamp(input.pan, -1, 1) : defaults.pan,
    muted: input.muted === true,
    feedbackProtection: input.feedbackProtection !== false,
    output: isNumber(input.output) ? clamp(Math.round(input.output), 1, 4) : defaults.output,
  };
}

/** Estado devolvido pelo motor, com os mesmos campos + peak/feedback. */
export function normalizeAudioInputState(value: unknown): AudioInputState {
  const settings = normalizeAudioInput(value);
  const input = (value ?? {}) as Partial<AudioInputState>;
  return {
    ...settings,
    // `enabled` do motor pode ser true mesmo sem o patch ter o strip.
    enabled: input.enabled === true,
    peakDb: isNumber(input.peakDb) ? input.peakDb : -100,
    pitchHz: isNumber(input.pitchHz) ? input.pitchHz : 0,
    feedback: input.feedback === true,
  };
}
