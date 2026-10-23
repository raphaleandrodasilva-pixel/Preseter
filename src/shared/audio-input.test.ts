import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_INPUT_CHANNELS,
  defaultAudioInput,
  normalizeAudioInput,
  normalizeAudioInputState,
} from './audio-input';

describe('defaultAudioInput', () => {
  it('returns the MainStage-like default strip', () => {
    expect(defaultAudioInput()).toEqual({
      enabled: true,
      inputChannel: 0,
      mode: 'mono',
      volumeDb: 0,
      pan: 0,
      muted: false,
      feedbackProtection: true,
      output: 1,
    });
  });

  it('returns a fresh object', () => {
    expect(defaultAudioInput()).not.toBe(defaultAudioInput());
  });
});

describe('normalizeAudioInput', () => {
  it('returns a disabled default for non-objects', () => {
    expect(normalizeAudioInput(null)).toMatchObject({ enabled: false, inputChannel: 0, mode: 'mono' });
    expect(normalizeAudioInput('bad')).toMatchObject({ enabled: false });
  });

  it('normalizes valid values and clamps ranges', () => {
    expect(
      normalizeAudioInput({
        enabled: true,
        inputChannel: 99,
        mode: 'stereo',
        volumeDb: 50,
        pan: -4,
        muted: true,
        feedbackProtection: false,
        output: 0,
      })
    ).toEqual({
      enabled: true,
      inputChannel: MAX_AUDIO_INPUT_CHANNELS - 1,
      mode: 'stereo',
      volumeDb: 6,
      pan: -1,
      muted: true,
      feedbackProtection: false,
      output: 1,
    });
  });

  it('uses defaults for missing and invalid fields', () => {
    expect(
      normalizeAudioInput({
        enabled: 'yes',
        inputChannel: Number.NaN,
        mode: 'bad',
        volumeDb: Number.POSITIVE_INFINITY,
        pan: undefined,
        feedbackProtection: undefined,
        output: 9,
      })
    ).toEqual({
      enabled: false,
      inputChannel: 0,
      mode: 'mono',
      volumeDb: 0,
      pan: 0,
      muted: false,
      feedbackProtection: true,
      output: 4,
    });
  });
});

describe('normalizeAudioInputState', () => {
  it('adds engine state fields with safe defaults', () => {
    expect(normalizeAudioInputState({})).toEqual({
      enabled: false,
      inputChannel: 0,
      mode: 'mono',
      volumeDb: 0,
      pan: 0,
      muted: false,
      feedbackProtection: true,
      output: 1,
      peakDb: -100,
      pitchHz: 0,
      feedback: false,
    });
  });

  it('preserves valid engine fields and reports enabled from the engine', () => {
    expect(
      normalizeAudioInputState({
        enabled: true,
        inputChannel: 2,
        mode: 'stereo',
        volumeDb: -12,
        pan: 0.5,
        muted: true,
        feedbackProtection: false,
        output: 2,
        peakDb: -6,
        pitchHz: 440,
        feedback: true,
      })
    ).toMatchObject({
      enabled: true,
      inputChannel: 2,
      mode: 'stereo',
      volumeDb: -12,
      pan: 0.5,
      muted: true,
      feedbackProtection: false,
      output: 2,
      peakDb: -6,
      pitchHz: 440,
      feedback: true,
    });
  });

  it('rejects invalid peak, pitch and feedback values', () => {
    const state = normalizeAudioInputState({ peakDb: 'loud', pitchHz: Number.NaN, feedback: 'yes' });
    expect(state.peakDb).toBe(-100);
    expect(state.pitchHz).toBe(0);
    expect(state.feedback).toBe(false);
  });
});
