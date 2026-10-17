const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - expõe APIs seguras para o renderer
 * usando contextIsolation
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // === App Info ===
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // === MIDI ===
  midiProgramChange: (program: number, channel: number) =>
    ipcRenderer.invoke('midi-program-change', program, channel),
  midiInputProgramChange: (program: number, channel: number) =>
    ipcRenderer.invoke('midi-input-program-change', program, channel),

  // === MIDI Events (recebidos) ===
  onMidiProgramChange: (callback: (data: any) => void) =>
    ipcRenderer.on('midi-program-change', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
  onMidiControlChange: (callback: (data: any) => void) =>
    ipcRenderer.on('midi-control-change', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
  onNoteOn: (callback: (data: any) => void) =>
    ipcRenderer.on('midi-note-on', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
  onNoteOff: (callback: (data: any) => void) =>
    ipcRenderer.on('midi-note-off', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),

  // === VST ===
  vstScan: () => ipcRenderer.invoke('vst-scan'),
  vstLoad: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number) =>
    ipcRenderer.invoke('vst-load', pluginPath, layerId, minNote, maxNote),
  vstUnload: (pluginId: string) => ipcRenderer.invoke('vst-unload', pluginId),
  vstSetParam: (pluginId: string, paramId: string, value: number) =>
    ipcRenderer.invoke('vst-set-param', pluginId, paramId, value),
  vstGetState: (pluginId: string) => ipcRenderer.invoke('vst-get-state', pluginId),
  vstSetState: (pluginId: string, state: any) =>
    ipcRenderer.invoke('vst-set-state', pluginId, state),
  vstOpenEditor: (pluginId: string) => ipcRenderer.invoke('vst-open-editor', pluginId),
  vstCloseEditor: (pluginId: string) => ipcRenderer.invoke('vst-close-editor', pluginId),
  vstList: () => ipcRenderer.invoke('vst-list'),
  vstLoaded: () => ipcRenderer.invoke('vst-loaded'),
  engineMidi: (bytes: number[]) => ipcRenderer.invoke('engine-midi', bytes),
  enginePanic: () => ipcRenderer.invoke('engine-panic'),
  vstSetLayerRange: (layerId: string, minNote: number, maxNote: number) =>
    ipcRenderer.invoke('vst-set-layer-range', layerId, minNote, maxNote),
  vstMixGet: () => ipcRenderer.invoke('vst-mix-get'),
  vstSetLayerMix: (layerId: string, update: unknown) =>
    ipcRenderer.invoke('vst-set-layer-mix', layerId, update),
  vstSetMasterMix: (update: unknown) => ipcRenderer.invoke('vst-set-master-mix', update),
  audioSettingsGet: () => ipcRenderer.invoke('audio-settings-get'),
  audioStart: (options: unknown) => ipcRenderer.invoke('audio-start', options),
  audioStop: () => ipcRenderer.invoke('audio-stop'),
  openPluginDialog: () => ipcRenderer.invoke('open-plugin-dialog'),

  // === Preset ===
  presetSave: (preset: any) => ipcRenderer.invoke('preset-save', preset),
  presetLoad: (presetId: string) => ipcRenderer.invoke('preset-load', presetId),
  presetList: () => ipcRenderer.invoke('preset-list'),
  presetDelete: (presetId: string) => ipcRenderer.invoke('preset-delete', presetId),
  presetFindByProgram: (programNumber: number) =>
    ipcRenderer.invoke('preset-by-program', programNumber),

  // === Layout ===
  layoutChange: (layout: any) => ipcRenderer.invoke('layout-change', layout),
  uiElementAdd: (element: any) => ipcRenderer.invoke('ui-element-add', element),
  uiElementUpdate: (element: any) => ipcRenderer.invoke('ui-element-update', element),
  uiElementRemove: (id: string) => ipcRenderer.invoke('ui-element-remove', id),

  // === App Status ===
  appStatusChange: (status: any) => ipcRenderer.invoke('app-status-change', status),
  appStatusGet: () => ipcRenderer.invoke('app-status-get'),

  // === Events from main ===
  onAppStatusChange: (callback: (status: any) => void) =>
    ipcRenderer.on('app-status-change', (_event: Electron.IpcRendererEvent, status: unknown) => callback(status as any)),
  onPresetList: (callback: (presets: any[]) => void) =>
    ipcRenderer.on('preset-list', (_event: Electron.IpcRendererEvent, presets: unknown) => callback(presets as any[])),
  onPresetLoaded: (callback: (data: any) => void) =>
    ipcRenderer.on('preset-loaded', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
  onLayoutChange: (callback: (layout: any) => void) =>
    ipcRenderer.on('layout-change', (_event: Electron.IpcRendererEvent, layout: unknown) => callback(layout as any)),
  onVstScanned: (callback: (plugins: any[]) => void) =>
    ipcRenderer.on('vst-scanned', (_event: Electron.IpcRendererEvent, plugins: unknown) => callback(plugins as any[])),
  onPluginLoaded: (callback: (plugin: any) => void) =>
    ipcRenderer.on('plugin-loaded', (_event: Electron.IpcRendererEvent, plugin: unknown) => callback(plugin as any)),
  onPluginUnloaded: (callback: (pluginId: string) => void) =>
    ipcRenderer.on('plugin-unloaded', (_event: Electron.IpcRendererEvent, pluginId: unknown) => callback(String(pluginId))),
  onParameterChanged: (callback: (data: any) => void) =>
    ipcRenderer.on('parameter-changed', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
});
