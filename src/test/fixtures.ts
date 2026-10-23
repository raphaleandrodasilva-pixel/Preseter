import type {
  AppPreferences,
  AudioDeviceSnapshot,
  AudioSettingsSnapshot,
  BusSettings,
  ConcertSettings,
  ConcertState,
  EngineMixState,
  Insert,
  LayoutConfig,
  Preset,
  PresetSet,
  SavedAudioSettings,
  UiElement,
  VstPluginInfo,
} from '@shared/types';

export function createInsert(overrides: Partial<Insert> = {}): Insert {
  return {
    slot: 0,
    pluginId: 'insert-plugin',
    name: 'Insert',
    path: 'C:/plugins/insert.vst3',
    bypass: false,
    ...overrides,
  };
}

export function createBus(overrides: Partial<BusSettings> = {}): BusSettings {
  return {
    volumeDb: 0,
    pan: 0,
    muted: false,
    output: 1,
    inserts: [],
    enabled: true,
    ...overrides,
  };
}

export function createConcertSettings(overrides: Partial<ConcertSettings> = {}): ConcertSettings {
  return {
    timeSignature: { numerator: 4, denominator: 4 },
    midi: {
      cc7ControlsVolume: true,
      cc10ControlsPan: true,
      sendUnassignedMidiToStrips: false,
      transpose: 0,
      programChange: { device: '', channel: null },
      sendUnusedProgramChangeToStrips: false,
    },
    channelStrips: { panLaw: -3, panLawCompensated: false },
    metronome: { enabled: false, volumeDb: -12, accentFirstBeat: true },
    buses: {
      aux: Array.from({ length: 4 }, (_, index) => createBus({ enabled: false, output: 1 })),
      outputs: Array.from({ length: 4 }, () => createBus()),
    },
    notes: '',
    ...overrides,
  };
}

export function createElement(overrides: Partial<UiElement> = {}): UiElement {
  return {
    id: 'element-1',
    type: 'knob',
    label: 'Knob',
    x: 0,
    y: 0,
    width: 96,
    height: 108,
    color: '#9A9AA0',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    ...overrides,
  };
}

export function createLayout(overrides: Partial<LayoutConfig> = {}): LayoutConfig {
  return {
    elements: [],
    background: null,
    tempo: 120,
    ...overrides,
  };
}

export function createPreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 'preset-1',
    name: 'Patch 1',
    programNumber: 0,
    midiChannel: 0,
    plugins: [],
    vstStates: {},
    layout: createLayout(),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function createSet(overrides: Partial<PresetSet> = {}): PresetSet {
  return {
    id: 'set-1',
    name: 'Set 1',
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function createConcertState(overrides: Partial<ConcertState> = {}): ConcertState {
  return {
    path: null,
    name: 'Meu Concert',
    tempo: 120,
    sets: [],
    patches: [],
    layout: createLayout(),
    dirty: false,
    settings: createConcertSettings(),
    strips: [],
    mappings: [],
    lastPatchId: null,
    ...overrides,
  };
}

export function createPluginInfo(overrides: Partial<VstPluginInfo> = {}): VstPluginInfo {
  return {
    id: 'plugin-1',
    layerId: 'layer-1',
    name: 'Test Plugin',
    path: 'C:/plugins/test.vst3',
    isLoaded: true,
    isInstrument: true,
    parameters: [],
    minNote: 0,
    maxNote: 127,
    ...overrides,
  };
}

export function createEngineMixState(overrides: Partial<EngineMixState> = {}): EngineMixState {
  return {
    layers: [],
    aux: [],
    outputs: [],
    master: { volumeDb: 0, muted: false, peakDb: -100 },
    ...overrides,
  };
}

export function createAudioDeviceSnapshot(
  overrides: Partial<AudioDeviceSnapshot> = {}
): AudioDeviceSnapshot {
  return {
    running: false,
    asioSupported: false,
    asioDriverAvailable: false,
    current: null,
    audioTypes: [],
    midiInputs: [],
    ...overrides,
  };
}

export function createSavedAudioSettings(
  overrides: Partial<SavedAudioSettings> = {}
): SavedAudioSettings {
  return {
    enabled: false,
    inputs: 0,
    outputs: 2,
    midi: true,
    ...overrides,
  };
}

export function createAudioSettingsSnapshot(
  overrides: Partial<AudioSettingsSnapshot> = {}
): AudioSettingsSnapshot {
  return {
    devices: createAudioDeviceSnapshot(),
    settings: createSavedAudioSettings(),
    ...overrides,
  };
}

export function createPreferences(overrides: Partial<AppPreferences> = {}): AppPreferences {
  return {
    silencePreviousPatch: false,
    pluginFolders: [],
    scrollSpeed: 'slow',
    ...overrides,
  };
}
