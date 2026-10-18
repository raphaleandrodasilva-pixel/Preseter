import type {
  AudioDeviceSnapshot,
  AudioInputSettings,
  AudioInputState,
  AudioSettingsSnapshot,
  AudioStartOptions,
  AppPreferences,
  BusMixUpdate,
  ConcertState,
  ConcertSyncPayload,
  ConcertTemplateSummary,
  EngineBusState,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  MenuAction,
  MidiThruBlock,
  PlaybackState,
  Preset,
  PresetSet,
  RecentConcert,
  SavedAudioSettings,
  VstPluginInfo,
} from '@shared/types';
import type { EngineInsertState } from '@shared/engine-protocol';

export interface ElectronAPI {
  // App Info
  getAppVersion: () => Promise<string>;

  // MIDI
  midiProgramChange: (program: number, channel: number) => Promise<any>;
  midiInputProgramChange: (program: number, channel: number, bank?: number, deviceName?: string) => Promise<boolean>;

  // MIDI Events
  onMidiProgramChange: (callback: (data: any) => void) => void;
  onMidiControlChange: (callback: (data: any) => void) => void;
  onNoteOn: (callback: (data: any) => void) => void;
  onNoteOff: (callback: (data: any) => void) => void;

  // VST
  vstScan: () => Promise<VstPluginInfo[]>;
  vstLoad: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number, pinned?: boolean) => Promise<VstPluginInfo>;
  vstUnload: (pluginId: string) => Promise<boolean>;
  vstSetParam: (pluginId: string, paramId: string, value: number) => Promise<boolean>;
  vstGetState: (pluginId: string) => Promise<any>;
  vstSetState: (pluginId: string, state: any) => Promise<boolean>;
  vstOpenEditor: (pluginId: string) => Promise<boolean>;
  vstCloseEditor: (pluginId: string) => Promise<boolean>;
  vstList: () => Promise<any[]>;
  vstLoaded: () => Promise<any[]>;
  engineMidi: (bytes: number[]) => Promise<boolean>;
  enginePanic: () => Promise<boolean>;
  vstSetLayerRange: (layerId: string, minNote: number, maxNote: number) => Promise<VstPluginInfo>;
  vstSetLayerVelocity: (layerId: string, minVelocity: number, maxVelocity: number) => Promise<VstPluginInfo>;
  audioInputSet: (settings: Partial<AudioInputSettings> & { resetFeedback?: boolean }) => Promise<AudioInputState>;
  audioInputState: () => Promise<AudioInputState>;
  midiThruSet: (blocked: MidiThruBlock[]) => Promise<boolean>;
  hostClockSet: (bpm: number, numerator: number, denominator: number, playing: boolean) => Promise<boolean>;
  metronomeSet: (enabled: boolean, volumeDb: number, accentFirstBeat: boolean) => Promise<boolean>;
  recordStart: () => Promise<string | null>;
  recordStop: () => Promise<boolean>;
  playbackLoad: () => Promise<PlaybackState | null>;
  playbackPlay: () => Promise<PlaybackState>;
  playbackStop: () => Promise<PlaybackState>;
  playbackState: () => Promise<PlaybackState>;
  vstMixGet: () => Promise<EngineMixState>;
  vstSetLayerMix: (layerId: string, update: LayerMixUpdate) => Promise<EngineMixState>;
  vstSetMasterMix: (update: MasterMixUpdate) => Promise<EngineMixState>;
  vstInsertSet: (layerId: string, slot: number, pluginPath: string, bypass?: boolean) => Promise<EngineInsertState>;
  vstInsertRemove: (layerId: string, slot: number) => Promise<EngineInsertState>;
  vstInsertBypass: (layerId: string, slot: number, bypass: boolean) => Promise<EngineInsertState>;
  vstInserts: (layerId: string) => Promise<EngineInsertState[]>;
  vstInsertStateGet: (layerId: string, slot: number) => Promise<{ data: string } | null>;
  vstInsertStateSet: (layerId: string, slot: number, data: string) => Promise<boolean>;
  vstInsertOpenEditor: (layerId: string, slot: number) => Promise<boolean>;
  vstInsertCloseEditor: (layerId: string, slot: number) => Promise<boolean>;
  vstBuses: () => Promise<EngineBusState[]>;
  vstSetBusMix: (bus: string, update: BusMixUpdate) => Promise<EngineBusState[]>;
  vstSetSend: (layerId: string, aux: number, levelDb: number) => Promise<EngineMixState>;
  vstSetLayerOutput: (layerId: string, output: number) => Promise<EngineMixState>;
  audioSettingsGet: () => Promise<AudioSettingsSnapshot>;
  preferencesGet: () => Promise<AppPreferences>;
  preferencesSet: (update: Partial<AppPreferences>) => Promise<AppPreferences>;
  windowSetFullscreen: (value: boolean) => Promise<boolean>;
  audioStart: (options: AudioStartOptions) => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  audioStop: () => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  openPluginDialog: () => Promise<any>;

  // Preset
  presetSave: (preset: any) => Promise<boolean>;
  presetLoad: (presetId: string) => Promise<boolean>;
  presetList: () => Promise<any[]>;
  presetDelete: (presetId: string) => Promise<boolean>;
  patchExport: (presetId: string) => Promise<boolean>;
  patchImport: () => Promise<Preset | null>;
  setExport: (setId: string) => Promise<boolean>;
  setImport: () => Promise<{ set: PresetSet; patches: Preset[] } | null>;
  presetFindByProgram: (programNumber: number) => Promise<any>;

  // Concert (Arquivo)
  concertInit: (legacy: { sets?: PresetSet[]; name?: string; tempo?: number }) => Promise<ConcertState>;
  concertGet: () => Promise<ConcertState>;
  concertNew: (templateId?: string) => Promise<ConcertState>;
  concertTemplates: () => Promise<ConcertTemplateSummary[]>;
  concertOpen: () => Promise<ConcertState | null>;
  concertOpenRecent: (filePath: string) => Promise<ConcertState>;
  concertSave: (asNew?: boolean) => Promise<ConcertState | null>;
  concertSync: (payload: ConcertSyncPayload) => Promise<{ dirty: boolean }>;
  /** Realinha no motor os channel strips do concert/set (após desfazer/refazer). */
  concertStripsRealign: () => Promise<boolean>;
  concertRecent: () => Promise<RecentConcert[]>;

  // Layout
  layoutChange: (layout: any) => Promise<boolean>;
  uiElementAdd: (element: any) => Promise<any>;
  uiElementUpdate: (element: any) => Promise<any>;
  uiElementRemove: (id: string) => Promise<any>;

  // App Status
  appStatusChange: (status: any) => Promise<any>;
  appStatusGet: () => Promise<any>;

  // Events
  onAppStatusChange: (callback: (status: any) => void) => void;
  onPresetList: (callback: (presets: any[]) => void) => void;
  onPresetLoaded: (callback: (data: any) => void) => void;
  onLayoutChange: (callback: (layout: any) => void) => void;
  onVstScanned: (callback: (plugins: any[]) => void) => void;
  onPluginLoaded: (callback: (plugin: any) => void) => void;
  onPluginUnloaded: (callback: (pluginId: string) => void) => void;
  onParameterChanged: (callback: (data: any) => void) => void;
  onEngineCrashed: (callback: (data: { message: string }) => void) => void;
  onEngineRecovered: (callback: (data: { presetId: string | null }) => void) => void;

  // Menu nativo (Arquivo)
  onMenuAction: (callback: (action: MenuAction) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
