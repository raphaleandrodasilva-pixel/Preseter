import { app, BrowserWindow, ipcMain, dialog, screen, session, Menu, MenuItemConstructorOptions, nativeImage, shell } from 'electron';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { VstManager } from './vst/VstManager';
import { VstPresetLibrary } from './vst/VstPresetLibrary';
import { PresetManager } from './preset/PresetManager';
import { LayoutManager } from './layout/LayoutManager';
import { ConcertManager, LegacyConcertPayload } from './concert/ConcertManager';
import { listTemplates } from './concert/templates';
import { serializeConcertFile } from './concert/ConcertFile';
import { COLLECTION_CATALOG } from '../shared/collection';
import { CollectionInstaller } from './collection/CollectionInstaller';
import { buildCollectionConcert } from './collection/generateCollection';
import { PerformanceMode } from './performance/PerformanceMode';
import {
  convertRecording,
  recordingExtension,
  recordingFileName,
  recordingFilter,
} from './recording/RecordingManager';
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
  PatchMasterSettings,
  SavedAudioSettings,
  AppPreferences,
  ArpSettings,
  DEFAULT_ARP,
  RecordingBitrate,
  RecordingFormat,
  RecordingResult,
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

/** Pastas LV2 padrão do JUCE no Windows/macOS/Linux. */
function standardLv2Folders(): string[] {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming');
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const common = process.env.CommonProgramFiles ?? path.join(programFiles, 'Common Files');
    return [path.join(appData, 'LV2'), path.join(common, 'LV2')];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(process.env.HOME ?? '', 'Library', 'Audio', 'Plug-Ins', 'LV2'),
      path.join(process.env.HOME ?? '', '.lv2'),
      '/Library/Audio/Plug-Ins/LV2',
    ];
  }
  return [path.join(process.env.HOME ?? '', '.lv2'), '/usr/lib/lv2', '/usr/local/lib/lv2'];
}

/** Pastas de presets que devem disparar reindexação ao mudar. */
function presetWatchFolders(): string[] {
  const documents = app.getPath('documents');
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';
  return [
    path.join(documents, 'VST3 Presets'),
    path.join(programData, 'VST3 Presets'),
    path.join(documents, 'Preseter', 'Presets'),
  ];
}

/** Pastas VST3 padrão do sistema, incluindo a pasta sem administrador da coleção. */
function standardVst3Folders(): string[] {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
      ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    return [
      path.join(local, 'Programs', 'Common', 'VST3'),
      path.join(programFiles, 'Common Files', 'VST3'),
      path.join(programFilesX86, 'Common Files', 'VST3'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(process.env.HOME ?? '', 'Library', 'Audio', 'Plug-Ins', 'VST3'),
      '/Library/Audio/Plug-Ins/VST3',
    ];
  }
  return [
    path.join(process.env.HOME ?? '', '.vst3'),
    '/usr/lib/vst3',
    '/usr/local/lib/vst3',
  ];
}

class MainWindow {
  private window: BrowserWindow | null = null;
  private splash: BrowserWindow | null = null;
  private splashShownAt = 0;
  private splashPercent = 0;
  /** Varredura de plugins do startup em andamento. */
  private startupScanActive = false;
  private startupScanDone = false;
  private rendererReady = false;
  /** Usuário pediu para continuar em segundo plano. */
  private backgroundScan = false;
  private vstManager: VstManager;
  private vstPresetLibrary: VstPresetLibrary;
  private vstWatchers: fs.FSWatcher[] = [];
  private vstWatchTimer: NodeJS.Timeout | null = null;
  private vstRefreshPending = false;
  private presetManager: PresetManager;
  private layoutManager: LayoutManager;
  private concertManager: ConcertManager;
  private collectionInstaller: CollectionInstaller;
  private performanceMode: PerformanceMode;
  private audioSettingsPath: string;
  private preferencesPath: string;
  /** Último patch carregado, para recarregar após uma queda do motor. */
  private lastLoadedPresetId: string | null = null;
  /** Fila para não carregar patches concorrentemente. */
  private patchLoadQueue: Promise<unknown> = Promise.resolve();
  private patchLoadInFlight: { id: string; promise: Promise<boolean> } | null = null;
  private recovering: Promise<void> | null = null;
  /** true quando o usuário já confirmou o fechamento com alterações pendentes. */
  private closing = false;
  /** Pedido de cancelamento da geração de .fxp em lote. */
  private fxpCancelRequested = false;
  /** Gravação em andamento; para MP3/FLAC guarda o WAV temporário a converter. */
  private pendingRecording: {
    format: RecordingFormat;
    bitrate: RecordingBitrate;
    finalPath: string;
    tempPath?: string;
  } | null = null;
  private appStatus: AppStatus = {
    isPlaying: false,
    currentPresetId: null,
    currentProgramNumber: 0,
    tempo: 120,
    isMetronomeOn: false,
  };

  constructor() {
    this.vstManager = new VstManager();
    this.vstPresetLibrary = new VstPresetLibrary(app.getPath('userData'), app.getPath('documents'));
    this.presetManager = new PresetManager();
    this.layoutManager = new LayoutManager();
    this.concertManager = new ConcertManager();
    this.audioSettingsPath = path.join(app.getPath('userData'), 'audio-settings.json');
    this.preferencesPath = path.join(app.getPath('userData'), 'preferences.json');
    this.collectionInstaller = new CollectionInstaller({
      getSoundsFolder: () => this.soundsFolder(),
      onProgress: (progress) => this.sendToRenderer('collection-progress', progress),
      onPluginsInstalled: async () => {
        await this.scanWithPreferences(true);
      },
    });
    this.performanceMode = new PerformanceMode({
      getEnginePid: () => this.vstManager.getEnginePid(),
    });
    this.concertManager.on('changed', () => this.updateTitle());
    this.concertManager.on('recent-changed', () => this.buildMenu());
    this.vstManager.on('plugin-loaded', (plugin) => this.sendToRenderer('plugin-loaded', plugin));
    this.vstManager.on('plugin-unloaded', (pluginId) => this.sendToRenderer('plugin-unloaded', pluginId));
    this.vstManager.on('scanned', (plugins) => this.sendToRenderer('vst-scanned', plugins));
    this.vstManager.on('parameter-changed', (change) => this.sendToRenderer('parameter-changed', change));
    this.vstPresetLibrary.on('changed', (result) => this.sendToRenderer('vst-presets-updated', result));
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
      app.setAppUserModelId('com.preseter.app');
      this.configureMidiPermissions();
      this.createSplash();
      this.createWindow();
      this.buildMenu();
      // Inicializa o engine, restaura áudio salvo e escaneia VSTs em segundo plano.
      setImmediate(() => {
        this.performanceMode.initialize(this.readPreferences().performanceMode);
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
      for (const watcher of this.vstWatchers) {
        try { watcher.close(); } catch { /* ignora */ }
      }
      this.vstWatchers = [];
      if (this.splash && !this.splash.isDestroyed()) this.splash.close();
      this.splash = null;
      this.performanceMode.dispose();
      void this.vstManager.shutdown().finally(() => app.quit());
    });
  }

