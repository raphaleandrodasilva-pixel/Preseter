import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { VstManager } from './vst/VstManager';
import { PresetManager } from './preset/PresetManager';
import { LayoutManager } from './layout/LayoutManager';
import {
  Preset,
  VstPluginInfo,
  MidiBinding,
  AppStatus,
  ElectronChannels,
  AudioStartOptions,
  LayerMixUpdate,
  MasterMixUpdate,
  SavedAudioSettings,
} from '../shared/types';
import { validateProgramNumber, DEFAULT_MIDI_CHANNEL } from '../shared/constants';

class MainWindow {
  private window: BrowserWindow | null = null;
  private vstManager: VstManager;
  private presetManager: PresetManager;
  private layoutManager: LayoutManager;
  private audioSettingsPath: string;
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
    this.audioSettingsPath = path.join(app.getPath('userData'), 'audio-settings.json');
    this.vstManager.on('plugin-loaded', (plugin) => this.sendToRenderer('plugin-loaded', plugin));
    this.vstManager.on('plugin-unloaded', (pluginId) => this.sendToRenderer('plugin-unloaded', pluginId));
    this.vstManager.on('parameter-changed', (change) => this.sendToRenderer('parameter-changed', change));
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
      this.sendToRenderer('preset-list', this.presetManager.getAllPresets());
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
      const activated = await this.activateProgramNumber(validProgram.program, validProgram.channel);
      return { ...validProgram, activated };
    });

    ipcMain.handle('midi-input-program-change', async (_event, program: number, channel: number) => {
      const validProgram = this.validateMidiProgramChange(program, channel);
      return this.activateProgramNumber(validProgram.program, validProgram.channel);
    });

    // === VST Handlers ===

    ipcMain.handle('vst-scan', async () => {
      return this.vstManager.scanDefaultDirectories();
    });

    ipcMain.handle('vst-load', async (_event, pluginPath: string, layerId?: string, minNote?: number, maxNote?: number) => {
      return this.vstManager.loadPlugin(pluginPath, layerId, minNote, maxNote);
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

    ipcMain.handle('vst-set-layer-range', (_event, layerId: string, minNote: number, maxNote: number) => {
      return this.vstManager.setLayerRange(layerId, minNote, maxNote);
    });

    ipcMain.handle('vst-mix-get', () => this.vstManager.getMixState());
    ipcMain.handle('vst-set-layer-mix', (_event, layerId: string, update: LayerMixUpdate) => {
      return this.vstManager.setLayerMix(layerId, update);
    });
    ipcMain.handle('vst-set-master-mix', (_event, update: MasterMixUpdate) => {
      return this.vstManager.setMasterMix(update);
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

    // === Preset Handlers ===

    ipcMain.handle('preset-save', (_event, preset: Preset) => {
      return this.presetManager.savePreset(preset);
    });

    ipcMain.handle('preset-load', (_event, presetId: string) => {
      return this.loadPreset(presetId);
    });

    ipcMain.handle('preset-list', () => {
      return this.presetManager.getAllPresets();
    });

    ipcMain.handle('preset-delete', (_event, presetId: string) => {
      return this.presetManager.deletePreset(presetId);
    });

    ipcMain.handle('preset-by-program', (_event, programNumber: number) => {
      return this.presetManager.findByProgramNumber(programNumber);
    });

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

  private async loadPreset(presetId: string): Promise<boolean> {
    const preset = this.presetManager.getPreset(presetId);
    if (!preset) return false;

    const assignments = preset.plugins ?? [];
    if (assignments.length > 4) {
      throw new Error(`O patch "${preset.name}" excede o limite de quatro instrumentos.`);
    }

    for (const loaded of this.vstManager.getLoadedPlugins()) {
      await this.vstManager.unloadPlugin(loaded.layerId ?? loaded.id);
    }

    const restoredStateKeys = new Set<string>();
    for (const [index, assignment] of assignments.entries()) {
      if (assignment.role !== 'instrument') {
        throw new Error(`O layer "${assignment.name}" é um efeito; efeitos ainda não fazem parte desta etapa.`);
      }
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      const plugin = await this.vstManager.loadPlugin(
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
    await this.vstManager.setMasterMix(preset.masterMix ?? { volumeDb: 0, muted: false });

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

    // Atualizar layout
    this.layoutManager.setLayout(preset.layout);
    this.sendToRenderer('layout-change', preset.layout);

    // Enviar notificação de preset carregado
    this.sendToRenderer('preset-loaded', {
      presetId,
      name: preset.name,
      programNumber: preset.programNumber,
    });

    return true;
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

  private async activateProgramNumber(program: number, channel: number): Promise<boolean> {
    this.appStatus.currentProgramNumber = program;
    const preset = this.presetManager.findByProgramNumber(program);
    this.appStatus.currentPresetId = preset?.id ?? null;
    if (preset) {
      await this.loadPreset(preset.id);
    }

    this.updateAppStatus();
    this.sendToRenderer('midi-program-change', { program, channel, preset: preset ?? null });
    return true;
  }
}

// Inicializar aplicação
const mainWindow = new MainWindow();
mainWindow.init();
