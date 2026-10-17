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
  AppStatus,
  ElectronChannels,
  AudioStartOptions,
  LayerMixUpdate,
  MasterMixUpdate,
  SavedAudioSettings,
  AppPreferences,
  ConcertState,
  ConcertSyncPayload,
  MenuAction,
} from '../shared/types';
import { validateProgramNumber, DEFAULT_MIDI_CHANNEL, CONCERT_FILE_EXTENSION } from '../shared/constants';

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

    ipcMain.handle('engine-panic', () => {
      return this.vstManager.panic();
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
      return { dirty: this.concertManager.isDirty() };
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
      if (assignment.role !== 'instrument') {
        throw new Error(`O layer "${assignment.name}" é um efeito; efeitos ainda não fazem parte desta etapa.`);
      }
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
          { role: 'undo', label: 'Desfazer' },
          { role: 'redo', label: 'Refazer' },
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

  private async activateProgramNumber(program: number, channel: number): Promise<boolean> {
    this.appStatus.currentProgramNumber = program;
    const preset = this.concertManager.findByProgramNumber(program);
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