  private iconPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'build', 'icon.png');
  }

  private createSplash(): void {
    const icon = nativeImage.createFromPath(this.iconPath());
    if (icon.isEmpty()) return;
    const dataUrl = icon.toDataURL();
    const splash = new BrowserWindow({
      width: 420,
      height: 360,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, 'splash-preload.js'),
      },
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:system-ui,sans-serif}
      .wrap{height:100%;display:flex;align-items:center;justify-content:center}
      .card{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:linear-gradient(to bottom,#232326,#1A1A1C);border-radius:18px;border:1px solid #3A3A3C;
        box-shadow:0 24px 70px rgba(0,0,0,.7)}
      img{width:180px;height:180px;object-fit:contain;border-radius:16px}
      .name{margin-top:10px;color:#EDEDEF;font-size:18px;font-weight:700;letter-spacing:.08em}
      .hint{margin-top:4px;color:#8E8E93;font-size:11px;min-height:14px}
      .bar{margin-top:14px;width:250px;height:6px;border-radius:999px;background:#303032;overflow:hidden}
      .fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#0A6FE0,#5AA9FF);transition:width .25s ease-out}
      .pct{margin-top:5px;color:#9A9AA0;font-size:10px;font-variant-numeric:tabular-nums}
      .continue{margin-top:12px;display:none;border:1px solid #3A3A3C;border-radius:8px;
        background:#2C2C2E;color:#E5E5EA;font-size:11px;padding:6px 12px;cursor:pointer}
      .continue:hover{background:#3A3A3C}
    </style></head><body><div class="wrap"><div class="card">
      <img src="${dataUrl}" alt="Preseter"><div class="name">PRESETER</div>
      <div class="hint" id="hint">Abrindo Preseter…</div>
      <div class="bar"><div class="fill" id="fill"></div></div>
      <div class="pct" id="pct">0%</div>
      <button class="continue" id="continue">Continuar em segundo plano</button>
    </div></div>
    <script>
      window.setSplashProgress = function (percent, message) {
        var p = Math.max(0, Math.min(100, Number(percent) || 0));
        var fill = document.getElementById('fill');
        var hint = document.getElementById('hint');
        var pct = document.getElementById('pct');
        if (fill) fill.style.width = p + '%';
        if (pct) pct.textContent = Math.round(p) + '%';
        if (hint && message) hint.textContent = message;
      };
      window.setSplashScanning = function (active) {
        var btn = document.getElementById('continue');
        if (!btn) return;
        if (!active) {
          btn.style.display = 'none';
          if (window.__scanTimer) { clearTimeout(window.__scanTimer); window.__scanTimer = null; }
          return;
        }
        if (window.__scanTimer) return;
        window.__scanTimer = setTimeout(function () {
          if (window.splashContinue) btn.style.display = 'inline-block';
        }, 30000);
      };
      document.getElementById('continue').onclick = function () {
        var btn = document.getElementById('continue');
        if (btn) btn.style.display = 'none';
        if (window.splashContinue) window.splashContinue();
      };
    </script></body></html>`;
    void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    this.splashShownAt = Date.now();
    this.splashPercent = 0;
    splash.showInactive();
    splash.webContents.on('did-finish-load', () => {
      this.setSplashProgress(8, 'Abrindo Preseter…');
      if (this.startupScanActive) this.setSplashScanning(true);
    });
    splash.once('ready-to-show', () => {
      if (!splash.isDestroyed()) splash.showInactive();
    });
    splash.on('closed', () => {
      if (this.splash === splash) this.splash = null;
    });
    this.splash = splash;
    // Segurança: se algo travar, a splash não fica presa para sempre.
    setTimeout(() => {
      if (this.splash === splash) {
        this.backgroundScan = true;
        this.closeSplash();
      }
    }, 5 * 60 * 1000).unref();
  }

  private setSplashScanning(active: boolean): void {
    const splash = this.splash;
    if (!splash || splash.isDestroyed()) return;
    const script = `window.setSplashScanning && window.setSplashScanning(${active ? 'true' : 'false'})`;
    void splash.webContents.executeJavaScript(script).catch(() => undefined);
  }

  private maybeCloseSplash(): void {
    if (!this.rendererReady || (!this.startupScanDone && !this.backgroundScan)) return;
    this.setSplashProgress(100, 'Pronto');
    this.closeSplash();
  }

  private setSplashProgress(percent: number, message?: string): void {
    const splash = this.splash;
    if (!splash || splash.isDestroyed()) return;
    this.splashPercent = Math.max(
      this.splashPercent,
      Math.max(0, Math.min(100, percent))
    );
    const script = `window.setSplashProgress && window.setSplashProgress(${this.splashPercent}, ${JSON.stringify(message ?? '')})`;
    void splash.webContents.executeJavaScript(script).catch(() => undefined);
  }

  private closeSplash(): void {
    const splash = this.splash;
    if (!splash) return;
    const elapsed = Date.now() - this.splashShownAt;
    const delay = Math.max(0, 1500 - elapsed);
    setTimeout(() => {
      if (this.splash === splash && !splash.isDestroyed()) splash.close();
      if (this.splash === splash) this.splash = null;
    }, delay);
  }

  private windowBoundsPath(): string {
    return path.join(app.getPath('userData'), 'window-bounds.json');
  }

  /** Lê a última posição/tamanho da janela principal. */
  private loadWindowBounds(): Electron.Rectangle | undefined {
    try {
      const file = this.windowBoundsPath();
      if (!fs.existsSync(file)) return undefined;
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Electron.Rectangle;
      if (
        typeof data?.x === 'number' && typeof data?.y === 'number' &&
        typeof data?.width === 'number' && typeof data?.height === 'number'
      ) {
        // Reaproveita se a janela ainda tiver área visível numa tela conectada
        // (janelas maximizadas podem ter x/y negativos por causa da borda do SO).
        const width = Math.max(1200, Math.round(data.width));
        const height = Math.max(700, Math.round(data.height));
        const visible = screen.getAllDisplays().some((display) => {
          const area = display.workArea;
          const overlapX = Math.min(data.x + width, area.x + area.width) - Math.max(data.x, area.x);
          const overlapY = Math.min(data.y + height, area.y + area.height) - Math.max(data.y, area.y);
          return overlapX > 80 && overlapY > 80;
        });
        if (visible) return { x: Math.round(data.x), y: Math.round(data.y), width, height };
      }
    } catch { /* ignora */ }
    return undefined;
  }

  /** Salva a posição/tamanho da janela principal (arrastar/redimensionar). */
  private saveWindowBounds(bounds: Electron.Rectangle): void {
    try {
      const file = this.windowBoundsPath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      }), 'utf8');
    } catch { /* ignora */ }
  }

  private createWindow(): void {
    const saved = this.loadWindowBounds();
    this.window = new BrowserWindow({
      x: saved?.x,
      y: saved?.y,
      width: saved?.width ?? 1400,
      height: saved?.height ?? 900,
      minWidth: 1200,
      minHeight: 700,
      backgroundColor: '#111827',
      show: false,
      icon: this.iconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      title: 'Preseter - Live Performance',
    });
    // O app abre sempre maximizado; os bounds salvos valem para quando o
    // usuário restaurar a janela.
    this.window.maximize();

    // Carregar a interface
    const startUrl =
      process.env.ELECTRON_START_URL ||
      `file://${path.join(__dirname, '../renderer/index.html')}`;

    // Persistir posição e tamanho quando arrastado/redimensionado
    const saveOnMoveResize = () => {
      if (!this.window || this.window.isDestroyed()) return;
      const bounds = this.window.getBounds();
      this.saveWindowBounds(bounds);
    };
    this.window.on('resize', saveOnMoveResize);
    this.window.on('move', saveOnMoveResize);

    this.window.loadURL(startUrl);

    this.window.once('ready-to-show', () => {
      this.window?.show();
      this.setSplashProgress(20, 'Carregando interface…');
    });
    this.window.webContents.on('did-fail-load', () => {
      this.window?.show();
      this.closeSplash();
    });

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
    ipcMain.on('startup-progress', (_event, data?: { percent?: number; message?: string }) => {
      // Durante a varredura, a splash pertence ao scan de plugins.
      if (this.startupScanActive) return;
      this.setSplashProgress(Number(data?.percent ?? 0), data?.message);
    });
    ipcMain.on('startup-ready', () => {
      this.rendererReady = true;
      this.setSplashProgress(95, 'Finalizando…');
      this.maybeCloseSplash();
    });
    ipcMain.on('splash-continue', () => {
      this.backgroundScan = true;
      this.setSplashProgress(100, 'Continuando em segundo plano…');
      this.closeSplash();
    });

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
      const plugins = await this.scanWithPreferences();
      void this.vstPresetLibrary.scan(plugins, this.vstManager);
      return this.visiblePlugins(plugins);
    });

    ipcMain.handle('vst-scan-report', () => this.vstManager.getScanReport());

    // Descarta a lista acumulada no motor e escaneia tudo de novo.
    ipcMain.handle('vst-rescan', async () => {
      const plugins = await this.scanWithPreferences(true);
      void this.vstPresetLibrary.scan(plugins, this.vstManager);
      return this.visiblePlugins(plugins);
    });

    ipcMain.handle('vst-hide-plugin', (_event, idOrPath: string) => {
      const preferences = this.readPreferences();
      const hiddenPluginIds = Array.from(new Set([...preferences.hiddenPluginIds, String(idOrPath)]));
      this.writePreferences({ ...preferences, hiddenPluginIds });
      return { hiddenPluginIds, plugins: this.visiblePlugins(this.vstManager.getScannedPlugins()) };
    });

    ipcMain.handle('vst-show-plugin', (_event, idOrPath: string) => {
      const preferences = this.readPreferences();
      const hiddenPluginIds = preferences.hiddenPluginIds.filter((item) => item !== idOrPath);
      this.writePreferences({ ...preferences, hiddenPluginIds });
      return { hiddenPluginIds, plugins: this.visiblePlugins(this.vstManager.getScannedPlugins()) };
    });

    ipcMain.handle('vst-add-plugin-folder', async () => {
      if (!this.window) return { canceled: true, plugins: this.visiblePlugins(this.vstManager.getScannedPlugins()) };
      const result = await dialog.showOpenDialog(this.window, {
        title: 'Adicionar pasta de plugins (VST2/VST3)',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) {
        return { canceled: true, plugins: this.visiblePlugins(this.vstManager.getScannedPlugins()) };
      }
      const folder = result.filePaths[0];
      const preferences = this.readPreferences();
      const folders = Array.from(new Set([...preferences.pluginFolders, folder]));
      this.writePreferences({ ...preferences, pluginFolders: folders });
      this.watchVstFolders();
      const plugins = await this.vstManager.scanDirectories(folders);
      void this.vstPresetLibrary.scan(plugins, this.vstManager);
      return { canceled: false, folder, folders, plugins: this.visiblePlugins(plugins) };
    });

    ipcMain.handle('vst-remove-plugin-folder', async (_event, folder: string) => {
      const preferences = this.readPreferences();
      const folders = preferences.pluginFolders.filter((item) => item !== folder);
      this.writePreferences({ ...preferences, pluginFolders: folders });
      this.watchVstFolders();
      const plugins = await this.scanWithPreferences();
      void this.vstPresetLibrary.scan(plugins, this.vstManager);
      return { folders, plugins: this.visiblePlugins(plugins) };
    });


    ipcMain.handle('vst-presets-list', () => {
      return this.vstPresetLibrary.listResult();
    });

    ipcMain.handle('vst-presets-rescan', async () => {
      const plugins = await this.scanWithPreferences();
      await this.vstPresetLibrary.scan(plugins, this.vstManager, true);
      return this.vstPresetLibrary.listResult();
    });

    ipcMain.handle('vst-presets-apply', async (_event, presetId: string, layerId: string) => {
      return this.vstPresetLibrary.applyPreset(presetId, layerId, this.vstManager);
    });

    ipcMain.handle('vst-presets-snapshot', async (_event, payload: { layerId: string; name: string; category?: string }) => {
      const plugin = this.vstManager.getLoadedPlugins().find((item) => item.layerId === payload.layerId);
      if (!plugin) throw new Error('O layer selecionado não está carregado.');
      return this.vstPresetLibrary.saveSnapshot({
        layerId: payload.layerId,
        plugin,
        name: payload.name,
        category: payload.category,
        vst: this.vstManager,
      });
    });

    ipcMain.handle('vst-presets-update', (_event, presetId: string, patch: { category?: string; favorite?: boolean }) => {
      return this.vstPresetLibrary.updatePreset(presetId, patch);
    });

    ipcMain.handle('vst-presets-delete', (_event, presetId: string) => {
      return this.vstPresetLibrary.deletePreset(presetId);
    });

    ipcMain.handle(
      'vst-presets-export',
      async (_event, payload: { layerId: string; name?: string }) => {
        const plugin = this.vstManager
          .getLoadedPlugins()
          .find((item) => item.layerId === payload.layerId);
        if (!plugin) throw new Error('O timbre selecionado não está carregado.');
        if (plugin.format !== 'VST3') {
          throw new Error('Exportar .vstpreset só funciona em plugins VST3.');
        }

        const root = path.join(app.getPath('documents'), 'VST3 Presets');
        fs.mkdirSync(root, { recursive: true });
        const baseName =
          (payload.name ?? plugin.name).replace(/[<>:"/\\|?*]/g, '_').trim() || 'Preset';
        const result = await dialog.showSaveDialog(this.window!, {
          title: 'Exportar preset VST3',
          defaultPath: path.join(root, `${baseName}.vstpreset`),
          filters: [{ name: 'Preset VST3', extensions: ['vstpreset'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (result.canceled || !result.filePath) return { canceled: true, path: null };

        const filePath = result.filePath.toLowerCase().endsWith('.vstpreset')
          ? result.filePath
          : `${result.filePath}.vstpreset`;
        await this.vstManager.savePresetFile(payload.layerId, filePath);
        return { canceled: false, path: filePath };
      }
    );

    ipcMain.handle('vst-presets-import', async (_event, payload: { layerId: string }) => {
      const plugin = this.vstManager
        .getLoadedPlugins()
        .find((item) => item.layerId === payload.layerId);
      if (!plugin) throw new Error('O timbre selecionado não está carregado.');
      if (plugin.format !== 'VST3') {
        throw new Error('Importar .vstpreset só funciona em plugins VST3.');
      }

      const result = await dialog.showOpenDialog(this.window!, {
        title: 'Importar preset VST3',
        properties: ['openFile'],
        filters: [{ name: 'Preset VST3', extensions: ['vstpreset'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, preset: null };
      }

      const preset = this.vstPresetLibrary.importPresetFile(result.filePaths[0], plugin);
      return { canceled: false, preset };
    });

    ipcMain.handle(
      'vst-presets-generate-fxp',
      async (
        _event,
        payload: { layerId: string; mode: 'current' | 'all'; name?: string; bank?: 'all' | 'A' | 'B' | 'C' }
      ) => {
        const plugin = this.vstManager
          .getLoadedPlugins()
          .find((item) => item.layerId === payload.layerId);
        if (!plugin) throw new Error('O timbre selecionado não está carregado.');
        if (plugin.format !== 'VST') {
          throw new Error('Gerar .fxp só funciona em plugins VST2.');
        }

        if (payload.mode === 'all' && /fsvr/i.test(plugin.name)) {
          return this.generateFsvrBanks(plugin, payload.bank ?? 'all');
        }

        const safe = (value: string) =>
          value.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim() || 'Preset';
        const root = path.join(
          app.getPath('documents'),
          'Preseter',
          'Presets',
          safe(plugin.name)
        );
        fs.mkdirSync(root, { recursive: true });

        const files: string[] = [];
        const originalProgram = plugin.program ?? 0;
        const writeCurrent = async (name: string) => {
          const filePath = path.join(root, `${safe(name)}.fxp`);
          await this.vstManager.saveVst2FxpFile(payload.layerId, filePath);
          files.push(filePath);
        };

        if (payload.mode === 'all' && (plugin.programCount ?? 1) > 1) {
          const list = await this.vstManager
            .scanPluginPrograms(plugin.id)
            .catch(() => ({ programs: [] as { index: number; name: string }[] }));
          const count = Math.max(plugin.programCount ?? 0, list.programs.length);
          for (let index = 0; index < count; index += 1) {
            await this.vstManager.setPluginProgram(payload.layerId, index);
            await new Promise((resolve) => setTimeout(resolve, 80));
            const name =
              list.programs.find((program) => program.index === index)?.name ??
              `Program ${index + 1}`;
            await writeCurrent(`${String(index + 1).padStart(3, '0')} - ${name}`);
          }
          await this.vstManager.setPluginProgram(payload.layerId, originalProgram);
        } else {
          await writeCurrent(payload.name?.trim() || plugin.name);
        }

        this.vstPresetLibrary.refreshPresetFiles(this.vstManager.getScannedPlugins());
        return { folder: root, files, count: files.length, canceled: false };
      }
    );

    ipcMain.handle('vst-presets-generate-fxp-cancel', () => {
      this.fxpCancelRequested = true;
      return true;
    });

    ipcMain.handle('vst-load', async (_event, pluginPath: string, layerId?: string, minNote?: number, maxNote?: number, pinned?: boolean) => {
      const loaded = await this.vstManager.loadPlugin(pluginPath, layerId, minNote, maxNote, pinned === true);
      // Todo layer novo entra direto no Master do Patch (Output 1 interno).
      if (loaded.layerId) {
        try {
          await this.vstManager.setLayerOutput(loaded.layerId, 1);
        } catch (error) {
          console.warn('[Preseter] Não foi possível rotear o layer para o Master do Patch:', error);
        }
      }
      return loaded;
    });

    ipcMain.handle('vst-unload', async (_event, pluginId: string) => {
      const plugin = this.vstManager
        .getLoadedPlugins()
        .find((item) => item.layerId === pluginId || item.id === pluginId);
      const isLv2 = plugin?.format === 'LV2';
      let restartAudio = false;
      if (isLv2) {
        try {
          const devices = await this.vstManager.getAudioDevices();
          restartAudio = devices.running;
          if (restartAudio) await this.vstManager.stopAudio();
        } catch (error) {
          console.warn('[Preseter] Não foi possível parar o áudio antes de descarregar o LV2:', error);
          restartAudio = false;
        }
      }
      try {
        return await this.vstManager.unloadPlugin(pluginId);
      } finally {
        if (restartAudio) {
          try {
            await this.vstManager.startAudio(this.readAudioSettings());
          } catch (error) {
            console.warn('[Preseter] Não foi possível reiniciar o áudio após descarregar o LV2:', error);
          }
        }
      }
    });

    ipcMain.handle('vst-set-param', (_event, pluginId: string, paramId: string, value: number, slot?: number) => {
      return this.vstManager.setParameter(pluginId, paramId, value, slot);
    });
    ipcMain.handle('vst-params', (_event, ownerId: string, slot?: number) => {
      return this.vstManager.getParameters(ownerId, slot);
    });

    ipcMain.handle('collection-status', () => this.collectionInstaller.status(COLLECTION_CATALOG.items));

    ipcMain.handle('collection-download', async (_event, ids: string[], force?: boolean) => {
      const selected = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
      const result = await this.collectionInstaller.install(COLLECTION_CATALOG.items, selected, force === true);
      const byId = new Map(result.statuses.map((item) => [item.id, item]));
      const statuses = this.collectionInstaller
        .status(COLLECTION_CATALOG.items)
        .map((item) => byId.get(item.id) ?? item);
      return {
        ok: result.summary.failed === 0 && result.summary.cancelled === 0,
        statuses,
        summary: result.summary,
      };
    });

    ipcMain.handle('collection-cancel', () => {
      this.collectionInstaller.cancel();
      return true;
    });

    ipcMain.handle('collection-open-folder', async (_event, kind?: 'sounds' | 'plugins') => {
      const folder = kind === 'plugins'
        ? path.join(process.env.LOCALAPPDATA ?? app.getPath('home'), 'Programs', 'Common', 'VST3')
        : this.soundsFolder();
      fs.mkdirSync(folder, { recursive: true });
      const error = await shell.openPath(folder);
      return error === '';
    });

    ipcMain.handle('collection-open-installer', async (_event, filePath: string) => {
      if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return false;
      const error = await shell.openPath(filePath);
      return error === '';
    });

    ipcMain.handle('collection-generate', async () => {
      let plugins = this.vstManager.getScannedPlugins();
      if (plugins.length === 0) {
        try {
          plugins = await this.vstManager.scanDefaultDirectories();
        } catch (error) {
          console.warn('[Preseter] Não foi possível escanear os plugins da coleção:', error);
        }
      }
      const { file, skipped, missing } = buildCollectionConcert(plugins, {
        tempo: 100,
        soundsFolder: this.soundsFolder(),
      });
      const result = await dialog.showSaveDialog({
        title: 'Salvar concert da coleção',
        defaultPath: path.join(app.getPath('documents'), 'Colecao.preseter'),
        filters: [{ name: 'Concert do Preseter', extensions: ['preseter'] }],
      });
      if (result.canceled || !result.filePath) return null;
      fs.writeFileSync(result.filePath, serializeConcertFile(file), 'utf8');
      return {
        path: result.filePath,
        sets: file.sets.length,
        patches: file.patches.length,
        skipped,
        missing,
      };
    });

    ipcMain.handle('vst-get-state', (_event, pluginId: string) => {
      return this.vstManager.getPluginState(pluginId);
    });

    ipcMain.handle('vst-set-state', (_event, pluginId: string, state: any) => {
      return this.vstManager.setPluginState(pluginId, state);
    });

    ipcMain.handle('vst-open-editor', async (_event, pluginId: string) => {
      try {
        return await this.vstManager.openPluginEditor(pluginId);
      } catch {
        // Plugins sem interface gráfica não têm editor; o renderer mostra o aviso.
        return false;
      }
    });

    ipcMain.handle('vst-close-editor', (_event, pluginId: string) => {
      return this.vstManager.closePluginEditor(pluginId);
    });

    ipcMain.handle('vst-list', () => {
      return this.visiblePlugins(this.vstManager.getScannedPlugins());
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
    ipcMain.handle('vst-set-arp', (_event, layerId: string, settings: ArpSettings) => {
      return this.vstManager.setArp(layerId, settings);
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

    ipcMain.handle('record-start', async (): Promise<RecordingResult> => {
      if (this.pendingRecording) {
        return { ok: false, error: 'Já existe uma gravação em andamento.' };
      }
      const preferences = this.readPreferences();
      const format = preferences.recordingFormat;
      const extension = recordingExtension(format);
      const folder = this.defaultRecordingFolder();
      try {
        fs.mkdirSync(folder, { recursive: true });
      } catch {
        /* a pasta configurada pode ser inválida; o diálogo ainda permite escolher outra */
      }
      const result = await dialog.showSaveDialog(this.window!, {
        title: 'Gravar saída do concert',
        defaultPath: path.join(folder, recordingFileName(format)),
        filters: [recordingFilter(format)],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { ok: false };

      const chosen = result.filePath;
      const finalPath = chosen.toLowerCase().endsWith(`.${extension}`) ? chosen : `${chosen}.${extension}`;
      try {
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      } catch {
        return { ok: false, error: 'Não foi possível criar a pasta da gravação.' };
      }

      const tempPath = format === 'wav'
        ? undefined
        : path.join(app.getPath('temp'), `preseter-recording-${Date.now()}.wav`);
      const started = await this.vstManager.startRecording(tempPath ?? finalPath);
      if (!started) return { ok: false, error: 'O motor não iniciou a gravação.' };

      this.pendingRecording = {
        format,
        bitrate: preferences.recordingBitrate,
        finalPath,
        tempPath,
      };
      return { ok: true, path: finalPath };
    });

    ipcMain.handle('record-stop', async (): Promise<RecordingResult> => {
      const pending = this.pendingRecording;
      this.pendingRecording = null;
      if (!pending) {
        return { ok: false, error: 'Nenhuma gravação em andamento.' };
      }

      let stopped = false;
      try {
        stopped = await this.vstManager.stopRecording();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao parar a gravação.';
        return { ok: false, error: message, path: pending.tempPath ?? pending.finalPath };
      }
      if (!stopped) {
        return { ok: false, error: 'O motor não finalizou a gravação.' };
      }

      // WAV: o motor já gravou direto no caminho final.
      if (!pending.tempPath) return { ok: true, path: pending.finalPath };

      const conversion = await convertRecording(
        pending.tempPath,
        pending.finalPath,
        pending.format as Exclude<RecordingFormat, 'wav'>,
        pending.bitrate
      );
      if (!conversion.ok) {
        return {
          ok: false,
          error: `${conversion.error ?? 'Falha ao converter a gravação.'} O WAV temporário foi mantido em ${pending.tempPath}.`,
          path: pending.tempPath,
        };
      }
      try {
        fs.rmSync(pending.tempPath, { force: true });
      } catch {
        /* o arquivo temporário pode já ter sido removido */
      }
      return { ok: true, path: pending.finalPath };
    });

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

    ipcMain.handle('pan-law-set', (_event, db: number, compensated: boolean) => {
      return this.vstManager.setPanLaw(db, compensated);
    });

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
    ipcMain.handle('vst-insert-open-editor', async (_event, layerId: string, slot: number) => {
      try {
        return await this.vstManager.openInsertEditor(layerId, slot);
      } catch {
        // Efeitos sem editor gráfico: não deixa o erro virar stack trace no Electron.
        return false;
      }
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
    ipcMain.handle('vst-set-patch-send', (_event, aux: number, levelDb: number) => {
      return this.vstManager.setPatchSend(aux, levelDb);
    });
    ipcMain.handle('vst-set-layer-patch-send', (_event, layerId: string, levelDb: number) => {
      return this.vstManager.setLayerPatchSend(layerId, levelDb);
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

    ipcMain.handle('performance-mode-get', () => {
      this.performanceMode.refresh();
      return this.performanceMode.getStatus();
    });

    ipcMain.handle('performance-mode-set', (_event, enabled: unknown) => {
      const value = enabled === true;
      const preferences = { ...this.readPreferences(), performanceMode: value };
      this.writePreferences(preferences);
      return this.performanceMode.setEnabled(value);
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

    ipcMain.handle('concert-new', async (_event, templateId?: string) => {
      let plugins = this.vstManager.getScannedPlugins();
      if (templateId === 'fullset' && plugins.length === 0) {
        try {
          plugins = await this.scanWithPreferences();
        } catch (error) {
          console.warn('[Preseter] Não foi possível escanear os plugins do Full Set:', error);
        }
      }
      return this.concertManager.newConcert(templateId, {
        plugins,
        soundsFolder: this.soundsFolder(),
      });
    });

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
        filters: [{ name: 'Plugins VST', extensions: ['vst3', 'dll', 'vst', 'so'] }],
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
    const settings = { ...normalizeAudioInput(current?.audioInput), output: 1 };
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

  private loadPreset(presetId: string): Promise<boolean> {
    // Duas chamadas para o mesmo patch (ex.: auto-seleção + clique) compartilham
    // a mesma carga em vez de tentarem carregar os mesmos layerIds em paralelo.
    if (this.patchLoadInFlight?.id === presetId) {
      return this.patchLoadInFlight.promise;
    }

    const run = this.patchLoadQueue.then(
      () => this.loadPresetNow(presetId),
      () => this.loadPresetNow(presetId)
    );
    this.patchLoadInFlight = { id: presetId, promise: run };
    this.patchLoadQueue = run.then(() => undefined, () => undefined);
    void run.finally(() => {
      if (this.patchLoadInFlight?.promise === run) this.patchLoadInFlight = null;
    }).catch(() => undefined);
    return run;
  }

  private async loadPresetNow(presetId: string): Promise<boolean> {
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
      // Timbre MIDI externo: não carrega plugin nem entra no grafo de áudio.
      if (assignment.externalMidi) continue;
      this.sendToRenderer('preset-load-progress', {
        presetId: preset.id,
        current: index + 1,
        total: assignments.length,
        name: assignment.name,
        phase: 'loading',
      });
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
      } else {
        // Sonoplastia inicial do fullset/coleção: SoundFont + programa do layer.
        if (assignment.samplePath) {
          try {
            const samplePath = path.isAbsolute(assignment.samplePath)
              ? assignment.samplePath
              : path.join(this.soundsFolder(), assignment.samplePath);
            await this.vstManager.loadSoundFont(layerId, samplePath, assignment.programIndex);
          } catch (error) {
            console.warn(`[Preseter] Não foi possível carregar o SoundFont do layer "${layerId}":`, error);
          }
        }
        if (!assignment.samplePath && assignment.programIndex !== undefined) {
          try {
            await this.vstManager.setPluginProgram(layerId, assignment.programIndex);
          } catch (error) {
            console.warn(`[Preseter] Não foi possível aplicar o programa do layer "${layerId}":`, error);
          }
        }
      }
    }

    await this.vstManager.commitPatchSwap(silencePrevious);
    await this.applyCurrentTranspose(preset);
    await this.applyCurrentAudioInput(preset);
    // Faixa de velocity por layer (Fase 3.4).
    for (const [index, assignment] of assignments.entries()) {
      const layerId = assignment.layerId ?? `${preset.id}:layer:${index}`;
      if (assignment.externalMidi) continue;
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
      if (assignment.externalMidi) continue;
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
      if (assignment.externalMidi) continue;
      try {
        // Todos os layers vão para o Master do Patch (bus interno do patch).
        await this.vstManager.setLayerOutput(layerId, 1);
        await this.vstManager.setLayerPatchSend(layerId, assignment.patchSendDb ?? 0);
        await this.vstManager.setArp(layerId, { ...DEFAULT_ARP, ...assignment.arp });
        // Aux desativado: nenhum layer manda send.
        for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
          await this.vstManager.setSend(layerId, aux, SEND_OFF_DB);
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
    // o estado dos efeitos guardado neste patch (Fase 3.2). Em patches antigos,
    // o Output 1 era o Master do Patch: os inserts dele migram para o bus do
    // patch e o Output 1 fica em unidade para não processar o efeito duas vezes.
    await this.applyConcertBuses(preset.master === undefined ? ['output1'] : []);
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

    // O bus do patch é o Master do Patch: sobrepõe o barramento do concert com
    // a cadeia e o mix salvos neste patch (Master do Patch como bus).
    await this.applyPatchMaster(preset);

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

  /** Master do patch; patches antigos usam o Output 1 do concert como fallback. */
  private patchMaster(preset: Preset): PatchMasterSettings {
    if (preset.master) return preset.master;
    const output1 = this.concertManager.getState().settings.buses?.outputs?.[0];
    return {
      volumeDb: output1?.volumeDb ?? 0,
      pan: output1?.pan ?? 0,
      muted: output1?.muted ?? false,
      inserts: output1?.inserts ?? [],
      sends: Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB),
    };
  }

  /** Aplica no motor o Master do Patch, sempre no bus próprio do patch. */
  private async applyPatchMaster(preset: Preset): Promise<void> {
    const master = this.patchMaster(preset);
    const inserts = [...(master.inserts ?? [])].sort((a, b) => a.slot - b.slot);
    await this.alignInserts('patch', inserts);
    try {
      await this.vstManager.setBusMix('patch', {
        volumeDb: master.volumeDb,
        pan: master.pan,
        muted: master.muted,
        output: 1,
      });
    } catch (error) {
      console.warn('[Preseter] Não foi possível ajustar o Master do Patch:', error);
    }
    for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
      try {
        await this.vstManager.setPatchSend(aux, master.sends?.[aux - 1] ?? SEND_OFF_DB);
      } catch (error) {
        console.warn(`[Preseter] Não foi possível ajustar o send do Master do Patch para o Aux ${aux}:`, error);
      }
    }
    for (const insert of inserts) {
      // Patches antigos guardavam o estado do Master como `insert_output1_*`.
      const saved = preset.vstStates[`insert_patch_${insert.slot}`]
        ?? preset.vstStates[`insert_output1_${insert.slot}`];
      if (typeof saved?.data !== 'string') continue;
      try {
        await this.vstManager.setInsertState('patch', insert.slot, saved.data);
      } catch (error) {
        console.warn(`[Preseter] Não foi possível restaurar o efeito do Master do Patch:`, error);
      }
    }
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
  private async applyConcertBuses(legacyMasterOutputs: string[] = []): Promise<void> {
    for (const { id, bus } of this.concertBusList()) {
      const isLegacyMaster = legacyMasterOutputs.includes(id);
      await this.alignInserts(id, isLegacyMaster ? [] : bus.inserts);
      try {
        await this.vstManager.setBusMix(id, isLegacyMaster
          ? { volumeDb: 0, pan: 0, muted: false, output: 1 }
          : {
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
        // Strips herdados também entram no Master do Patch.
        await this.vstManager.setLayerOutput(strip.id, 1);
        await this.vstManager.setLayerPatchSend(strip.id, 0);
        await this.vstManager.setArp(strip.id, DEFAULT_ARP);
        for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
          await this.vstManager.setSend(strip.id, aux, SEND_OFF_DB);
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
   * Prepara o concert inicial: migra os dados do modelo antigo na primeira
   * execução da Fase 2, ou começa vazio.
   * Não reabre o último concert para oferecer o seletor de templates.
   */
  private initConcert(legacy: LegacyConcertPayload): ConcertState {
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

    // Usa o template vazio como padrão inicial. O usuário pode escolher outro
    // ao criar um novo concert pelo seletor de templates.
    return this.concertManager.newConcert('vazio');
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
      ? [
          ...recent.map((entry) => ({
            label: entry.name,
            toolTip: entry.path,
            click: () => this.sendMenuAction({ action: 'open-recent', path: entry.path }),
          })),
          { type: 'separator' },
          {
            label: 'Limpar lista de recentes',
            click: () => {
              this.concertManager.clearRecent();
              this.buildMenu();
            },
          },
        ]
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

  /** Pastas que o app sempre varre: padrões do sistema + extras do usuário. */
  private pluginScanFolders(): string[] {
    const seen = new Set<string>();
    return [...standardVst3Folders(), ...this.readPreferences().pluginFolders]
      .map((folder) => folder.trim())
      .filter((folder) => {
        if (!folder) return false;
        const key = folder.toLowerCase().replace(/[\\/]+$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private async scanWithPreferences(rescan = false): Promise<VstPluginInfo[]> {
    const folders = this.pluginScanFolders();
    if (rescan) return this.vstManager.rescan(folders);
    return this.vstManager.scanDirectories(folders);
  }

  /** Remove da lista os plugins ocultados pelo usuário (id ou caminho). */
  private visiblePlugins(plugins: VstPluginInfo[]): VstPluginInfo[] {
    const hidden = new Set(this.readPreferences().hiddenPluginIds);
    if (hidden.size === 0) return plugins;
    return plugins.filter((plugin) => !hidden.has(plugin.id) && !hidden.has(plugin.path));
  }

  /**
   * FSVR: percorre os bancos internos via MIDI (CC0=63, CC32=65..67 e PC 0..127)
   * e captura um .fxp de cada performance.
   */
  private async generateFsvrBanks(
    plugin: VstPluginInfo,
    bank: 'all' | 'A' | 'B' | 'C'
  ): Promise<{
    folder: string;
    files: string[];
    count: number;
    canceled: boolean;
    warning?: string;
  }> {
    const safe = (value: string) =>
      value.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim() || 'Performance';
    const root = path.join(
      app.getPath('documents'),
      'Preseter',
      'Presets',
      safe(plugin.name)
    );
    fs.mkdirSync(root, { recursive: true });
    const layerId = plugin.layerId;
    if (!layerId) throw new Error('O timbre do FSVR não está carregado.');

    const bankMap = { A: 65, B: 66, C: 67 } as const;
    const banks = bank === 'all'
      ? ([['A', bankMap.A], ['B', bankMap.B], ['C', bankMap.C]] as const)
      : ([[bank, bankMap[bank]]] as const);
    const total = banks.length * 128;
    const files: string[] = [];
    const hashes = new Set<string>();
    let canceled = false;

    const devices = await this.vstManager.getAudioDevices();
    if (!devices.running) {
      try {
        await this.vstManager.startAudio({ outputs: 2, inputs: 0 });
      } catch {
        throw new Error('Inicie o áudio antes de gerar os bancos do FSVR.');
      }
    }

    const disabledMidi: string[] = [];
    const originalTargetState = await this.vstManager.getPluginState(layerId).catch(() => null);
    for (const loaded of this.vstManager.getLoadedPlugins()) {
      if (!loaded.layerId || loaded.layerId === layerId) continue;
      try {
        await this.vstManager.setLayerMidiEnabled(loaded.layerId, false);
        disabledMidi.push(loaded.layerId);
      } catch {
        // Se um layer não aceitar o controle, segue sem ele.
      }
    }

    this.fxpCancelRequested = false;
    let current = 0;

    try {
      outer: for (const [label, lsb] of banks) {
        await this.vstManager.sendMidi([0xb0, 0, 63]);
        await this.vstManager.sendMidi([0xb0, 32, lsb]);
        await new Promise((resolve) => setTimeout(resolve, 150));

        for (let program = 0; program < 128; program += 1) {
          if (this.fxpCancelRequested) {
            canceled = true;
            break outer;
          }

          await this.vstManager.sendMidi([0xc0, program]);
          await new Promise((resolve) => setTimeout(resolve, 220));

          const stub = `${label}${String(program + 1).padStart(3, '0')}`;
          const tempPath = path.join(root, `_tmp_${stub}.fxp`);
          await this.vstManager.saveVst2FxpFile(layerId, tempPath);

          const data = fs.readFileSync(tempPath);
          hashes.add(createHash('md5').update(data).digest('hex'));
          const headerName = data
            .toString('utf8', 28, 56)
            .replace(/\0.*$/, '')
            .trim();
          const name =
            headerName && !/^default$/i.test(headerName)
              ? headerName
              : `Performance ${program + 1}`;
          const finalPath = path.join(root, `${stub} - ${safe(name)}.fxp`);
          fs.renameSync(tempPath, finalPath);
          files.push(finalPath);
          current += 1;
          this.sendToRenderer('vst-presets-fxp-progress', {
            current,
            total,
            name: `${stub} - ${name}`,
          });
        }
      }
    } finally {
      // Devolve o FSVR ao som original e reativa o MIDI dos outros layers.
      if (originalTargetState?.data) {
        try {
          await this.vstManager.applyRawState(layerId, originalTargetState.data);
        } catch (error) {
          console.warn('[Preseter] Não foi possível restaurar o FSVR após gerar .fxp:', error);
        }
      }
      for (const disabledId of disabledMidi) {
        try {
          await this.vstManager.setLayerMidiEnabled(disabledId, true);
        } catch {
          // Ignora: o layer pode ter sido removido durante a geração.
        }
      }
      this.vstPresetLibrary.refreshPresetFiles(this.vstManager.getScannedPlugins());
    }

    return {
      folder: root,
      files,
      count: files.length,
      canceled,
      warning:
        files.length > 0 && hashes.size === 1
          ? 'O FSVR não respondeu aos Program Changes: todos os arquivos ficaram iguais.'
          : undefined,
    };
  }

  private async initializeEngine(): Promise<void> {
    this.setSplashProgress(25, 'Iniciando motor de áudio…');
    const saved = this.readAudioSettings();
    if (saved.enabled) {
      try {
        await this.vstManager.startAudio(saved);
      } catch (error) {
        console.warn('[Preseter] Não foi possível restaurar a configuração de áudio:', error);
      }
    }

    this.startupScanActive = true;
    this.startupScanDone = false;
    this.backgroundScan = false;
    this.setSplashScanning(true);

    let scanned = 0;
    let lastProgressAt = 0;
    const onScanProgress = (plugin: string) => {
      scanned += 1;
      const now = Date.now();
      if (now - lastProgressAt < 80) return;
      lastProgressAt = now;
      const percent = 40 + Math.round(45 * (1 - Math.exp(-scanned / 40)));
      this.setSplashProgress(percent, `Escaneando: ${plugin || 'plugin'} (${scanned})`);
    };
    this.vstManager.on('scan-progress', onScanProgress);

    try {
      this.setSplashProgress(32, 'Lendo plugins em cache…');
      try {
        const known = await this.vstManager.loadKnownPlugins();
        if (known.length > 0) {
          this.setSplashProgress(38, `Plugins em cache (${known.length})`);
        }
      } catch (error) {
        console.warn('[Preseter] Não foi possível ler o cache de plugins:', error);
      }

      this.setSplashProgress(40, 'Escaneando plugins…');
      const plugins = await this.scanWithPreferences();
      this.setSplashProgress(88, `${plugins.length} plugin(s) encontrado(s).`);
      void this.vstPresetLibrary.scan(plugins, this.vstManager);
    } catch (error) {
      console.warn('[Preseter] Falha no scan inicial de VSTs:', error);
      this.setSplashProgress(88, 'Falha ao escanear plugins. Continuando…');
    } finally {
      this.vstManager.off('scan-progress', onScanProgress);
      this.startupScanActive = false;
      this.startupScanDone = true;
      this.setSplashScanning(false);
      this.watchVstFolders();
      this.performanceMode.refresh();
      this.maybeCloseSplash();
    }
  }

  /** Observa as pastas de VST3/LV2/presets para indexar plugins instalados com o app aberto. */
  private watchVstFolders(): void {
    this.closeVstWatchers();
    const candidates = [
      ...standardVst3Folders(),
      ...standardLv2Folders(),
      ...presetWatchFolders(),
      ...this.readPreferences().pluginFolders,
    ];
    for (const dir of new Set(candidates)) {
      if (!fs.existsSync(dir)) continue;
      try {
        const watcher = fs.watch(dir, { recursive: true }, () => this.scheduleVstRefresh());
        watcher.on('error', (error) => console.warn(`[Preseter] Watcher de VST falhou em ${dir}:`, error));
        this.vstWatchers.push(watcher);
      } catch (error) {
        // Alguns sistemas não permitem watch recursivo: o botão "Reescanear" cobre esse caso.
        console.warn(`[Preseter] Não foi possível observar ${dir}:`, error);
      }
    }
  }

  private closeVstWatchers(): void {
    for (const watcher of this.vstWatchers) {
      try { watcher.close(); } catch { /* ignora */ }
    }
    this.vstWatchers = [];
  }

  private scheduleVstRefresh(): void {
    this.vstRefreshPending = true;
    if (this.vstWatchTimer) clearTimeout(this.vstWatchTimer);
    this.vstWatchTimer = setTimeout(() => {
      this.vstWatchTimer = null;
      this.vstRefreshPending = false;
      void (async () => {
        try {
          const plugins = await this.scanWithPreferences();
          await this.vstPresetLibrary.scan(plugins, this.vstManager);
        } catch (error) {
          console.warn('[Preseter] Falha ao reindexar VSTs após mudança nas pastas:', error);
        } finally {
          if (this.vstRefreshPending) this.scheduleVstRefresh();
        }
      })();
    }, 2500);
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

  private soundsFolder(): string {
    const preferences = this.readPreferences();
    return preferences.soundsFolder?.trim() || path.join(app.getPath('home'), 'PreseterSons');
  }

  /** Pasta das gravações: preferência do usuário ou Música (fallback Documentos). */
  private defaultRecordingFolder(): string {
    const configured = this.readPreferences().recordingFolder?.trim();
    if (configured) return configured;
    try {
      return app.getPath('music');
    } catch {
      return app.getPath('documents');
    }
  }

  private readPreferences(): AppPreferences {
    const defaults: AppPreferences = {
      silencePreviousPatch: false,
      pluginFolders: [],
      hiddenPluginIds: [],
      scrollSpeed: 'slow',
      soundsFolder: path.join(app.getPath('home'), 'PreseterSons'),
      recordingFormat: 'wav',
      recordingBitrate: 320,
      recordingFolder: '',
      externalMidiEnabled: false,
      computerKeyboardMidi: false,
      performanceMode: false,
    };
    try {
      if (!fs.existsSync(this.preferencesPath)) return defaults;
      const data: unknown = JSON.parse(fs.readFileSync(this.preferencesPath, 'utf8'));
      if (!data || typeof data !== 'object') throw new TypeError('O arquivo de preferências precisa conter um objeto.');
      const saved = data as Partial<AppPreferences>;
      return {
        ...defaults,
        ...saved,
        silencePreviousPatch: saved.silencePreviousPatch === true,
        pluginFolders: Array.isArray(saved.pluginFolders)
          ? saved.pluginFolders.filter((folder): folder is string => typeof folder === 'string' && folder.trim() !== '')
          : [],
        hiddenPluginIds: Array.isArray(saved.hiddenPluginIds)
          ? saved.hiddenPluginIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
          : [],
        scrollSpeed: saved.scrollSpeed === 'normal' || saved.scrollSpeed === 'slower'
          ? saved.scrollSpeed
          : 'slow',
        soundsFolder: typeof saved.soundsFolder === 'string' && saved.soundsFolder.trim() !== ''
          ? saved.soundsFolder
          : defaults.soundsFolder,
        recordingFormat: saved.recordingFormat === 'mp3' || saved.recordingFormat === 'flac'
          ? saved.recordingFormat
          : 'wav',
        recordingBitrate: saved.recordingBitrate === 128
          || saved.recordingBitrate === 192
          || saved.recordingBitrate === 320
          ? saved.recordingBitrate
          : 320,
        recordingFolder: typeof saved.recordingFolder === 'string' && saved.recordingFolder.trim() !== ''
          ? saved.recordingFolder
          : '',
        externalMidiEnabled: saved.externalMidiEnabled === true,
        computerKeyboardMidi: saved.computerKeyboardMidi === true,
        performanceMode: saved.performanceMode === true,
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
    const midiPermission = (permission: string) => permission === 'midi' || permission === 'midiSysex';
    appSession.setPermissionCheckHandler((webContents, permission) => {
      return midiPermission(permission) && webContents === this.window?.webContents;
    });
    appSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(midiPermission(permission) && webContents === this.window?.webContents);
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
