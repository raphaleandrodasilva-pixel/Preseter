import type {
  AudioDeviceSnapshot,
  AudioInputSettings,
  AudioInputState,
  AudioPerformanceStatus,
  AudioSettingsSnapshot,
  AudioStartOptions,
  AppPlatform,
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
  RecordingResult,
  SavedAudioSettings,
  VstPluginInfo,
  VstPreset,
  VstPresetListResult,
  VstScanReport,
} from '@shared/types';
import type { EngineParameter } from '@shared/engine-protocol';
import type {
  CollectionDownloadResult,
  CollectionGenerateResult,
  CollectionItemStatus,
  CollectionProgress,
} from '@shared/collection';
import type { StoreSnapshot, StoreUpdateResult } from '@shared/store';
import type { ArpSettings, EngineArpState } from '@shared/types';
import type { EngineInsertState } from '@shared/engine-protocol';

export interface ElectronAPI {
  // App Info
  getAppVersion: () => Promise<string>;
  /** Sistema operacional detectado pelo processo principal. */
  platform: AppPlatform;

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
  vstRescan: () => Promise<VstPluginInfo[]>;
  vstScanReport: () => Promise<VstScanReport>;
  startupProgress: (percent: number, message?: string) => void;
  startupReady: () => void;
  vstHidePlugin: (idOrPath: string) => Promise<{ hiddenPluginIds: string[]; plugins: VstPluginInfo[] }>;
  vstShowPlugin: (idOrPath: string) => Promise<{ hiddenPluginIds: string[]; plugins: VstPluginInfo[] }>;
  vstAddPluginFolder: () => Promise<{ canceled: boolean; folder?: string; folders?: string[]; plugins: VstPluginInfo[] }>;
  vstRemovePluginFolder: (folder: string) => Promise<{ folders: string[]; plugins: VstPluginInfo[] }>;
  vstLoad: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number, pinned?: boolean) => Promise<VstPluginInfo>;
  vstUnload: (pluginId: string) => Promise<boolean>;
  vstSetParam: (pluginId: string, paramId: string, value: number, slot?: number) => Promise<boolean>;
  vstParams: (ownerId: string, slot?: number) => Promise<EngineParameter[]>;
  collectionStatus: () => Promise<CollectionItemStatus[]>;
  collectionDownload: (ids: string[], force?: boolean) => Promise<CollectionDownloadResult>;
  collectionCancel: () => Promise<boolean>;
  collectionOpenFolder: (kind?: 'sounds' | 'plugins') => Promise<boolean>;
  collectionOpenInstaller: (filePath: string) => Promise<boolean>;
  collectionGenerate: () => Promise<CollectionGenerateResult | null>;
  storeList: () => Promise<StoreSnapshot>;
  storeDownload: (ids: string[], force?: boolean) => Promise<CollectionDownloadResult>;
  storeCancel: () => Promise<boolean>;
  storeCheckUpdates: (force?: boolean) => Promise<StoreUpdateResult>;
  storeOpenFolder: (kind?: 'sounds' | 'plugins' | 'downloads') => Promise<boolean>;
  storeOpenInstaller: (filePath: string) => Promise<boolean>;
  storeOpenUrl: (url: string) => Promise<boolean>;
  storeGenerate: () => Promise<CollectionGenerateResult | null>;
  onStoreProgress: (callback: (progress: CollectionProgress) => void) => () => void;
  onStoreCatalogUpdated: (callback: (result: StoreUpdateResult) => void) => () => void;
  onCollectionProgress: (callback: (progress: CollectionProgress) => void) => () => void;
  vstGetState: (pluginId: string) => Promise<any>;
  vstSetState: (pluginId: string, state: any) => Promise<boolean>;
  vstOpenEditor: (pluginId: string) => Promise<boolean>;
  vstCloseEditor: (pluginId: string) => Promise<boolean>;
  vstList: () => Promise<any[]>;
  vstLoaded: () => Promise<any[]>;
  vstPresetsList: () => Promise<VstPresetListResult>;
  vstPresetsRescan: () => Promise<VstPresetListResult>;
  vstPresetApply: (presetId: string, layerId: string) => Promise<boolean>;
  vstPresetSaveSnapshot: (payload: { layerId: string; name: string; category?: string }) => Promise<VstPreset | null>;
  vstPresetUpdate: (presetId: string, patch: { category?: string; favorite?: boolean }) => Promise<VstPreset | null>;
  vstPresetDelete: (presetId: string) => Promise<boolean>;
  vstPresetExport: (payload: { layerId: string; name?: string }) => Promise<{
    canceled: boolean;
    path: string | null;
  }>;
  vstPresetImport: (payload: { layerId: string }) => Promise<{
    canceled: boolean;
    preset: VstPreset | null;
  }>;
  vstPresetsGenerateFxp: (payload: {
    layerId: string;
    mode: 'current' | 'all';
    name?: string;
    bank?: 'all' | 'A' | 'B' | 'C';
  }) => Promise<{ folder: string; files: string[]; count: number; canceled: boolean; warning?: string }>;
  vstPresetsGenerateFxpCancel: () => Promise<boolean>;
  onVstFxpProgress: (callback: (payload: {
    current: number;
    total: number;
    name: string;
  }) => void) => void;
  engineMidi: (bytes: number[]) => Promise<boolean>;
  enginePanic: () => Promise<boolean>;
  vstSetLayerRange: (layerId: string, minNote: number, maxNote: number) => Promise<VstPluginInfo>;
  vstSetLayerVelocity: (layerId: string, minVelocity: number, maxVelocity: number) => Promise<VstPluginInfo>;
  vstSetArp: (layerId: string, settings: ArpSettings) => Promise<EngineArpState>;
  audioInputSet: (settings: Partial<AudioInputSettings> & { resetFeedback?: boolean }) => Promise<AudioInputState>;
  audioInputState: () => Promise<AudioInputState>;
  midiThruSet: (blocked: MidiThruBlock[]) => Promise<boolean>;
  hostClockSet: (bpm: number, numerator: number, denominator: number, playing: boolean) => Promise<boolean>;
  metronomeSet: (enabled: boolean, volumeDb: number, accentFirstBeat: boolean) => Promise<boolean>;
  recordStart: () => Promise<RecordingResult>;
  recordStop: () => Promise<RecordingResult>;
  playbackLoad: () => Promise<PlaybackState | null>;
  playbackPlay: () => Promise<PlaybackState>;
  playbackStop: () => Promise<PlaybackState>;
  playbackState: () => Promise<PlaybackState>;
  panLawSet: (db: number, compensated: boolean) => Promise<boolean>;
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
  vstSetPatchSend: (aux: number, levelDb: number) => Promise<EngineMixState>;
  vstSetLayerPatchSend: (layerId: string, levelDb: number) => Promise<EngineMixState>;
  vstSetLayerOutput: (layerId: string, output: number) => Promise<EngineMixState>;
  audioSettingsGet: () => Promise<AudioSettingsSnapshot>;
  preferencesGet: () => Promise<AppPreferences>;
  preferencesSet: (update: Partial<AppPreferences>) => Promise<AppPreferences>;
  performanceModeGet: () => Promise<AudioPerformanceStatus>;
  performanceModeSet: (enabled: boolean) => Promise<AudioPerformanceStatus>;
  windowSetFullscreen: (value: boolean) => Promise<boolean>;
  audioStart: (options: AudioStartOptions) => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  audioStop: () => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  audioRestart: () => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  audioOpenLog: () => Promise<boolean>;
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
  onPresetLoadProgress: (callback: (progress: {
    presetId: string;
    current: number;
    total: number;
    name: string;
    phase: string;
  }) => void) => void;
  onVstPresetsUpdated: (callback: (result: VstPresetListResult) => void) => void;
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
