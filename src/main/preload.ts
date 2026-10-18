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
  midiInputProgramChange: (program: number, channel: number, bank?: number, deviceName?: string) =>
    ipcRenderer.invoke('midi-input-program-change', program, channel, bank, deviceName),

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
  vstLoad: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number, pinned?: boolean) =>
    ipcRenderer.invoke('vst-load', pluginPath, layerId, minNote, maxNote, pinned),
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
  vstPresetsList: () => ipcRenderer.invoke('vst-presets-list'),
  vstPresetsRescan: () => ipcRenderer.invoke('vst-presets-rescan'),
  vstPresetApply: (presetId: string, layerId: string) =>
    ipcRenderer.invoke('vst-presets-apply', presetId, layerId),
  vstPresetSaveSnapshot: (payload: { layerId: string; name: string; category?: string }) =>
    ipcRenderer.invoke('vst-presets-snapshot', payload),
  vstPresetUpdate: (presetId: string, patch: { category?: string; favorite?: boolean }) =>
    ipcRenderer.invoke('vst-presets-update', presetId, patch),
  vstPresetDelete: (presetId: string) => ipcRenderer.invoke('vst-presets-delete', presetId),
  engineMidi: (bytes: number[]) => ipcRenderer.invoke('engine-midi', bytes),
  enginePanic: () => ipcRenderer.invoke('engine-panic'),
  vstSetLayerRange: (layerId: string, minNote: number, maxNote: number) =>
    ipcRenderer.invoke('vst-set-layer-range', layerId, minNote, maxNote),
  vstSetLayerVelocity: (layerId: string, minVelocity: number, maxVelocity: number) =>
    ipcRenderer.invoke('vst-set-layer-velocity', layerId, minVelocity, maxVelocity),
  audioInputSet: (settings: unknown) => ipcRenderer.invoke('audio-input-set', settings),
  audioInputState: () => ipcRenderer.invoke('audio-input-state'),
  midiThruSet: (blocked: unknown) => ipcRenderer.invoke('midi-thru-set', blocked),
  hostClockSet: (bpm: number, numerator: number, denominator: number, playing: boolean) =>
    ipcRenderer.invoke('host-clock-set', bpm, numerator, denominator, playing),
  metronomeSet: (enabled: boolean, volumeDb: number, accentFirstBeat: boolean) =>
    ipcRenderer.invoke('metronome-set', enabled, volumeDb, accentFirstBeat),
  recordStart: () => ipcRenderer.invoke('record-start'),
  recordStop: () => ipcRenderer.invoke('record-stop'),
  playbackLoad: () => ipcRenderer.invoke('playback-load'),
  playbackPlay: () => ipcRenderer.invoke('playback-play'),
  playbackStop: () => ipcRenderer.invoke('playback-stop'),
  playbackState: () => ipcRenderer.invoke('playback-state'),
  panLawSet: (db: number, compensated: boolean) => ipcRenderer.invoke('pan-law-set', db, compensated),
  vstMixGet: () => ipcRenderer.invoke('vst-mix-get'),
  vstSetLayerMix: (layerId: string, update: unknown) =>
    ipcRenderer.invoke('vst-set-layer-mix', layerId, update),
  vstSetMasterMix: (update: unknown) => ipcRenderer.invoke('vst-set-master-mix', update),
  vstInsertSet: (layerId: string, slot: number, pluginPath: string, bypass?: boolean) =>
    ipcRenderer.invoke('vst-insert-set', layerId, slot, pluginPath, bypass),
  vstInsertRemove: (layerId: string, slot: number) =>
    ipcRenderer.invoke('vst-insert-remove', layerId, slot),
  vstInsertBypass: (layerId: string, slot: number, bypass: boolean) =>
    ipcRenderer.invoke('vst-insert-bypass', layerId, slot, bypass),
  vstInserts: (layerId: string) => ipcRenderer.invoke('vst-inserts', layerId),
  vstInsertStateGet: (layerId: string, slot: number) =>
    ipcRenderer.invoke('vst-insert-state-get', layerId, slot),
  vstInsertStateSet: (layerId: string, slot: number, data: string) =>
    ipcRenderer.invoke('vst-insert-state-set', layerId, slot, data),
  vstInsertOpenEditor: (layerId: string, slot: number) =>
    ipcRenderer.invoke('vst-insert-open-editor', layerId, slot),
  vstInsertCloseEditor: (layerId: string, slot: number) =>
    ipcRenderer.invoke('vst-insert-close-editor', layerId, slot),
  vstBuses: () => ipcRenderer.invoke('vst-buses'),
  vstSetBusMix: (bus: string, update: unknown) => ipcRenderer.invoke('vst-set-bus-mix', bus, update),
  vstSetSend: (layerId: string, aux: number, levelDb: number) =>
    ipcRenderer.invoke('vst-set-send', layerId, aux, levelDb),
  vstSetLayerOutput: (layerId: string, output: number) =>
    ipcRenderer.invoke('vst-set-layer-output', layerId, output),
  audioSettingsGet: () => ipcRenderer.invoke('audio-settings-get'),
  preferencesGet: () => ipcRenderer.invoke('preferences-get'),
  preferencesSet: (update: unknown) => ipcRenderer.invoke('preferences-set', update),
  windowSetFullscreen: (value: boolean) => ipcRenderer.invoke('window-set-fullscreen', value),
  audioStart: (options: unknown) => ipcRenderer.invoke('audio-start', options),
  audioStop: () => ipcRenderer.invoke('audio-stop'),
  openPluginDialog: () => ipcRenderer.invoke('open-plugin-dialog'),

  // === Preset ===
  presetSave: (preset: any) => ipcRenderer.invoke('preset-save', preset),
  presetLoad: (presetId: string) => ipcRenderer.invoke('preset-load', presetId),
  presetList: () => ipcRenderer.invoke('preset-list'),
  presetDelete: (presetId: string) => ipcRenderer.invoke('preset-delete', presetId),
  patchExport: (presetId: string) => ipcRenderer.invoke('patch-export', presetId),
  patchImport: () => ipcRenderer.invoke('patch-import'),
  setExport: (setId: string) => ipcRenderer.invoke('set-export', setId),
  setImport: () => ipcRenderer.invoke('set-import'),
  presetFindByProgram: (programNumber: number) =>
    ipcRenderer.invoke('preset-by-program', programNumber),

  // === Concert (Arquivo) ===
  concertInit: (legacy: unknown) => ipcRenderer.invoke('concert-init', legacy),
  concertGet: () => ipcRenderer.invoke('concert-get'),
  concertNew: (templateId?: string) => ipcRenderer.invoke('concert-new', templateId),
  concertTemplates: () => ipcRenderer.invoke('concert-templates'),
  concertOpen: () => ipcRenderer.invoke('concert-open'),
  concertOpenRecent: (filePath: string) => ipcRenderer.invoke('concert-open-recent', filePath),
  concertSave: (asNew?: boolean) => ipcRenderer.invoke('concert-save', asNew),
  concertSync: (payload: unknown) => ipcRenderer.invoke('concert-sync', payload),
  concertStripsRealign: () => ipcRenderer.invoke('concert-strips-realign'),
  concertRecent: () => ipcRenderer.invoke('concert-recent'),

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
  onVstPresetsUpdated: (callback: (result: any) => void) =>
    ipcRenderer.on('vst-presets-updated', (_event: Electron.IpcRendererEvent, result: unknown) => callback(result)),
  onPluginLoaded: (callback: (plugin: any) => void) =>
    ipcRenderer.on('plugin-loaded', (_event: Electron.IpcRendererEvent, plugin: unknown) => callback(plugin as any)),
  onPluginUnloaded: (callback: (pluginId: string) => void) =>
    ipcRenderer.on('plugin-unloaded', (_event: Electron.IpcRendererEvent, pluginId: unknown) => callback(String(pluginId))),
  onParameterChanged: (callback: (data: any) => void) =>
    ipcRenderer.on('parameter-changed', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as any)),
  onEngineCrashed: (callback: (data: { message: string }) => void) =>
    ipcRenderer.on('engine-crashed', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as { message: string })),
  onEngineRecovered: (callback: (data: { presetId: string | null }) => void) =>
    ipcRenderer.on('engine-recovered', (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as { presetId: string | null })),

  // === Menu nativo (Arquivo) ===
  onMenuAction: (callback: (action: unknown) => void) =>
    ipcRenderer.on('menu-action', (_event: Electron.IpcRendererEvent, action: unknown) => callback(action)),
});
