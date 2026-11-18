import { describe, expect, it } from 'vitest';
import type { AudioDeviceSnapshot, AudioStartOptions } from '../shared/types';
import { audioOptionsMatch, normalizeAudioSettings, resolveAudioSettings } from './audio-config';

function snapshot(current: NonNullable<AudioDeviceSnapshot['current']>): AudioDeviceSnapshot {
  return {
    running: true,
    asioSupported: true,
    asioDriverAvailable: true,
    current,
    audioTypes: [],
    midiInputs: [],
  };
}

const asioDevice: NonNullable<AudioDeviceSnapshot['current']> = {
  type: 'ASIO',
  name: 'ASIO4ALL v2',
  sampleRate: 44100,
  bufferSize: 512,
  inputChannels: 2,
  outputChannels: 2,
  outputLatencyMs: 12,
};

describe('audio configuration matching', () => {
  it('defaults legacy ASIO settings to following the device but preserves explicit choices', () => {
    expect(normalizeAudioSettings({ type: 'ASIO', sampleRate: 44100, bufferSize: 512 }))
      .toMatchObject({ followDevice: true, sampleRate: 44100, bufferSize: 512 });
    expect(normalizeAudioSettings({ type: 'ASIO', followDevice: false }).followDevice).toBe(false);
    expect(normalizeAudioSettings({ type: 'Windows Audio' }).followDevice).toBeUndefined();
  });

  it('accepts driver-default channels even when the stored count differs', () => {
    const options: AudioStartOptions = {
      type: 'ASIO',
      inputs: 0,
      outputs: 2,
      useDefaultChannels: true,
      sampleRate: 44100,
      bufferSize: 512,
    };

    expect(audioOptionsMatch(snapshot(asioDevice), options)).toBe(true);
  });

  it('does not require stored rate and buffer when following the device', () => {
    const options: AudioStartOptions = {
      type: 'ASIO',
      inputs: 2,
      outputs: 2,
      useDefaultChannels: true,
      sampleRate: 44100,
      bufferSize: 512,
      followDevice: true,
    };

    expect(audioOptionsMatch(snapshot({
      ...asioDevice,
      sampleRate: 48000,
      bufferSize: 256,
    }), options)).toBe(true);
  });

  it('keeps explicit channel counts part of the device match', () => {
    const options: AudioStartOptions = {
      type: 'ASIO',
      inputs: 0,
      outputs: 2,
      useDefaultChannels: false,
      sampleRate: 44100,
      bufferSize: 512,
    };

    expect(audioOptionsMatch(snapshot(asioDevice), options)).toBe(false);
  });

  it('adopts the active fallback device and its actual configuration', () => {
    const fallback = snapshot({
      ...asioDevice,
      type: 'Windows Audio (Low Latency Mode)',
      name: 'Speakers (Realtek)',
      sampleRate: 48000,
      bufferSize: 1024,
    });
    const options: AudioStartOptions = {
      type: 'ASIO',
      input: 'ASIO4ALL v2',
      output: 'ASIO4ALL v2',
      inputs: 0,
      outputs: 2,
      sampleRate: 44100,
      bufferSize: 512,
    };

    const resolved = resolveAudioSettings(options, fallback);

    expect(resolved.fellBack).toBe(true);
    expect(resolved.settings).toMatchObject({
      enabled: true,
      type: 'Windows Audio (Low Latency Mode)',
      output: 'Speakers (Realtek)',
      inputs: 2,
      outputs: 2,
      sampleRate: 48000,
      bufferSize: 1024,
      followDevice: true,
      useDefaultChannels: true,
    });
    expect(resolved.settings.input).toBeUndefined();
    expect(audioOptionsMatch(fallback, resolved.settings)).toBe(true);
  });
});
