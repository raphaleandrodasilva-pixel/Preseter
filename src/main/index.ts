import { app, BrowserWindow, ipcMain, dialog, session, Menu, MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { VstManager } from './vst/VstManager';
import { PresetManager } from './preset/PresetManager';
import { LayoutManager } from './layout/LayoutManager';
import { ConcertManager, LegacyConcertPayload } from './concert/ConcertManager';
import { listTemplates } from './concert/templates';
import {
  Preset,
  PresetSet,
  VstPluginInfo,
  MidiBinding,
  MidiThruBlock,
  AppStatus,
  AudioInputSettings,
  ElectronChannels,
  AudioStartOptions,
  BusMixUpdate,
  BusSettings,
  EffectiveStrip,
  Insert,
  LayerMixUpdate,
  MasterMixUpdate,
  SavedAudioSettings,
  AppPreferences,
  ConcertState,
  ConcertSyncPayload,
  MenuAction,
  SEND_OFF_DB,
  MAX_AUX_BUSES,
  MAX_OUTPUT_BUSES,
} from '../shared/types';
import type { EngineInsertState } from '../shared/engine-protocol';
import { resolveStrips } from '../shared/concert-strips';
import { normalizeAudioInput } from '../shared/audio-input';
import { validateProgramNumber, DEFAULT_MIDI_CHANNEL, CONCERT_FILE_EXTENSION } from '../shared/constants';

/**
 * Compara caminhos de plugin tolerando o caminho interno que o VST3 devolve:
 * o motor reporta `...\Foo.vst3\Contents\x86_64-win\Foo.vst3` para um plugin
 * carregado a partir do bundle `...\Foo.vst3`. Serve para saber se um efeito ou
 * instrumento já está carregado sem recarregá-lo a cada troca de patch.
 */
function samePluginPath(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  if (a === b) return true;
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return (
    left.startsWith(`${right}\\`) ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}\\`) ||
    right.startsWith(`${left}/`)
  );
}

class MainWindow {
  private window: BrowserWindow | null = null;
  private vstManager: VstManager;
  private presetManager: PresetManager;
  private layoutManager: LayoutManager;
  private concertManager: ConcertManager;
  private audioSettingsPath: string;
  private preferencesPath: string;
  /** Último patch carregado, para recarregar após uma queda do motor. */
  private lastLoadedPresetId: string | null = null;
  private recovering: Promise<void> | null = null;
  /** true quando o usuário já confirmou o fechamento com alterações pendentes. */
  private closing = false;
  private appStatus: AppStatus = {
    isPlaying: false,
    currentPresetId: null,
    currentProgramNumber: 0,
    tempo: 120,
    isMetronomeOn: false,
  };

  constructor() {
    this.vstManager = new VstManager();
    this.presetManager = new PresetManager();
    this.layoutManager = new LayoutManager();
    this.concertManager = new ConcertManager();
    this.audioSettingsPath = path.join(app.getPath('userData'), 'audio-settings.json');
    this.preferencesPath = path.join(app.getPath('userData'), 'preferences.json');
    this.concertManager.on('changed', () => this.updateTitle());
    this.concertManager.on('recent-changed', () => this.buildMenu());
    this.vstManager.on('plugin-loaded', (plugin) => this.sendToRenderer('plugin-loaded', plugin));
    this.vstManager.on('plugin-unloaded', (pluginId) => this.sendToRenderer('plugin-unloaded', pluginId));
    this.vstManager.on('parameter-changed', (change) => this.sendToRenderer('parameter-changed', change));
    this.vstManager.on('engine-crashed', (error: unknown) => {
      const message = error instanceof Error ? error.message : 'O motor de áudio encerrou.';
      console.warn('[Preseter] O motor de áudio caiu:', message);
      this.sendToRenderer('engine-crashed', { message });
      void this.recoverEngine();
    });
  }

  init(): void {
    // Carregar presets (rápido, JSON local)
    this.presetManager.loadPresets();

    // Registrar handlers IPC antes da janela existir
    this.registerIpcHandlers();

    // Configurar eventos do app
    app.whenReady().then(() => {
      this.configureMidiPermissions();
      this.createWindow();
      this.buildMenu();
      // Inicializa o engine, restaura áudio salvo e escaneia VSTs em segundo plano.
      setImmediate(() => {
        void this.initializeEngine();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    let shuttingDown = false;
    app.on('before-quit', (event) => {
      if (shuttingDown) return;
      event.preventDefault();
      shuttingDown = true;
      void this.vstManager.shutdown().finally(() => app.quit());
    });
  }

  private createWindow(): void {
    this.window = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      backgroundColor: '#111827',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      title: 'Preseter - Live Performance',
    });

    // Carregar a interface
    const startUrl =
      process.env.ELECTRON_START_URL ||
      `file://${path.join(__dirname, '../renderer/index.html')}`;

    this.window.loadURL(startUrl);

    // Enviar status inicial
    this.window.webContents.on('did-finish-load', () => {
      this.sendToRenderer('app-status-change', this.appStatus);
    });

    // Perguntar se quer salvar antes de fechar com alterações pendentes.
    this.window.on('close', (event) => {
      if (this.closing || !this.concertManager.isDirty()) return;
      event.preventDefault();
      void this.confirmClose();
    });
  }

  private sendToRenderer(channel: string, data: any): void {
    this.window?.webContents.send(channel, data);
  }

  private registerIpcHandlers(): void {
    // === MIDI Handlers ===

    // === MIDI Program Change (pgm send) ===

    ipcMain.handle('midi-program-change', async (_event, program: number, channel: number) => {
      const validProgram = this.validateMidiProgramChange(program, channel);
      const activated = await this.activateProgramNumber(validProgram.program, validProgram.channel, 0, undefined, false);
      return { ...validProgram, activated };
    });

    ipcMain.handle('midi-input-program-change', async (_event, program: number, channel: number, bank?: number, deviceName?: string) => {
      const validProgram = this.validateMidiProgramChange(program, channel);
      return this.activateProgramNumber(
        validProgram.program,
        validProgram.channel,
        Number.isInteger(bank) ? bank : 0,
        typeof deviceName === 'string' ? deviceName : undefined,
        true
      );
    });

    // === VST Handlers ===

    ipcMain.handle('vst-scan', async () => {
      return this.vstManager.scanDefaultDirectories();
    });

    ipcMain.handle('vst-load', async (_event, pluginPath: string, layerId?: string, minNote?: number, maxNote?: number, pinned?: boolean) => {
      return this.vstManager.loadPlugin(pluginPath, layerId, minNote, maxNote, pinned === true);
    });

    ipcMain.handle('vst-unload', async (_event, pluginId: string) => {
      return this.vstManager.unloadPlugin(pluginId);
    });

    ipcMain.handle('vst-set-param', (_event, pluginId: string, paramId: string, value: number) => {
      return this.vstManager.setParameter(pluginId, paramId, value);
    });

    ipcMain.handle('vst-get-state', (_event, pluginId: string) => {
      return this.vstManager.getPluginState(pluginId);
    });

    ipcMain.handle('vst-set-state', (_event, pluginId: string, state: any) => {
      return this.vstManager.setPluginState(pluginId, state);
    });

    ipcMain.handle('vst-open-editor', (_event, pluginId: string) => {
      return this.vstManager.openPluginEditor(pluginId);
    });

    ipcMain.handle('vst-close-editor', (_event, pluginId: string) => {
      return this.vstManager.closePluginEditor(pluginId);
    });

    ipcMain.handle('vst-list', () => {
      return this.vstManager.getScannedPlugins();
    });

    ipcMain.handle('vst-loaded', () => {
      return this.vstManager.getLoadedPlugins();
    });

    ipcMain.handle('engine-midi', (_event, bytes: number[]) => {
      return this.vstManager.sendMidi(bytes);
    });

    ipcMain.handle('engine-panic', () => {
      return this.vstManager.panic();
    });

    ipcMain.handle('vst-set-layer-range', (_event, layerId: string, minNote: number, maxNote: number) => {
      return this.vstManager.setLayerRange(layerId, minNote, maxNote);
    });

    ipcMain.handle('vst-set-layer-velocity', (_event, layerId: string, minVelocity: number, maxVelocity: number) => {
      return this.vstManager.setLayerVelocityRange(layerId, minVelocity, maxVelocity);
    });

    ipcMain.handle('audio-input-set', (_event, settings: unknown) => {
      return this.vstManager.setAudioInput(settings as Partial<AudioInputSettings> & { resetFeedback?: boolean });
    });

    ipcMain.handle('audio-input-state', () => {
      return this.vstManager.getAudioInputState();
    });

    ipcMain.handle('midi-thru-set', (_event, blocked: MidiThruBlock[]) => {
      return this.vstManager.setMidiThru(Array.isArray(blocked) ? blocked : []);
    });

    ipcMain.handle('host-clock-set', (_event, bpm: number, numerator: number, denominator: number, playing: boolean) => {
      return this.vstManager.setHostClock(bpm, numerator, denominator, playing);
    });

    ipcMain.handle('metronome-set', (_event, enabled: boolean, volumeDb: number, accentFirstBeat: boolean) => {
      return this.vstManager.setMetronome(enabled, volumeDb, accentFirstBeat);
    });

    ipcMain.handle('record-start', async () => {
      const result = await dialog.showSaveDialog(this.window!, {
        title: 'Gravar saída do concert',
        defaultPath: `Preseter ${new Date().toISOString().slice(0, 10)}.wav`,
        filters: [{ name: 'WAV', extensions: ['wav'] }],
      });
      if (result.canceled || !result.filePath) return null;
      const started = await this.vstManager.startRecording(result.filePath);
      return started ? result.filePath : null;
    });

    ipcMain.handle('record-stop', () => this.vstManager.stopRecording());

    ipcMain.handle('playback-load', async () => {
      const result = await dialog.showOpenDialog(this.window!, {
        title: 'Carregar áudio no Playback',
        properties: ['openFile'],
        filters: [{ name: 'Áudio', extensions: ['wav', 'aif', 'aiff', 'flac', 'mp3'] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return this.vstManager.loadPlayback(result.filePaths[0]);
    });

    ipcMain.handle('playback-play', () => this.vstManager.playPlayback());
    ipcMain.handle('playback-stop', () => this.vstManager.stopPlayback());
    ipcMain.handle('playback-state', () => this.vstManager.getPlaybackState());

    ipcMain.handle('vst-mix-get', () => this.vstManager.getMixState());
    ipcMain.handle('vst-set-layer-mix', (_event, layerId: string, update: LayerMixUpdate) => {
      return this.vstManager.setLayerMix(layerId, update);
    });
    ipcMain.handle('vst-set-master-mix', (_event, update: MasterMixUpdate) => {
      return this.vstManager.setMasterMix(update);
    });

    ipcMain.handle('vst-insert-set', (_event, layerId: string, slot: number, pluginPath: string, bypass?: boolean) => {
      return this.vstManager.setInsert(layerId, slot, pluginPath, bypass === true);
    });
    ipcMain.handle('vst-insert-remove', (_event, layerId: string, slot: number) => {
      return this.vstManager.removeInsert(layerId, slot);
    });
    ipcMain.handle('vst-insert-bypass', (_event, layerId: string, slot: number, bypass: boolean) => {
      return this.vstManager.setInsertBypass(layerId, slot, bypass === true);
    });
    ipcMain.handle('vst-inserts', (_event, layerId: string) => {
      return this.vstManager.getInserts(layerId);
    });
    ipcMain.handle('vst-insert-state-get', (_event, layerId: string, slot: number) => {
      return this.vstManager.getInsertState(layerId, slot);
    });
    ipcMain.handle('vst-insert-state-set', (_event, layerId: string, slot: number, data: string) => {
      return this.vstManager.setInsertState(layerId, slot, data);
    });
    ipcMain.handle('vst-insert-open-editor', (_event, layerId: string, slot: number) => {
      return this.vstManager.openInsertEditor(layerId, slot);
    });
    ipcMain.handle('vst-insert-close-editor', (_event, layerId: string, slot: number) => {
      return this.vstManager.closeInsertEditor(layerId, slot);
    });

    ipcMain.handle('vst-buses', () => this.vstManager.getBuses());
    ipcMain.handle('vst-set-bus-mix', (_event, bus: string, update: BusMixUpdate) => {
      return this.vstManager.setBusMix(bus, update);
    });
    ipcMain.handle('vst-set-send', (_event, layerId: string, aux: number, levelDb: number) => {
      return this.vstManager.setSend(layerId, aux, levelDb);
    });
    ipcMain.handle('vst-set-layer-output', (_event, layerId: string, output: number) => {
      return this.vstManager.setLayerOutput(layerId, output);
    });

    ipcMain.handle('audio-settings-get', async () => ({
      devices: await this.vstManager.getAudioDevices(),
      settings: this.readAudioSettings(),
    }));

    ipcMain.handle('audio-start', async (_event, options: AudioStartOptions) => {
      const devices = await this.vstManager.startAudio(options);
      this.writeAudioSettings({ ...options, enabled: true });
      return { devices, settings: this.readAudioSettings() };
    });

    ipcMain.handle('audio-stop', async () => {
      await this.vstManager.stopAudio();
      const saved = this.readAudioSettings();
      this.writeAudioSettings({ ...saved, enabled: false });
      return { devices: await this.vstManager.getAudioDevices(), settings: this.readAudioSettings() };
    });

    // === Preferências gerais ===
    ipcMain.handle('preferences-get', () => this.readPreferences());

    ipcMain.handle('preferences-set', (_event, update: Partial<AppPreferences>) => {
      const preferences = { ...this.readPreferences(), ...update };
      this.writePreferences(preferences);
      return preferences;
    });

    ipcMain.handle('window-set-fullscreen', (_event, value: unknown) => {
      const fullscreen = value === true;
      this.window?.setFullScreen(fullscreen);
      return this.window?.isFullScreen() ?? false;
    });

    // === Preset Handlers (patches do concert aberto) ===

    ipcMain.handle('preset-save', (_event, preset: Preset) => {
      this.concertManager.upsertPatch(preset);
      if (preset.id === this.lastLoadedPresetId) {
        void this.applyCurrentTranspose(preset);
        void this.applyCurrentAudioInput(preset);
      }
      return true;
    });

    ipcMain.handle('preset-load', (_event, presetId: string) => {
      return this.loadPreset(presetId);
    });

    ipcMain.handle('preset-list', () => {
      return this.concertManager.getPresets();
    });

    ipcMain.handle('preset-delete', (_event, presetId: string) => {
      return this.concertManager.deletePatch(presetId);
    });

    ipcMain.handle('patch-export', (_event, presetId: string) => this.exportPatch(presetId));
    ipcMain.handle('patch-import', () => this.importPatch());
    ipcMain.handle('set-export', (_event, setId: string) => this.exportSet(setId));
    ipcMain.handle('set-import', () => this.importSet());

    ipcMain.handle('preset-by-program', (_event, programNumber: number) => {
      return this.concertManager.findByProgramNumber(programNumber);
    });

    // === Concert Handlers (Arquivo > Novo/Abrir/Salvar...) ===

    ipcMain.handle('concert-init', (_event, legacy: LegacyConcertPayload) => this.initConcert(legacy));

    ipcMain.handle('concert-get', () => this.concertManager.getState());

    ipcMain.handle('concert-new', (_event, templateId?: string) => this.concertManager.newConcert(templateId));

    ipcMain.handle('concert-templates', () => listTemplates());

    ipcMain.handle('concert-open', () => this.openConcertDialog());

    ipcMain.handle('concert-open-recent', (_event, filePath: string) => this.openConcertPath(filePath));

    ipcMain.handle('concert-save', (_event, asNew?: boolean) => this.saveConcert(asNew === true));

    ipcMain.handle('concert-sync', (_event, payload: ConcertSyncPayload) => {
      this.concertManager.applyEditors(payload);
      void this.applyCurrentTranspose();
      return { dirty: this.concertManager.isDirty() };
    });

    /**
     * Realinha os channel strips do concert/set no motor com o concert atual.
     * Usado depois de desfazer/refazer, que só mexem no estado do renderer.
     */
    ipcMain.handle('concert-strips-realign', async () => {
      if (!this.lastLoadedPresetId) return false;
      const preset = this.concertManager.getPreset(this.lastLoadedPresetId) ?? null;
      await this.syncInheritedStrips(preset);
      return true;
    });

    ipcMain.handle('concert-recent', () => this.concertManager.getRecent());

    // === Layout Handlers ===

    ipcMain.handle('layout-change', (_event, layout: any) => {
      this.layoutManager.setLayout(layout);
      this.sendToRenderer('layout-change', layout);
      return true;
    });

    // === App Status Handlers ===

    ipcMain.handle('app-status-change', (_event, status: Partial<AppStatus>) => {
      this.appStatus = { ...this.appStatus, ...status };
      this.updateAppStatus();
      return this.appStatus;
    });

    ipcMain.handle('app-status-get', () => {
      return this.appStatus;
    });

    // === UI Element Handlers ===

    ipcMain.handle('ui-element-add', (_event, element: any) => {
      this.layoutManager.addElement(element);
      const layout = this.layoutManager.getLayout();
      this.sendToRenderer('layout-change', layout);
      return layout;
    });

    ipcMain.handle('ui-element-update', (_event, element: any) => {
      this.layoutManager.updateElement(element);
      const layout = this.layoutManager.getLayout();
      this.sendToRenderer('layout-change', layout);
      return layout;
    });

    ipcMain.handle('ui-element-remove', (_event, id: string) => {
      this.layoutManager.removeElement(id);
      const layout = this.layoutManager.getLayout();
      this.sendToRenderer('layout-change', layout);
      return layout;
    });

    // === Menu/Dialog Handlers ===

    ipcMain.handle('open-plugin-dialog', async () => {
      if (!this.window) return { canceled: true, filePaths: [] };
      const result = await dialog.showOpenDialog(this.window, {
        title: 'Selecione um plugin VST',
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: 'Plugins VST3', extensions: ['vst3'] }],
      });
      return result;
    });

    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });
  }

  /** Soma dos transposes do patch, do set e do concert (Fase 3.4). */
  private patchTranspose(preset: Preset): number {
    const concert = this.concertManager.getState().settings.midi.transpose ?? 0;
    const set = preset.setId ? this.concertManager.getSet(preset.setId) : undefined;
    return concert + (set?.transpose ?? 0) + (preset.transpose ?? 0);
  }

  /** Envia ao motor o transpose do patch atual (ou do patch indicado). */
  private async applyCurrentTranspose(preset?: Preset | null): Promise<void> {
    const current = preset ?? (this.lastLoadedPresetId
      ? this.concertManager.getPreset(this.lastLoadedPresetId) ?? null
      : null);
    if (!current) return;
    try {
      await this.vstManager.setTranspose(this.patchTranspose(current));
    } catch (error) {
      console.warn('[Preseter] Não foi possível aplicar o transpose:', error);
    }
  }

  /** Envia ao motor o strip de entrada de áudio do patch (Fase 3.5). */
  private async applyCurrentAudioInput(preset?: Preset | null): Promise<void> {
    const current = preset ?? (this.lastLoadedPresetId
      ? this.concertManager.getPreset(this.lastLoadedPresetId) ?? null
      : null);
    const settings = normalizeAudioInput(current?.audioInput);
    try {
      await this.vstManager.setAudioInput(settings);
    } catch (error) {
      console.warn('[Preseter] Não foi possível aplicar a entrada de áudio:', error);
    }
  }

  private safeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'patch';
  }

  private nextFreeProgramNumber(): number {
    const used = new Set(this.concertManager.getPresets().map((preset) => preset.programNumber));
    for (let program = 0; program < 128; program += 1) {
      if (!used.has(program)) return program;
    }
    return 0;
  }

  private uniquePatchId(base: string): string {
    const used = new Set(this.concertManager.getPresets().map((preset) => preset.id));
    return used.has(base) ? `${base}_import_${Date.now()}` : base;
  }

  /** Exporta um patch para um arquivo `.patch` (Fase 5.3). */
  private async exportPatch(presetId: string): Promise<boolean> {
    const preset = this.concertManager.getPreset(presetId);
    if (!preset) return false;
    const result = await dialog.showSaveDialog(this.window!, {
      title: 'Exportar patch',
      defaultPath: `${this.safeFileName(preset.name)}.patch`,
      filters: [{ name: 'Preseter Patch', extensions: ['patch'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, `${JSON.stringify({
      format: 'preseter.patch',
      version: 1,
      kind: 'patch',
      patch: preset,
    }, null, 2)}\n`, 'utf8');
    return true;
  }

  /** Importa um patch `.patch` para o concert aberto (Fase 5.3). */
  private async importPatch(): Promise<Preset | null> {
    const result = await dialog.showOpenDialog(this.window!, {
      title: 'Importar patch',
      properties: ['openFile'],
      filters: [{ name: 'Preseter Patch', extensions: ['patch', 'json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const raw: unknown = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const record = raw as { patch?: Preset; kind?: string };
    if (record.kind && record.kind !== 'patch') {
      throw new Error('Este arquivo não contém um patch.');
    }
    const source = record.patch ?? (raw as Preset);
    if (!source || typeof source.name !== 'string' || !Array.isArray(source.layout?.elements)) {
      throw new Error('O arquivo .patch está inválido.');
    }
    const imported: Preset = {
      ...source,
      id: this.uniquePatchId(source.id || `preset_import_${Date.now()}`),
      programNumber: this.nextFreeProgramNumber(),
      setId: undefined,
      setOrder: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mappings: source.mappings ?? {},
      layout: { elements: [], background: null, tempo: source.layout.tempo ?? 120 },
    };
    this.concertManager.upsertPatch(imported);
    this.sendToRenderer('preset-list', this.concertManager.getPresets());
    return imported;
  }

  /** Exporta um set e seus patches (Fase 5.3). */
  private async exportSet(setId: string): Promise<boolean> {
    const set = this.concertManager.getSet(setId);
    if (!set) return false;
    const patches = this.concertManager.getPresets().filter((preset) => preset.setId === setId);
    const result = await dialog.showSaveDialog(this.window!, {
      title: 'Exportar set',
      defaultPath: `${this.safeFileName(set.name)}.patch`,
      filters: [{ name: 'Preseter Set', extensions: ['patch'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, `${JSON.stringify({
      format: 'preseter.patch',
      version: 1,
      kind: 'set',
      set,
      patches,
    }, null, 2)}\n`, 'utf8');
    return true;
  }

  /** Importa um set e seus patches para o concert aberto (Fase 5.3). */
  private async importSet(): Promise<{ set: PresetSet; patches: Preset[] } | null> {
    const result = await dialog.showOpenDialog(this.window!, {
      title: 'Importar set',
      properties: ['openFile'],
      filters: [{ name: 'Preseter Set', extensions: ['patch', 'json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const raw: unknown = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const record = raw as { kind?: string; set?: PresetSet; patches?: Preset[] };
    if (record.kind !== 'set' || !record.set || !Array.isArray(record.patches)) {
      throw new Error('Este arquivo não contém um set.');
    }
    const set: PresetSet = {
      ...record.set,
      id: `set_import_${Date.now()}`,
      order: Math.max(-1, ...this.concertManager.getState().sets.map((item) => item.order)) + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    let program = this.nextFreeProgramNumber();
    const patches = record.patches.map((patch, index) => {
      const programNumber = Math.min(127, program);
      program += 1;
      return {
        ...patch,
        id: this.uniquePatchId(`${patch.id}_import_${Date.now()}_${index}`),
        setId: set.id,
        setOrder: index,
        programNumber,
        mappings: patch.mappings ?? {},
        layout: { elements: [], background: null, tempo: patch.layout?.tempo ?? 120 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    this.concertManager.addSet(set);
    for (const patch of patches) this.concertManager.upsertPatch(patch);
    return { set, patches };
  }

  private async loadPreset(presetId: string): Promise<boolean> {
    const preset = this.concertManager.getPreset(presetId);
    if (!preset) return false;

    this.lastLoadedPresetId = preset.id;
    this.concertManager.setLastPatchId(preset.id);

    const assignments = preset.plugins ?? [];

    const silencePrevious = this.readPreferences().silencePreviousPatch;

    // Carrega o patch novo em modo encadeado, reaproveitando instâncias iguais, e só
    // depois troca o grafo de uma vez. O patch anterior segue soando até as caudas acabarem.
    const restoredStateKeys = new Set<string>();
    for (const [index, assignment] of assignments.entries()) {
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      const plugin = await this.vstManager.stageLoad(
        assignment.path,
        layerId,
        assignment.minNote ?? 0,
        assignment.maxNote ?? 127
      );
      await this.vstManager.setLayerMix(layerId, assignment.mix ?? {});
      const savedStateKeys = [
        `loaded_${layerId}`,
        layerId,
        `loaded_${plugin.id}`,
        plugin.id,
        `loaded_${assignment.pluginId}`,
        assignment.pluginId,
      ];
      const savedStateKey = savedStateKeys.find((key) => preset.vstStates[key] !== undefined);
      if (savedStateKey) {
        await this.vstManager.setPluginState(layerId, preset.vstStates[savedStateKey]);
        restoredStateKeys.add(savedStateKey);
      }
    }

    await this.vstManager.commitPatchSwap(silencePrevious);
    await this.applyCurrentTranspose(preset);
    await this.applyCurrentAudioInput(preset);
    // Faixa de velocity por layer (Fase 3.4).
    for (const [index, assignment] of assignments.entries()) {
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      try {
        await this.vstManager.setLayerVelocityRange(
          layerId,
          assignment.velocityMin ?? 1,
          assignment.velocityMax ?? 127
        );
      } catch (error) {
        console.warn(`[Preseter] Não foi possível aplicar a velocity do layer "${layerId}":`, error);
      }
    }
    await this.vstManager.setMasterMix(preset.masterMix ?? { volumeDb: 0, muted: false });

    // Inserts (efeitos) por channel strip: carrega depois da troca e restaura o estado (Fase 3.1).
    for (const [index, assignment] of assignments.entries()) {
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      const inserts = [...(assignment.inserts ?? [])].sort((a, b) => a.slot - b.slot);
      for (const insert of inserts) {
        try {
          await this.vstManager.setInsert(layerId, insert.slot, insert.path, insert.bypass ?? false);
        } catch (error) {
          console.warn(`[Preseter] Não foi possível carregar o efeito "${insert.name}":`, error);
          continue;
        }
        const savedInsertState = preset.vstStates[`insert_${layerId}_${insert.slot}`];
        if (typeof savedInsertState?.data === 'string') {
          await this.vstManager.setInsertState(layerId, insert.slot, savedInsertState.data);
        }
      }
    }

    // Sends (Aux) e saída (Output) de cada channel strip (Fase 3.2).
    for (const [index, assignment] of assignments.entries()) {
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      try {
        await this.vstManager.setLayerOutput(layerId, this.clampOutput(assignment.output));
        const sends = assignment.sends ?? [];
        for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
          const level = sends[aux - 1];
          const levelDb = typeof level === 'number' && Number.isFinite(level) ? level : SEND_OFF_DB;
          await this.vstManager.setSend(layerId, aux, levelDb);
        }
      } catch (error) {
        console.warn(`[Preseter] Não foi possível aplicar sends/saída do layer "${layerId}":`, error);
      }
    }

    // Channel strips do concert/set (Fase 3.3): ficam carregados fora da troca de
    // patch e recebem os overrides deste patch; o estado dos inserts volta abaixo.
    const inheritedStrips = await this.syncInheritedStrips(preset);
    for (const strip of inheritedStrips) {
      for (const insert of strip.inserts) {
        const saved = preset.vstStates[`insert_${strip.id}_${insert.slot}`];
        if (typeof saved?.data !== 'string') continue;
        try {
          await this.vstManager.setInsertState(strip.id, insert.slot, saved.data);
        } catch (error) {
          console.warn(`[Preseter] Não foi possível restaurar o efeito do strip ${strip.id}:`, error);
        }
      }
    }

    // Barramentos Aux/Output do concert: alinha o motor com o concert e restaura
    // o estado dos efeitos guardado neste patch (Fase 3.2).
    await this.applyConcertBuses();
    for (const { id, bus } of this.concertBusList()) {
      for (const insert of bus.inserts ?? []) {
        const saved = preset.vstStates[`insert_${id}_${insert.slot}`];
        if (typeof saved?.data !== 'string') continue;
        try {
          await this.vstManager.setInsertState(id, insert.slot, saved.data);
        } catch (error) {
          console.warn(`[Preseter] Não foi possível restaurar o efeito do barramento ${id}:`, error);
        }
      }
    }

    // Restaurar também estados de plugins carregados fora da lista de assignments.
    const pluginStates = preset.vstStates;
    for (const [pluginId, state] of Object.entries(pluginStates)) {
      if (restoredStateKeys.has(pluginId)) continue;
      const actualPluginId = pluginId.replace(/^loaded_/, '');
      const loaded = this.vstManager.getLoadedPlugins().find(
        (plugin) => plugin.layerId === actualPluginId || plugin.id === actualPluginId
      );
      if (!loaded) continue;
      await this.vstManager.setPluginState(loaded.layerId ?? loaded.id, state);
    }

    // Atualizar layout do concert (Fase 4.1): o layout é compartilhado pelos patches.
    const concertLayout = this.concertManager.getState().layout;
    this.layoutManager.setLayout(concertLayout);
    this.sendToRenderer('layout-change', concertLayout);

    // Enviar notificação de preset carregado
    this.sendToRenderer('preset-loaded', {
      presetId,
      name: preset.name,
      programNumber: preset.programNumber,
    });

    return true;
  }

  // === Sends e Aux/Output do concert (Fase 3.2) ===

  /** Barramentos do concert com o id usado no motor (`aux1`..`output4`). */
  private concertBusList(): Array<{ id: string; bus: BusSettings }> {
    const { settings } = this.concertManager.getState();
    const aux = (settings.buses?.aux ?? []).slice(0, MAX_AUX_BUSES);
    const outputs = (settings.buses?.outputs ?? []).slice(0, MAX_OUTPUT_BUSES);
    return [
      ...aux.map((bus, index) => ({ id: `aux${index + 1}`, bus })),
      ...outputs.map((bus, index) => ({ id: `output${index + 1}`, bus })),
    ];
  }

  private clampOutput(output: unknown): number {
    const value = typeof output === 'number' && Number.isFinite(output) ? Math.round(output) : 1;
    return Math.max(1, Math.min(MAX_OUTPUT_BUSES, value));
  }

  /**
   * Alinha a cadeia de inserts de um channel strip (layer ou barramento) com o
   * desejado. Idempotente: só recarrega um insert quando o efeito (caminho) muda,
   * para não cortar as caudas dos efeitos a cada troca de patch.
   */
  private async alignInserts(ownerId: string, inserts: Insert[] | undefined): Promise<void> {
    let current: EngineInsertState[] = [];
    try {
      current = await this.vstManager.getInserts(ownerId);
    } catch (error) {
      console.warn(`[Preseter] Não foi possível ler os inserts de "${ownerId}":`, error);
    }

    const wanted = [...(inserts ?? [])].sort((a, b) => a.slot - b.slot);
    for (const slotState of current) {
      const want = wanted.find((item) => item.slot === slotState.slot);
      if (slotState.loaded && (!want || !samePluginPath(want.path, slotState.path))) {
        try {
          await this.vstManager.removeInsert(ownerId, slotState.slot);
        } catch (error) {
          console.warn(`[Preseter] Não foi possível remover o efeito de "${ownerId}":`, error);
        }
      }
    }

    for (const insert of wanted) {
      const loaded = current.find((item) => item.slot === insert.slot);
      const bypass = insert.bypass ?? false;
      if (loaded?.loaded === true && samePluginPath(loaded.path, insert.path)) {
        if (loaded.bypass !== bypass) {
          await this.vstManager.setInsertBypass(ownerId, insert.slot, bypass);
        }
        continue;
      }
      try {
        await this.vstManager.setInsert(ownerId, insert.slot, insert.path, bypass);
      } catch (error) {
        console.warn(`[Preseter] Não foi possível carregar o efeito "${insert.name}" em "${ownerId}":`, error);
      }
    }
  }

  /** Alinha os barramentos Aux/Output do concert com o motor (Fase 3.2). */
  private async applyConcertBuses(): Promise<void> {
    for (const { id, bus } of this.concertBusList()) {
      await this.alignInserts(id, bus.inserts);
      try {
        await this.vstManager.setBusMix(id, {
          volumeDb: bus.volumeDb,
          pan: bus.pan,
          muted: bus.muted,
          output: this.clampOutput(bus.output),
        });
      } catch (error) {
        console.warn(`[Preseter] Não foi possível ajustar o barramento ${id}:`, error);
      }
    }
  }

  // === Channel strips do concert/set (Fase 3.3) ===

  /** Strips visíveis no patch, já resolvidos (patch > set > concert). */
  private resolvedStrips(preset: Preset | null): EffectiveStrip[] {
    const state = this.concertManager.getState();
    const set = preset?.setId ? this.concertManager.getSet(preset.setId) : undefined;
    return resolveStrips({
      concertStrips: state.strips,
      setStrips: set?.strips,
      patchStrips: preset?.plugins,
      patchId: preset?.id ?? '',
      setOverrides: set?.stripOverrides,
      patchOverrides: preset?.stripOverrides,
    });
  }

  /**
   * Carrega e ajusta no motor os strips herdados do concert e do set (Fase 3.3).
   * Eles entram como layers `pinned`: sobrevivem à troca de patch e recebem MIDI
   * em todos os patches. Idempotente e sem estado próprio — o motor é a fonte da
   * verdade (`pinned`) — para não cortar as caudas a cada troca de patch.
   */
  private async syncInheritedStrips(preset: Preset | null): Promise<EffectiveStrip[]> {
    const desired = this.resolvedStrips(preset).filter((strip) => strip.level !== 'patch');
    const desiredIds = new Set(desired.map((strip) => strip.id));

    // Layers `pinned` são os strips do concert/set (de agora ou de um concert anterior).
    const loaded = new Map<string, VstPluginInfo>();
    for (const plugin of this.vstManager.getLoadedPlugins()) {
      if (plugin.layerId && (plugin.pinned === true || desiredIds.has(plugin.layerId))) {
        loaded.set(plugin.layerId, plugin);
      }
    }

    // Strips que não valem mais neste concert/set saem do motor.
    for (const id of [...loaded.keys()]) {
      if (desiredIds.has(id)) continue;
      await this.unloadLayerQuietly(id);
      loaded.delete(id);
    }

    for (const strip of desired) {
      let current = loaded.get(strip.id);
      if (current && !samePluginPath(current.path, strip.path)) {
        await this.unloadLayerQuietly(strip.id);
        current = undefined;
      }
      if (!current) {
        try {
          current = await this.vstManager.loadPlugin(strip.path, strip.id, strip.minNote, strip.maxNote, true);
        } catch (error) {
          console.warn(`[Preseter] Não foi possível carregar o channel strip "${strip.name}":`, error);
          continue;
        }
      }

      try {
        await this.vstManager.setLayerMix(strip.id, {
          volumeDb: strip.volumeDb,
          pan: strip.pan,
          muted: strip.muted,
          solo: strip.solo,
        });
        if (current.minNote !== strip.minNote || current.maxNote !== strip.maxNote) {
          await this.vstManager.setLayerRange(strip.id, strip.minNote, strip.maxNote);
        }
        await this.vstManager.setLayerVelocityRange(strip.id, strip.velocityMin, strip.velocityMax);
        await this.vstManager.setLayerOutput(strip.id, this.clampOutput(strip.output));
        for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
          await this.vstManager.setSend(strip.id, aux, strip.sends[aux - 1]);
        }
      } catch (error) {
        console.warn(`[Preseter] Não foi possível ajustar o channel strip "${strip.name}":`, error);
      }

      // A cadeia de inserts pode vir sobreposta pelo set/patch.
      await this.alignInserts(strip.id, strip.inserts);
    }

    return desired;
  }

  private async unloadLayerQuietly(layerId: string): Promise<void> {
    try {
      await this.vstManager.unloadPlugin(layerId);
    } catch (error) {
      console.warn(`[Preseter] Não foi possível descarregar o layer "${layerId}":`, error);
    }
  }

  // === Concert (Arquivo) ===

  /**
   * Prepara o concert inicial: reabre o último usado, migra os dados do modelo
   * antigo na primeira execução da Fase 2, ou começa vazio.
   */
  private initConcert(legacy: LegacyConcertPayload): ConcertState {
    const sessionPath = this.concertManager.getSessionConcertPath();
    if (sessionPath && fs.existsSync(sessionPath)) {
      try {
        return this.concertManager.openFromPath(sessionPath);
      } catch (error) {
        console.warn('[Preseter] Não foi possível reabrir o último concert:', error);
      }
    }

    const legacyPresets = this.presetManager.loadPresets();
    const hasLegacyData = legacyPresets.length > 0 || (legacy?.sets?.length ?? 0) > 0;
    if (hasLegacyData) {
      const state = this.concertManager.migrateLegacy(legacyPresets, legacy);
      // Grava a migração para não repeti-la na próxima abertura.
      try {
        return this.concertManager.saveTo(this.defaultConcertPath(state.name));
      } catch (error) {
        console.warn('[Preseter] Não foi possível gravar o concert migrado:', error);
        return state;
      }
    }

    return this.concertManager.newConcert();
  }

  private defaultConcertPath(name: string): string {
    const safeName = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Meu Concert';
    return path.join(app.getPath('userData'), `${safeName}${CONCERT_FILE_EXTENSION}`);
  }

  private async openConcertDialog(): Promise<ConcertState | null> {
    if (!this.window) return null;
    const result = await dialog.showOpenDialog(this.window, {
      title: 'Abrir Concert',
      filters: [{ name: 'Concert do Preseter', extensions: ['preseter'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return this.openConcertPath(result.filePaths[0]);
  }

  private openConcertPath(filePath: string): ConcertState {
    return this.concertManager.openFromPath(filePath);
  }

  /** Salva o concert (pedindo o caminho quando necessário). null = cancelado. */
  private async saveConcert(asNew: boolean): Promise<ConcertState | null> {
    const current = this.concertManager.getState();
    let target = asNew ? null : current.path;

    if (!target) {
      if (!this.window) return null;
      const result = await dialog.showSaveDialog(this.window, {
        title: 'Salvar Concert',
        defaultPath: path.join(app.getPath('documents'), `${current.name}${CONCERT_FILE_EXTENSION}`),
        filters: [{ name: 'Concert do Preseter', extensions: ['preseter'] }],
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
    }

    const finalPath = target.toLowerCase().endsWith(CONCERT_FILE_EXTENSION)
      ? target
      : `${target}${CONCERT_FILE_EXTENSION}`;
    return this.concertManager.saveTo(finalPath);
  }

  private async confirmClose(): Promise<void> {
    if (!this.window) return;
    const { name } = this.concertManager.getState();
    const { response } = await dialog.showMessageBox(this.window, {
      type: 'warning',
      title: 'Sair do Preseter',
      message: `Salvar as alterações de "${name}" antes de sair?`,
      detail: 'As alterações não salvas serão perdidas.',
      buttons: ['Salvar', 'Não salvar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response === 2) return;
    if (response === 0) {
      try {
        const saved = await this.saveConcert(false);
        if (!saved) return;
      } catch (error) {
        console.warn('[Preseter] Falha ao salvar antes de sair:', error);
        return;
      }
    }

    this.closing = true;
    this.window.close();
  }

  private buildMenu(): void {
    const recent = this.concertManager.getRecent();
    const recentSubmenu: MenuItemConstructorOptions[] = recent.length
      ? recent.map((entry) => ({
          label: entry.name,
          toolTip: entry.path,
          click: () => this.sendMenuAction({ action: 'open-recent', path: entry.path }),
        }))
      : [{ label: 'Nenhum concert recente', enabled: false }];

    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Arquivo',
        submenu: [
          { label: 'Novo Concert', accelerator: 'CmdOrCtrl+N', click: () => this.sendMenuAction({ action: 'new' }) },
          { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => this.sendMenuAction({ action: 'open' }) },
          { label: 'Abrir Recente', submenu: recentSubmenu },
          { type: 'separator' },
          { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: () => this.sendMenuAction({ action: 'save' }) },
          { label: 'Salvar Como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => this.sendMenuAction({ action: 'save-as' }) },
          { type: 'separator' },
          { role: 'quit', label: 'Sair' },
        ],
      },
      {
        label: 'Editar',
        submenu: [
          { label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', click: () => this.sendMenuAction({ action: 'undo' }) },
          { label: 'Refazer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => this.sendMenuAction({ action: 'redo' }) },
          { type: 'separator' },
          { role: 'cut', label: 'Recortar' },
          { role: 'copy', label: 'Copiar' },
          { role: 'paste', label: 'Colar' },
          { role: 'selectAll', label: 'Selecionar tudo' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recarregar' },
          { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Tamanho normal' },
          { role: 'zoomIn', label: 'Aumentar' },
          { role: 'zoomOut', label: 'Diminuir' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Tela cheia' },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  private sendMenuAction(action: MenuAction): void {
    this.sendToRenderer('menu-action', action);
  }

  private updateTitle(): void {
    const state = this.concertManager.getState();
    const marker = state.dirty ? ' •' : '';
    this.window?.setTitle(`${state.name}${marker} — Preseter`);
  }

  private async initializeEngine(): Promise<void> {
    const saved = this.readAudioSettings();
    if (saved.enabled) {
      try {
        await this.vstManager.startAudio(saved);
      } catch (error) {
        console.warn('[Preseter] Não foi possível restaurar a configuração de áudio:', error);
      }
    }

    try {
      await this.vstManager.scanDefaultDirectories();
    } catch (error) {
      console.warn('[Preseter] Falha no scan inicial de VSTs:', error);
    }
  }

  /** Recupera o motor após uma queda: reinicia, reabre o áudio e recarrega o patch atual. */
  private async recoverEngine(): Promise<void> {
    if (this.recovering) return this.recovering;

    this.recovering = (async () => {
      try {
        // Dá um instante para o processo antigo terminar de sair antes de recriá-lo.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const saved = this.readAudioSettings();
        if (saved.enabled) {
          try {
            await this.vstManager.startAudio(saved);
          } catch (error) {
            console.warn('[Preseter] Não foi possível reabrir o áudio após a queda do motor:', error);
          }
        }

        const presetId = this.lastLoadedPresetId;
        if (presetId) {
          try {
            await this.loadPreset(presetId);
          } catch (error) {
            console.warn('[Preseter] Não foi possível recarregar o patch após a queda do motor:', error);
          }
        }

        this.sendToRenderer('engine-recovered', { presetId });
      } finally {
        this.recovering = null;
      }
    })();

    return this.recovering;
  }

  private readAudioSettings(): SavedAudioSettings {
    const defaults: SavedAudioSettings = { enabled: false, inputs: 0, outputs: 2, midi: true };
    try {
      if (!fs.existsSync(this.audioSettingsPath)) return defaults;
      const data: unknown = JSON.parse(fs.readFileSync(this.audioSettingsPath, 'utf8'));
      if (!data || typeof data !== 'object') throw new TypeError('O arquivo de áudio precisa conter um objeto.');
      const saved = data as Partial<SavedAudioSettings>;
      return {
        ...defaults,
        ...saved,
        enabled: saved.enabled === true,
      };
    } catch (error) {
      console.warn('[Preseter] Configuração de áudio salva inválida; usando padrões:', error);
      return defaults;
    }
  }

  private writeAudioSettings(settings: SavedAudioSettings): void {
    fs.mkdirSync(path.dirname(this.audioSettingsPath), { recursive: true });
    fs.writeFileSync(this.audioSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  private readPreferences(): AppPreferences {
    const defaults: AppPreferences = { silencePreviousPatch: false };
    try {
      if (!fs.existsSync(this.preferencesPath)) return defaults;
      const data: unknown = JSON.parse(fs.readFileSync(this.preferencesPath, 'utf8'));
      if (!data || typeof data !== 'object') throw new TypeError('O arquivo de preferências precisa conter um objeto.');
      const saved = data as Partial<AppPreferences>;
      return {
        ...defaults,
        ...saved,
        silencePreviousPatch: saved.silencePreviousPatch === true,
      };
    } catch (error) {
      console.warn('[Preseter] Preferências inválidas; usando padrões:', error);
      return defaults;
    }
  }

  private writePreferences(preferences: AppPreferences): void {
    fs.mkdirSync(path.dirname(this.preferencesPath), { recursive: true });
    fs.writeFileSync(this.preferencesPath, JSON.stringify(preferences, null, 2), 'utf8');
  }

  private updateAppStatus(): void {
    this.sendToRenderer('app-status-change', this.appStatus);
  }

  private configureMidiPermissions(): void {
    const appSession = session.defaultSession;
    appSession.setPermissionCheckHandler((webContents, permission) => {
      return permission === 'midi' && webContents === this.window?.webContents;
    });
    appSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === 'midi' && webContents === this.window?.webContents);
    });
  }

  private validateMidiProgramChange(program: number, channel: number): { program: number; channel: number } {
    if (!Number.isInteger(program) || program < 0 || program > 127) {
      throw new RangeError('O número do programa MIDI deve estar entre 0 e 127.');
    }
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
      throw new RangeError('O canal MIDI deve estar entre 0 e 15.');
    }
    return { program: validateProgramNumber(program), channel };
  }

  private async activateProgramNumber(
    program: number,
    channel: number,
    bank = 0,
    deviceName?: string,
    respectSource = false
  ): Promise<boolean> {
    if (respectSource) {
      const source = this.concertManager.getState().settings.midi.programChange;
      if (source.channel !== null && source.channel !== channel) return false;
      if (source.device && source.device !== (deviceName ?? '')) return false;
    }

    const preset = this.concertManager.getPresets().find((item) => {
      if (item.programNumber !== program) return false;
      if ((item.bankNumber ?? 0) !== bank) return false;
      if (item.skipped) return false;
      if (item.setId && this.concertManager.getSet(item.setId)?.skipped) return false;
      return true;
    });

    this.appStatus.currentProgramNumber = program;
    this.appStatus.currentPresetId = preset?.id ?? null;
    if (preset) {
      await this.loadPreset(preset.id);
    }

    this.updateAppStatus();
    this.sendToRenderer('midi-program-change', { program, bank, channel, preset: preset ?? null });
    return Boolean(preset);
  }
}

// Inicializar aplicação
const mainWindow = new MainWindow();
mainWindow.init();
