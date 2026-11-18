import type { AudioDeviceSnapshot, AudioStartOptions, SavedAudioSettings } from '../shared/types';

export function normalizeAudioSettings(saved: Partial<SavedAudioSettings> = {}): SavedAudioSettings {
  const settings: SavedAudioSettings = {
    inputs: 0,
    outputs: 2,
    midi: true,
    useDefaultChannels: true,
    ...saved,
    enabled: saved.enabled === true,
  };
  const type = settings.type?.toLowerCase();
  return {
    ...settings,
    ...(settings.followDevice === undefined && type?.includes('asio') ? { followDevice: true } : {}),
    ...(type?.includes('asio') ? { useDefaultChannels: true } : {}),
    ...(type === 'windows audio' ? { type: 'Windows Audio (Low Latency Mode)' } : {}),
  };
}

export function audioOptionsMatch(
  snapshot: AudioDeviceSnapshot,
  options: AudioStartOptions
): boolean {
  const current = snapshot.current;
  if (!snapshot.running || !current) return false;
  if (options.useDefaultChannels !== true) {
    if (current.inputChannels !== (options.inputs ?? 0)) return false;
    if (current.outputChannels !== (options.outputs ?? 2)) return false;
  }

  const requestedType = options.type?.trim();
  if (requestedType && current.type.toLowerCase() !== requestedType.toLowerCase()) return false;

  const output = options.output?.trim();
  if (output && current.name.toLowerCase() !== output.toLowerCase()) return false;

  const input = options.input?.trim();
  if (input && current.type.toLowerCase().includes('asio')
    && current.name.toLowerCase() !== input.toLowerCase()) return false;

  if (!options.followDevice) {
    if (options.sampleRate && Math.abs(current.sampleRate - options.sampleRate) >= 0.5) return false;
    if (options.bufferSize && current.bufferSize !== options.bufferSize) return false;
  }
  return true;
}

export function resolveAudioSettings(
  options: AudioStartOptions,
  devices: AudioDeviceSnapshot
): { settings: SavedAudioSettings; fellBack: boolean } {
  const settings: SavedAudioSettings = { ...options, enabled: true };
  const current = devices.current;
  const requestedType = options.type?.trim();
  const requestedOutput = options.output?.trim();
  const requestedInput = options.input?.trim();
  const isAsio = current?.type.toLowerCase().includes('asio') === true;
  const requestedDeviceChanged = !!current && (
    (!!requestedOutput && current.name.toLowerCase() !== requestedOutput.toLowerCase())
    || (isAsio && !!requestedInput
      && current.name.toLowerCase() !== requestedInput.toLowerCase())
  );
  const fellBack = !!current && (
    (!!requestedType && current.type.toLowerCase() !== requestedType.toLowerCase())
    || requestedDeviceChanged
  );

  if (!fellBack || !current) return { settings, fellBack: false };

  return {
    fellBack: true,
    settings: {
      ...settings,
      type: current.type,
      input: isAsio ? current.name : undefined,
      output: current.name,
      inputs: current.inputChannels,
      outputs: current.outputChannels,
      sampleRate: current.sampleRate,
      bufferSize: current.bufferSize,
      followDevice: true,
      useDefaultChannels: true,
    },
  };
}
