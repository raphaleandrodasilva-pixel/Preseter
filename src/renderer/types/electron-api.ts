import type {
  AudioDeviceSnapshot,
  AudioSettingsSnapshot,
  AudioStartOptions,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  SavedAudioSettings,
  VstPluginInfo,
} from '@shared/types';

export interface ElectronAPI {
  // App Info
  getAppVersion: () => Promise<string>;

  // MIDI
  midiProgramChange: (program: number, channel: number) => Promise<any>;
  midiInputProgramChange: (program: number, channel: number) => Promise<boolean>;

  // MIDI Events
  onMidiProgramChange: (callback: (data: any) => void) => void;
  onMidiControlChange: (callback: (data: any) => void) => void;
  onNoteOn: (callback: (data: any) => void) => void;
  onNoteOff: (callback: (data: any) => void) => void;

  // VST
  vstScan: () => Promise<VstPluginInfo[]>;
  vstLoad: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number) => Promise<VstPluginInfo>;
  vstUnload: (pluginId: string) => Promise<boolean>;
  vstSetParam: (pluginId: string, paramId: string, value: number) => Promise<boolean>;
  vstGetState: (pluginId: string) => Promise<any>;
  vstSetState: (pluginId: string, state: any) => Promise<boolean>;
  vstOpenEditor: (pluginId: string) => Promise<boolean>;
  vstCloseEditor: (pluginId: string) => Promise<boolean>;
  vstList: () => Promise<any[]>;
  vstLoaded: () => Promise<any[]>;
  engineMidi: (bytes: number[]) => Promise<boolean>;
  vstSetLayerRange: (layerId: string, minNote: number, maxNote: number) => Promise<VstPluginInfo>;
  vstMixGet: () => Promise<EngineMixState>;
  vstSetLayerMix: (layerId: string, update: LayerMixUpdate) => Promise<EngineMixState>;
  vstSetMasterMix: (update: MasterMixUpdate) => Promise<EngineMixState>;
  audioSettingsGet: () => Promise<AudioSettingsSnapshot>;
  audioStart: (options: AudioStartOptions) => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  audioStop: () => Promise<{ devices: AudioDeviceSnapshot; settings: SavedAudioSettings }>;
  openPluginDialog: () => Promise<any>;

  // Preset
  presetSave: (preset: any) => Promise<boolean>;
  presetLoad: (presetId: string) => Promise<boolean>;
  presetList: () => Promise<any[]>;
  presetDelete: (presetId: string) => Promise<boolean>;
  presetFindByProgram: (programNumber: number) => Promise<any>;

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
