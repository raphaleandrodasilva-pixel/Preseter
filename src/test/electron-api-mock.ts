import { vi } from 'vitest';
import type { ElectronAPI } from '@renderer/types/electron-api';
import {
  createAudioSettingsSnapshot,
  createConcertState,
  createEngineMixState,
  createPreferences,
} from './fixtures';

type Listener = (payload?: unknown) => void;

export interface ElectronApiMock extends ElectronAPI {
  emit: (event: string, payload?: unknown) => void;
}

const EVENT_METHODS = [
  'onMidiProgramChange',
  'onMidiControlChange',
  'onNoteOn',
  'onNoteOff',
  'onAppStatusChange',
  'onPresetList',
  'onPresetLoaded',
  'onLayoutChange',
  'onVstScanned',
  'onVstPresetsUpdated',
  'onPluginLoaded',
  'onPluginUnloaded',
  'onParameterChanged',
  'onEngineCrashed',
  'onEngineRecovered',
  'onMenuAction',
] as const;

/**
 * Full Electron preload API double. Event subscriptions are captured so tests
 * can emit main-process messages without a real Electron runtime.
 */
export function createElectronApiMock(): ElectronApiMock {
  const listeners = new Map<string, Set<Listener>>();
  const on = (event: string) => (callback: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(callback);
    listeners.set(event, set);
  };

  const api: Record<string, unknown> = {
    getAppVersion: vi.fn(async () => '1.0.0-test'),
    midiProgramChange: vi.fn(async () => ({ success: true })),
    midiInputProgramChange: vi.fn(async () => true),

    vstScan: vi.fn(async () => []),
    vstAddPluginFolder: vi.fn(async () => ({ canceled: true, plugins: [] })),
    vstRemovePluginFolder: vi.fn(async () => ({ folders: [], plugins: [] })),
    vstLoad: vi.fn(async () => ({
      id: 'loaded-plugin',
      name: 'Loaded',
      path: 'C:/plugins/loaded.vst3',
      isLoaded: true,
      isInstrument: true,
      parameters: [],
    })),
    vstUnload: vi.fn(async () => true),
    vstSetParam: vi.fn(async () => true),
    vstGetState: vi.fn(async () => null),
    vstSetState: vi.fn(async () => true),
    vstOpenEditor: vi.fn(async () => true),
    vstCloseEditor: vi.fn(async () => true),
    vstList: vi.fn(async () => []),
    vstLoaded: vi.fn(async () => []),
    vstPresetsList: vi.fn(async () => ({ presets: [], scannedAt: null })),
    vstPresetsRescan: vi.fn(async () => ({ presets: [], scannedAt: null })),
    vstPresetApply: vi.fn(async () => true),
    vstPresetSaveSnapshot: vi.fn(async () => null),
    vstPresetUpdate: vi.fn(async () => null),
    vstPresetDelete: vi.fn(async () => true),
    engineMidi: vi.fn(async () => true),
    enginePanic: vi.fn(async () => true),
    vstSetLayerRange: vi.fn(async () => ({
      id: 'loaded-plugin',
      name: 'Loaded',
      path: 'C:/plugins/loaded.vst3',
      isLoaded: true,
      isInstrument: true,
      parameters: [],
    })),
    vstSetLayerVelocity: vi.fn(async () => ({
      id: 'loaded-plugin',
      name: 'Loaded',
      path: 'C:/plugins/loaded.vst3',
      isLoaded: true,
      isInstrument: true,
      parameters: [],
    })),
    audioInputSet: vi.fn(async () => ({
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
    })),
    audioInputState: vi.fn(async () => ({
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
    })),
    midiThruSet: vi.fn(async () => true),
    hostClockSet: vi.fn(async () => true),
    metronomeSet: vi.fn(async () => true),
    recordStart: vi.fn(async () => null),
    recordStop: vi.fn(async () => true),
    playbackLoad: vi.fn(async () => null),
    playbackPlay: vi.fn(async () => ({
      loaded: false,
      playing: false,
      position: 0,
      duration: 0,
      path: null,
    })),
    playbackStop: vi.fn(async () => ({
      loaded: false,
      playing: false,
      position: 0,
      duration: 0,
      path: null,
    })),
    playbackState: vi.fn(async () => ({
      loaded: false,
      playing: false,
      position: 0,
      duration: 0,
      path: null,
    })),
    panLawSet: vi.fn(async () => true),
    vstMixGet: vi.fn(async () => createEngineMixState()),
    vstSetLayerMix: vi.fn(async () => createEngineMixState()),
    vstSetMasterMix: vi.fn(async () => createEngineMixState()),
    vstInsertSet: vi.fn(async () => ({ slot: 0, plugin: null, bypass: false })),
    vstInsertRemove: vi.fn(async () => ({ slot: 0, plugin: null, bypass: false })),
    vstInsertBypass: vi.fn(async () => ({ slot: 0, plugin: null, bypass: false })),
    vstInserts: vi.fn(async () => []),
    vstInsertStateGet: vi.fn(async () => null),
    vstInsertStateSet: vi.fn(async () => true),
    vstInsertOpenEditor: vi.fn(async () => true),
    vstInsertCloseEditor: vi.fn(async () => true),
    vstBuses: vi.fn(async () => []),
    vstSetBusMix: vi.fn(async () => []),
    vstSetSend: vi.fn(async () => createEngineMixState()),
    vstSetLayerOutput: vi.fn(async () => createEngineMixState()),
    audioSettingsGet: vi.fn(async () => createAudioSettingsSnapshot()),
    preferencesGet: vi.fn(async () => createPreferences()),
    preferencesSet: vi.fn(async () => createPreferences()),
    windowSetFullscreen: vi.fn(async () => true),
    audioStart: vi.fn(async () => ({
      devices: createAudioSettingsSnapshot().devices,
      settings: createAudioSettingsSnapshot().settings,
    })),
    audioStop: vi.fn(async () => ({
      devices: createAudioSettingsSnapshot().devices,
      settings: createAudioSettingsSnapshot().settings,
    })),
    openPluginDialog: vi.fn(async () => null),

    presetSave: vi.fn(async () => true),
    presetLoad: vi.fn(async () => true),
    presetList: vi.fn(async () => []),
    presetDelete: vi.fn(async () => true),
    patchExport: vi.fn(async () => true),
    patchImport: vi.fn(async () => null),
    setExport: vi.fn(async () => true),
    setImport: vi.fn(async () => null),
    presetFindByProgram: vi.fn(async () => null),

    concertInit: vi.fn(async () => createConcertState()),
    concertGet: vi.fn(async () => createConcertState()),
    concertNew: vi.fn(async () => createConcertState()),
    concertTemplates: vi.fn(async () => []),
    concertOpen: vi.fn(async () => null),
    concertOpenRecent: vi.fn(async () => createConcertState()),
    concertSave: vi.fn(async () => createConcertState()),
    concertSync: vi.fn(async () => ({ dirty: true })),
    concertStripsRealign: vi.fn(async () => true),
    concertRecent: vi.fn(async () => []),

    layoutChange: vi.fn(async () => true),
    uiElementAdd: vi.fn(async () => null),
    uiElementUpdate: vi.fn(async () => null),
    uiElementRemove: vi.fn(async () => null),

    appStatusChange: vi.fn(async () => null),
    appStatusGet: vi.fn(async () => null),
  };

  for (const method of EVENT_METHODS) {
    api[method] = vi.fn(on(method));
  }

  api.emit = (event: string, payload?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };

  return api as unknown as ElectronApiMock;
}

export function createMidiAccessMock(): MIDIAccess {
  const access = {
    inputs: new Map(),
    outputs: new Map(),
    sysexEnabled: false,
    onstatechange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  return access as unknown as MIDIAccess;
}
