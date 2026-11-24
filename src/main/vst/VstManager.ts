import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type {
  EngineInsertState,
  EngineLoadedPlugin,
  EngineParameter,
  EnginePluginInfo,
} from '../../shared/engine-protocol';
import type {
  AudioDeviceSnapshot,
  AudioInputSettings,
  AudioInputState,
  AudioStartOptions,
  ArpSettings,
  BusMixUpdate,
  EngineArpState,
  EngineBusState,
  EngineDrumPattern,
  EngineDrumsState,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  MidiThruBlock,
  PlaybackState,
  VstParameter,
  VstPluginInfo,
  VstScanReport,
} from '../../shared/types';
import { EngineProcess } from './EngineProcess';

/**
 * Plugins sem estado nativo (LV2) são salvos como snapshot de parâmetros.
 * O prefixo distingue o snapshot de um chunk base64 do plugin.
 */
const PARAM_SNAPSHOT_PREFIX = 'params-base64:';

const isParameterSnapshot = (data: string): boolean =>
  typeof data === 'string' && data.startsWith(PARAM_SNAPSHOT_PREFIX);

export class VstManager extends EventEmitter {
  private readonly engine: EngineProcess;
  private scannedPlugins: VstPluginInfo[] = [];
  private loadedPlugins = new Map<string, VstPluginInfo>();
  /** Fila para serializar cargas concorrentes de plugins. */
  private loadQueue: Promise<unknown> = Promise.resolve();
  /** Pasta dos .sy1 de fábrica usados pelos programas internos do Synth2. */
  private synth2FactoryDir = '';
  /** Pastas de presets .xiz do Preseter Zyn (fábrica e usuário). */
  private zynBankDir = '';
  private zynUserDir = '';
  /** Serializa varreduras de VST3 (startup, watcher e botão manual). */
  private scanPromise: Promise<VstPluginInfo[]> | null = null;
  private scanReport: VstScanReport = {
    count: 0,
    failed: [],
    blacklisted: [],
    paths: [],
    scannedAt: 0,
  };

  constructor(
    engine: EngineProcess = new EngineProcess(),
    /** Pasta dos plugins empacotados com o app (aparecem como nativos do Preseter). */
    private readonly bundledFolder: string | null = null,
    /** Usa a configuração salva do app quando um plugin precisa iniciar o áudio. */
    private readonly ensureAudio?: () => Promise<AudioDeviceSnapshot>
  ) {
    super();
    this.engine = engine;
    this.engine.on('crashed', (error: Error) => {
      // O motor reinicia vazio: o que estava carregado deixou de existir.
      this.loadedPlugins.clear();
      this.emit('engine-crashed', error);
    });
    this.engine.on('scan-progress', (plugin: string) => this.emit('scan-progress', plugin));
  }

  /** Serializa cargas de plugin: nunca roda duas ao mesmo tempo. */
  private enqueueLoad<T>(task: () => Promise<T>): Promise<T> {
    const run = this.loadQueue.then(task, task);
    this.loadQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  /** Informa de onde o motor lê os programas de fábrica do Synth2. */
  setSynth2FactoryDir(dir: string): void {
    this.synth2FactoryDir = dir;
  }

  setZynBankDirs(factoryDir: string, userDir: string): void {
    this.zynBankDir = factoryDir;
    this.zynUserDir = userDir;
  }

  async scanDefaultDirectories(): Promise<VstPluginInfo[]> {
    return this.runScan({ rescan: false });
  }

  async scanDirectories(directories: string[]): Promise<VstPluginInfo[]> {
    if (this.scanPromise) await this.scanPromise.catch(() => undefined);
    return this.runScan({ paths: directories, rescan: false });
  }

  /**
   * Refaz o scan do zero: o motor descarta a lista acumulada antes de procurar.
   * Sem `directories`, usa os diretórios padrão de VST2/VST3.
   */
  async rescan(directories: string[] = []): Promise<VstPluginInfo[]> {
    if (this.scanPromise) await this.scanPromise.catch(() => undefined);
    return this.runScan({
      ...(directories.length > 0 ? { paths: directories } : {}),
      rescan: true,
    });
  }

  /** Tira um plugin da blacklist do motor para que o próximo scan o tente. */
  async unblacklistPlugin(path: string): Promise<void> {
    await this.engine.request('unblacklist', { path });
    this.scanReport = {
      ...this.scanReport,
      blacklisted: this.scanReport.blacklisted.filter((item) => item !== path),
    };
  }

  private runScan(args: { paths?: string[]; rescan?: boolean }): Promise<VstPluginInfo[]> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = (async () => {
      this.scanReport = {
        ...this.scanReport,
        paths: args.paths ?? [],
        error: undefined,
      };
      try {
        const result = await this.engine.request('scan', args, 10 * 60 * 1000);
        // O motor acumula entradas no known-plugins.xml; sem deduplicar, o mesmo
        // plugin pode voltar mais de uma vez para a lista (e para a interface).
        this.scannedPlugins = this.dedupePlugins(result.plugins).map((plugin) => this.toVstPlugin(plugin));
        this.scanReport = {
          count: this.scannedPlugins.length,
          failed: result.failed ?? [],
          blacklisted: result.blacklisted ?? [],
          paths: args.paths ?? [],
          scannedAt: Date.now(),
        };
        this.emit('scanned', this.scannedPlugins);
        return this.scannedPlugins;
      } catch (error) {
        this.scanReport = {
          ...this.scanReport,
          error: error instanceof Error ? error.message : String(error),
          scannedAt: Date.now(),
        };
        throw error;
      }
    })().finally(() => {
      this.scanPromise = null;
    });
    return this.scanPromise;
  }

  /** Lista os plugins conhecidos no cache do motor, sem varrer as pastas. */
  async loadKnownPlugins(): Promise<VstPluginInfo[]> {
    const result = await this.engine.request('plugins', {});
    this.scannedPlugins = this.dedupePlugins(result.plugins).map((plugin) => this.toVstPlugin(plugin));
    // O relatório precisa refletir o cache: sem escanear nesta sessão, o Log
    // mostraria 0 plugins e 0 bloqueados mesmo com a lista cheia.
    this.scanReport = {
      ...this.scanReport,
      count: this.scannedPlugins.length,
      blacklisted: result.blacklisted ?? this.scanReport.blacklisted,
    };
    this.emit('scanned', this.scannedPlugins);
    return this.scannedPlugins;
  }

  /**
   * Carrega os bundles LV2 das pastas no mundo do motor. Ler o cache lista os
   * `.lv2` só pela URI; sem o bundle carregado o insert falha com "Unable to
   * locate plugin with the requested URI".
   */
  async warmLv2Bundles(paths: string[]): Promise<number> {
    const result = await this.engine.request('warmLv2', { paths }, 60_000);
    return result.bundles;
  }

  async loadPlugin(
    pluginPathOrId: string,
    layerId = `layer_${randomUUID()}`,
    minNote = 0,
    maxNote = 127,
    pinned = false,
    extra: Record<string, unknown> = {}
  ): Promise<VstPluginInfo> {
    return this.enqueueLoad(() =>
      this.loadWithCommand('load', pluginPathOrId, layerId, minNote, maxNote, pinned, extra)
    );
  }

  /** Carrega um instrumento em modo encadeado, para troca de patch sem corte. */
  async stageLoad(
    pluginPathOrId: string,
    layerId = `layer_${randomUUID()}`,
    minNote = 0,
    maxNote = 127,
    extra: Record<string, unknown> = {}
  ): Promise<VstPluginInfo> {
    return this.enqueueLoad(() =>
      this.loadWithCommand('stageLoad', pluginPathOrId, layerId, minNote, maxNote, false, extra)
    );
  }

  /**
   * Efetiva a troca de patch: os layers encadeados viram o patch atual e o anterior
   * é silenciado na hora ou mantido até as caudas acabarem. Limpa do cache os layers
   * que não pertencem mais ao patch.
   */
  async commitPatchSwap(silencePrevious: boolean): Promise<{ active: string[]; lingering: string[] }> {
    const result = await this.engine.request('commitPatchSwap', { silence: silencePrevious });
    const active = new Set(result.active);
    for (const layerId of [...this.loadedPlugins.keys()]) {
      if (active.has(layerId)) continue;
      this.loadedPlugins.delete(layerId);
      this.emit('plugin-unloaded', layerId);
    }
    return result;
  }

  private async loadWithCommand(
    command: 'load' | 'stageLoad',
    pluginPathOrId: string,
    layerId: string,
    minNote: number,
    maxNote: number,
    pinned = false,
    extra: Record<string, unknown> = {}
  ): Promise<VstPluginInfo> {
    const scanned = this.scannedPlugins.find(
      (plugin) => plugin.path === pluginPathOrId || plugin.id === pluginPathOrId
    );
    if (scanned?.arch === 'x86' && process.arch === 'x64') {
      throw new Error(
        `O plugin "${scanned.name}" é 32-bit e não pode ser carregado pelo engine 64-bit.`
      );
    }
    const isSynth2 = pluginPathOrId === 'preseter.synth2' || scanned?.id === 'preseter.synth2';
    const factory = isSynth2 && this.synth2FactoryDir
      ? { factoryPatches: this.synth2FactoryDir }
      : {};
    const zyn = pluginPathOrId === 'preseter.zyn' || scanned?.id === 'preseter.zyn'
      ? { zynBankDir: this.zynBankDir, zynUserDir: this.zynUserDir }
      : {};
    // A identidade do plugin vem por último: `extra` nunca troca o que é carregado.
    const identity = scanned ? { plugin: scanned.id } : { path: pluginPathOrId };
    const { plugin: _plugin, path: _path, ...options } = extra;
    const request = { ...factory, ...zyn, ...options, ...identity, layerId, minNote, maxNote, pinned };

    const requestLoad = () => this.engine.request(command, request, 60_000);
    let enginePlugin: EngineLoadedPlugin;
    try {
      enginePlugin = await requestLoad();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Já existe um instrumento com este identificador de layer')) {
        throw error;
      }
      const existing = this.loadedPlugins.get(layerId);
      if (existing?.pinned) throw error;

      // O patch pode referenciar um layer que já está carregado (por exemplo,
      // ao salvar e selecionar o mesmo patch). Descarrega e tenta de novo.
      await this.engine.request('unload', { layerId }).catch(() => null);
      if (this.loadedPlugins.delete(layerId)) this.emit('plugin-unloaded', layerId);
      enginePlugin = await requestLoad();
    }
    try {
      await this.ensureAudioRunning();
      // Troca de patch: não espera a lista completa de parâmetros (alguns
      // plugins expõem milhares). Ela chega em segundo plano e atualiza a UI.
      if (command === 'stageLoad') {
        const loaded = this.toVstPlugin(enginePlugin);
        this.loadedPlugins.set(layerId, loaded);
        this.emit('plugin-loaded', loaded);
        void this.getParameters(layerId)
          .then((parameters) => {
            if (!this.loadedPlugins.has(layerId)) return;
            const updated = this.toVstPlugin(enginePlugin, parameters);
            this.loadedPlugins.set(layerId, updated);
            this.emit('plugin-loaded', updated);
          })
          .catch((error) => {
            console.warn(`[Preseter] Não foi possível ler os parâmetros do layer "${layerId}":`, error);
          });
        return loaded;
      }
      const parameters = await this.engine.request('params', { layerId });
      const loaded = this.toVstPlugin(enginePlugin, parameters);
      this.loadedPlugins.set(layerId, loaded);
      this.emit('plugin-loaded', loaded);
      return loaded;
    } catch (error) {
      try {
        await this.engine.request('unload', { layerId });
      } catch (unloadError) {
        console.warn('[Preseter] Não foi possível descarregar o layer após falha:', unloadError);
      }
      throw new Error(
        `Não foi possível preparar o instrumento "${enginePlugin.name}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async unloadPlugin(layerOrPluginId: string): Promise<boolean> {
    const layerId = this.loadedPlugins.has(layerOrPluginId)
      ? layerOrPluginId
      : [...this.loadedPlugins.values()].find((plugin) => plugin.id === layerOrPluginId)?.layerId;
    if (!layerId) return false;
    const result = await this.engine.request('unload', { layerId });
    if (!result.unloaded) return false;
    this.loadedPlugins.delete(layerId);
    this.emit('plugin-unloaded', layerId);
    return true;
  }

  /** Descarrega todos os layers do motor (Fechar/Novo Concert). */
  async unloadAll(): Promise<boolean> {
    const result = await this.engine.request('unload', { layerId: '' });
    const layers = [...this.loadedPlugins.keys()];
    this.loadedPlugins.clear();
    for (const layerId of layers) this.emit('plugin-unloaded', layerId);
    return result.unloaded === true;
  }

  async setParameter(
    layerOrPluginId: string,
    paramId: string,
    value: number,
    slot?: number
  ): Promise<boolean> {
    const index = this.parameterIndex(paramId);
    if (index === null) return false;

    // Inserts são endereçados pelo dono (layer/barramento) + slot.
    if (slot !== undefined) {
      const parameter = await this.engine.request('setParam', {
        layerId: layerOrPluginId,
        index,
        value,
        slot,
      });
      this.emit('parameter-changed', {
        pluginId: layerOrPluginId,
        layerId: layerOrPluginId,
        slot,
        paramId,
        value: parameter.value,
      });
      return true;
    }

    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const parameter = await this.engine.request('setParam', {
      layerId: plugin.layerId,
      index,
      value,
    });
    this.loadedPlugins.set(plugin.layerId, this.withParameter(plugin, parameter));
    this.emit('parameter-changed', { pluginId: plugin.id, layerId: plugin.layerId, paramId, value: parameter.value });
    return true;
  }

  /** Lista os parâmetros de um layer/barrramento ou de um insert (`slot`). */
  async getParameters(ownerId: string, slot?: number): Promise<EngineParameter[]> {
    return this.engine.request('params', { layerId: ownerId, slot });
  }

  /** Arpejador MIDI do layer (Fase 7.2). */
  async setArp(layerId: string, settings: ArpSettings): Promise<EngineArpState> {
    return this.engine.request('setArp', { layerId, ...settings });
  }

  /** Preseter Drums: liga/desliga e publica o padrão (D5). */
  async setDrums(
    layerId: string,
    options: { enabled?: boolean; pattern?: EngineDrumPattern; gainDb?: number; soloPad?: number }
  ): Promise<EngineDrumsState> {
    return this.engine.request('setDrums', { layerId, ...options });
  }

  /** Preseter Drums: passo atual, trilhas, pads e kit (D7). */
  async getDrumsInfo(layerId: string): Promise<EngineDrumsState> {
    return this.engine.request('drums', { layerId });
  }

  /** Preseter Drums: posição leve para o indicador (D7). */
  async getDrumsPosition(layerId: string): Promise<{ enabled: boolean; currentStep: number }> {
    return this.engine.request('drumsPosition', { layerId });
  }

  /** Preseter Drums: troca o kit (SF2/SFZ) do layer (v1.1). */
  async loadDrumKit(
    layerId: string,
    path: string,
    bank: number,
    program: number
  ): Promise<EngineDrumsState> {
    return this.engine.request('loadDrumKit', { layerId, path, bank, program });
  }

  /** Preseter Drums: SF2/SFZ próprio de um pad; null volta ao kit (v1.1). */
  async setDrumPadSource(
    layerId: string,
    pad: number,
    source: { path: string; bank: number; program: number; note: number } | null
  ): Promise<EngineDrumsState> {
    return this.engine.request('setDrumPadSource', {
      layerId,
      pad,
      path: source?.path ?? '',
      bank: source?.bank ?? 128,
      program: source?.program ?? 0,
      note: source?.note ?? 60,
    });
  }

  async setLayerRange(layerId: string, minNote: number, maxNote: number): Promise<VstPluginInfo> {
    const plugin = this.loadedPlugins.get(layerId);
    if (!plugin) throw new Error('O layer selecionado não está carregado.');
    const result = await this.engine.request('setLayerRange', { layerId, minNote, maxNote });
    const updated = { ...plugin, minNote: result.minNote, maxNote: result.maxNote };
    this.loadedPlugins.set(layerId, updated);
    return updated;
  }

  /** Liga/desliga o MIDI de um layer (usado na geração em lote). */
  async setLayerMidiEnabled(layerId: string, enabled: boolean): Promise<boolean> {
    await this.engine.request('setLayerMidiEnabled', { layerId, enabled });
    return true;
  }

  async setLayerVelocityRange(
    layerId: string,
    minVelocity: number,
    maxVelocity: number
  ): Promise<VstPluginInfo> {
    const plugin = this.loadedPlugins.get(layerId);
    if (!plugin) throw new Error('O layer selecionado não está carregado.');
    await this.engine.request('setLayerVelocityRange', { layerId, minVelocity, maxVelocity });
    const updated = { ...plugin, velocityMin: minVelocity, velocityMax: maxVelocity };
    this.loadedPlugins.set(layerId, updated);
    return updated;
  }

  /** Transpose global em semitons, aplicado pelo filtro MIDI de todos os layers. */
  async setTranspose(semitones: number): Promise<boolean> {
    await this.engine.request('setTranspose', { semitones });
    return true;
  }

  /** Configura o strip de entrada de áudio do patch (Fase 3.5). */
  async setAudioInput(settings: Partial<AudioInputSettings> & { resetFeedback?: boolean }): Promise<AudioInputState> {
    return this.engine.request('setAudioInput', settings);
  }

  /** Estado do strip de entrada (configuração + peak/feedback). */
  async getAudioInputState(): Promise<AudioInputState> {
    return this.engine.request('audioInput', {});
  }

  /** Bloqueia no motor as mensagens marcadas como "Don't pass thru" (Fase 4.5). */
  async setMidiThru(blocked: MidiThruBlock[]): Promise<boolean> {
    await this.engine.request('setMidiThru', { blocked });
    return true;
  }

  async setHostClock(bpm: number, numerator: number, denominator: number, playing: boolean): Promise<boolean> {
    await this.engine.request('setHostClock', { bpm, numerator, denominator, playing });
    return true;
  }

  async setMetronome(enabled: boolean, volumeDb: number, accentFirstBeat: boolean): Promise<boolean> {
    await this.engine.request('setMetronome', { enabled, volumeDb, accentFirstBeat });
    return true;
  }

  async startRecording(path: string): Promise<boolean> {
    const result = await this.engine.request('recordStart', { path });
    return result.recording;
  }

  async stopRecording(): Promise<boolean> {
    await this.engine.request('recordStop', {});
    return true;
  }

  async loadPlayback(path: string): Promise<PlaybackState> {
    return this.engine.request('playbackLoad', { path });
  }

  async playPlayback(): Promise<PlaybackState> {
    return this.engine.request('playbackPlay', {});
  }

  async stopPlayback(): Promise<PlaybackState> {
    return this.engine.request('playbackStop', {});
  }

  async getPlaybackState(): Promise<PlaybackState> {
    return this.engine.request('playbackState', {});
  }

  async setPanLaw(db: number, compensated: boolean): Promise<boolean> {
    await this.engine.request('setPanLaw', { db, compensated });
    return true;
  }

  async sendMidi(bytes: number[]): Promise<boolean> {
    if (this.loadedPlugins.size === 0) return false;
    await this.engine.request('midi', { bytes });
    return true;
  }

  /** Panic do motor: all notes off + all sound off em todos os canais. */
  async panic(): Promise<boolean> {
    await this.engine.request('panic', {});
    return true;
  }

  async getPluginState(
    layerOrPluginId: string
  ): Promise<{ data: string; parameters: Record<string, number>; bypass: false } | null> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return null;
    if (plugin.format === 'LV2') return null;
    const chunk = await this.engine.request('getState', { layerId: plugin.layerId });
    const parameters = await this.engine.request('params', { layerId: plugin.layerId });
    return {
      data: chunk.data,
      parameters: Object.fromEntries(parameters.map((parameter) => [String(parameter.index), parameter.value])),
      bypass: false,
    };
  }

  /** Lista os programas internos que o plugin expõe ao host (pode ser 0). */
  async scanPluginPrograms(
    pluginIdOrPath: string
  ): Promise<{ programs: { index: number; name: string }[]; current: number; count: number }> {
    const scanned = this.scannedPlugins.find(
      (plugin) => plugin.path === pluginIdOrPath || plugin.id === pluginIdOrPath
    );
    const request = scanned ? { plugin: scanned.id } : { path: pluginIdOrPath };
    return this.engine.request('pluginPrograms', request, 60_000);
  }

  /** Troca o programa interno de um layer carregado e atualiza o cache. */
  async getSamplerInfo(layerId: string): Promise<Record<string, unknown>> {
    return this.engine.request('samplerInfo', { layerId });
  }

  /** Coloca instrumentos do sampler na fila de pré-carga do motor. */
  async preloadSamplers(
    items: Array<{ path: string; bank?: number; program?: number }>
  ): Promise<number> {
    if (items.length === 0) return 0;
    const result = await this.engine.request(
      'samplerPreload',
      {
        paths: items.map((item) => ({
          path: item.path,
          bank: item.bank ?? 0,
          program: item.program ?? 0,
        })),
      },
      120_000
    );
    return typeof result.queued === 'number' ? result.queued : 0;
  }

  async reloadSampler(
    layerId: string,
    samplePath: string,
    options: Record<string, unknown> = {}
  ): Promise<EngineLoadedPlugin> {
    return this.engine.request('samplerReload', { layerId, samplePath, ...options }, 120_000);
  }

  async setPluginProgram(layerOrPluginId: string, programIndex: number): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('setProgram', { layerId: plugin.layerId, index: programIndex });
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return true;
  }

  /** Preseter Dexed: relê os cartuchos .syx e atualiza a lista de programas. */
  async reloadDexedBank(layerOrPluginId: string): Promise<VstPluginInfo | null> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return null;
    const result = await this.engine.request('dexedReload', { layerId: plugin.layerId }, 30_000);
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return this.loadedPlugins.get(plugin.layerId) ?? null;
  }

  /** Preseter Zyn: relê os presets .xiz e atualiza a lista de programas. */
  async reloadZynBank(layerOrPluginId: string): Promise<VstPluginInfo | null> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return null;
    const result = await this.engine.request('zynReload', { layerId: plugin.layerId }, 60_000);
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return this.loadedPlugins.get(plugin.layerId) ?? null;
  }

  /** Preseter Synth2: aplica um patch .sy1 (texto) e recarrega os parâmetros. */
  async loadSynth2Patch(layerOrPluginId: string, text: string, name = 'INIT'): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('synth2LoadPatch', {
      layerId: plugin.layerId,
      data: text,
      name,
    });
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return true;
  }

  /** Preseter Synth2: exporta o som atual como texto .sy1. */
  async exportSynth2Patch(layerOrPluginId: string, name: string): Promise<string> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) throw new Error('O Synth2 não está carregado neste layer.');
    const result = await this.engine.request('synth2SavePatch', { layerId: plugin.layerId, name });
    return result?.data ?? '';
  }

  /** Carrega um SoundFont no juicysfplugin legado de um layer. */
  async loadSoundFont(layerId: string, filePath: string, programIndex?: number): Promise<boolean> {
    const plugin = this.loadedPlugins.get(layerId);
    if (!plugin) throw new Error('O layer do SoundFont não está carregado.');
    const result = await this.engine.request('loadSoundFont', {
      layerId,
      path: filePath,
      ...(programIndex !== undefined ? { programIndex } : {}),
    });
    await this.refreshLoadedPlugin(layerId, result);
    return true;
  }

  /** Aplica um arquivo `.vstpreset` num layer carregado. */
  async setPluginPresetFile(layerOrPluginId: string, filePath: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('setPresetFile', { layerId: plugin.layerId, path: filePath });
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return true;
  }

  /** Exporta o som atual como `.vstpreset` (apenas VST3). */
  async savePresetFile(layerOrPluginId: string, filePath: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    await this.engine.request('getPresetFile', { layerId: plugin.layerId, path: filePath });
    return true;
  }

  /** Exporta o som atual como `.fxp` (apenas VST2). */
  async saveVst2FxpFile(layerOrPluginId: string, filePath: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    await this.engine.request('saveVst2Fxp', { layerId: plugin.layerId, path: filePath });
    return true;
  }

  /** Aplica um `.fxp` num plugin VST2 carregado. */
  async setVst2FxpFile(layerOrPluginId: string, filePath: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('setVst2FxpFile', {
      layerId: plugin.layerId,
      path: filePath,
    });
    await this.refreshLoadedPlugin(plugin.layerId, result);
    return true;
  }

  /** Aplica um estado cru (chunk do plugin) codificado em base64. */
  async applyRawState(layerOrPluginId: string, base64: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    if (plugin.format === 'LV2') {
      throw new Error('Estado de plugins LV2 não é suportado.');
    }
    await this.engine.request('setState', { layerId: plugin.layerId, data: base64 });
    await this.refreshLoadedPlugin(plugin.layerId);
    return true;
  }

  private async refreshLoadedPlugin(
    layerId: string,
    loaded?: EngineLoadedPlugin
  ): Promise<void> {
    const parameters = await this.engine.request('params', { layerId });
    const current = this.loadedPlugins.get(layerId);
    if (!current) return;
    const updated = this.toVstPlugin(
      loaded ?? {
        layerId,
        id: current.id,
        name: current.name,
        manufacturer: current.manufacturer ?? '',
        format: current.format ?? 'VST3',
        path: current.path,
        isInstrument: current.isInstrument,
        inputs: 0,
        outputs: 0,
        minNote: current.minNote ?? 0,
        maxNote: current.maxNote ?? 127,
        pinned: current.pinned === true,
        parameterCount: parameters.length,
        parameterCountTotal: parameters.length,
        program: current.program,
        programCount: current.programCount,
      },
      parameters
    );
    this.loadedPlugins.set(layerId, updated);
    this.emit('plugin-loaded', updated);
  }

  /** Abre (ou traz para a frente) a janela nativa de edição do plugin. */
  async openPluginEditor(layerOrPluginId: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('openEditor', { layerId: plugin.layerId });
    return result.open === true;
  }

  /** Fecha a janela nativa de edição do plugin, se estiver aberta. */
  async closePluginEditor(layerOrPluginId: string): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const result = await this.engine.request('closeEditor', { layerId: plugin.layerId });
    return result.open === false;
  }

  async setPluginState(layerOrPluginId: string, state: unknown): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    if (plugin.format === 'LV2') {
      throw new Error('Estado de plugins LV2 não é suportado.');
    }
    if (!state || typeof state !== 'object') throw new TypeError('O estado do plugin precisa ser um objeto.');

    const stateRecord = state as { data?: unknown; parameters?: unknown; bypass?: unknown };
    if (stateRecord.bypass === true) {
      throw new Error('O engine JUCE ainda não oferece controle de bypass do plugin.');
    }

    // Estado completo (chunk) tem prioridade: restaura também o que não é parâmetro.
    if (typeof stateRecord.data === 'string' && stateRecord.data.length > 0) {
      await this.engine.request('setState', { layerId: plugin.layerId, data: stateRecord.data });
      return true;
    }

    // Compatibilidade: patches antigos guardavam só os valores dos parâmetros.
    if (stateRecord.parameters === undefined) return true;
    if (!stateRecord.parameters || typeof stateRecord.parameters !== 'object') {
      throw new TypeError('O campo parameters do estado precisa ser um objeto.');
    }

    for (const [key, value] of Object.entries(stateRecord.parameters)) {
      const index = this.parameterIndex(key);
      if (index === null || typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`Parâmetro inválido no estado do plugin: ${key}.`);
      }
      const parameter = await this.engine.request('setParam', { layerId: plugin.layerId, index, value });
      this.loadedPlugins.set(plugin.layerId, this.withParameter(plugin, parameter));
    }
    return true;
  }

  // ---- Inserts (efeitos por channel strip, Fase 3.1) --------------------

  /** Carrega (substituindo) um efeito no slot de insert do channel strip. */
  async setInsert(
    layerId: string,
    slot: number,
    pluginPathOrId: string,
    bypass = false
  ): Promise<EngineInsertState> {
    return this.enqueueLoad(async () => {
      const scanned = this.scannedPlugins.find(
        (plugin) => plugin.path === pluginPathOrId || plugin.id === pluginPathOrId
      );
      const request = scanned
        ? { layerId, slot, plugin: scanned.id, bypass }
        : { layerId, slot, path: pluginPathOrId, bypass };
      const state = await this.engine.request('setInsert', request, 60_000);
      try {
        await this.ensureAudioRunning();
      } catch (error) {
        console.warn('[Preseter] Não foi possível garantir o áudio após o insert:', error);
      }
      return state;
    });
  }

  private async ensureAudioRunning(): Promise<void> {
    const devices = await this.getAudioDevices();
    if (devices.running) return;

    if (this.ensureAudio) {
      const started = await this.ensureAudio();
      if (!started.running) {
        throw new Error('O áudio não iniciou com a configuração salva do Preseter.');
      }
      return;
    }

    await this.startAudio({ outputs: 2, inputs: 0, useDefaultChannels: true });
  }

  async removeInsert(layerId: string, slot: number): Promise<EngineInsertState> {
    return this.engine.request('removeInsert', { layerId, slot });
  }

  async setInsertBypass(layerId: string, slot: number, bypass: boolean): Promise<EngineInsertState> {
    return this.engine.request('setInsertBypass', { layerId, slot, bypass });
  }

  async getInserts(layerId: string): Promise<EngineInsertState[]> {
    return this.engine.request('inserts', { layerId });
  }

  /** Estado completo do efeito do slot (base64), ou null se não estiver carregado. */
  async getInsertState(layerId: string, slot: number): Promise<{ data: string } | null> {
    try {
      const chunk = await this.engine.request('getState', { layerId, slot });
      return { data: chunk.data };
    } catch {
      // Plugins sem estado (LV2): guarda um snapshot dos parâmetros.
      const snapshot = await this.parameterSnapshot({ layerId, slot });
      return snapshot ? { data: snapshot } : null;
    }
  }

  async setInsertState(layerId: string, slot: number, data: string): Promise<boolean> {
    if (isParameterSnapshot(data)) {
      return this.applyParameterSnapshot(data, { layerId, slot });
    }
    await this.engine.request('setState', { layerId, slot, data });
    return true;
  }

  /** Snapshot normalizado dos parâmetros (para plugins sem estado, como LV2). */
  private async parameterSnapshot(
    target: { layerId: string; slot?: number }
  ): Promise<string | null> {
    try {
      const params = await this.engine.request('params', target);
      if (params.length === 0) return null;
      const values = params.map((parameter) => [parameter.index, parameter.value]);
      return PARAM_SNAPSHOT_PREFIX + Buffer.from(JSON.stringify(values), 'utf8').toString('base64');
    } catch {
      return null;
    }
  }

  /** Aplica um snapshot de parâmetros (restauração de plugins sem estado). */
  private async applyParameterSnapshot(
    data: string,
    target: { layerId: string; slot?: number }
  ): Promise<boolean> {
    try {
      const raw = Buffer.from(data.slice(PARAM_SNAPSHOT_PREFIX.length), 'base64').toString('utf8');
      const values = JSON.parse(raw) as Array<[number, number]>;
      if (!Array.isArray(values)) return false;
      for (const [index, value] of values) {
        if (!Number.isInteger(index) || typeof value !== 'number') continue;
        await this.engine.request('setParam', { ...target, index, value });
      }
      return true;
    } catch {
      return false;
    }
  }

  async openInsertEditor(layerId: string, slot: number): Promise<boolean> {
    const result = await this.engine.request('openEditor', { layerId, slot });
    return result.open === true;
  }

  async closeInsertEditor(layerId: string, slot: number): Promise<boolean> {
    const result = await this.engine.request('closeEditor', { layerId, slot });
    return result.open === false;
  }

  getScannedPlugins(): VstPluginInfo[] {
    return this.scannedPlugins;
  }

  /** Último relatório de varredura (pastas, falhas e blacklist). */
  getScanReport(): VstScanReport {
    return this.scanReport;
  }

  getLoadedPlugins(): VstPluginInfo[] {
    return [...this.loadedPlugins.values()];
  }

  /** Vozes ativas do instrumento nativo do layer (0 para VST/efeitos). */
  async getActiveVoices(layerOrPluginId: string): Promise<number> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return 0;
    const result = await this.engine.request('voices', { layerId: plugin.layerId });
    return Number(result?.activeVoices ?? 0);
  }

  /** Estado do áudio. `rescan` varre os drivers de novo (só ao abrir as configurações). */
  async getAudioDevices(rescan = false) {
    return this.engine.request('audioConfiguration', rescan ? { rescan: true } : {});
  }

  /**
   * Abre o painel do driver (ex.: ASIO4ALL). O painel é modal no motor, então
   * a resposta só chega quando o usuário o fecha.
   */
  async showAudioControlPanel() {
    return this.engine.request('audioControlPanel', {}, 10 * 60_000);
  }

  async startAudio(options: AudioStartOptions) {
    return this.engine.request('audioStart', options);
  }

  async stopAudio(): Promise<void> {
    await this.engine.request('audioStop', {});
  }

  async getMixState(): Promise<EngineMixState> {
    return this.engine.request('mix', {});
  }

  async setLayerMix(layerId: string, update: LayerMixUpdate): Promise<EngineMixState> {
    return this.engine.request('setLayerMix', { layerId, ...update });
  }

  async setMasterMix(update: MasterMixUpdate): Promise<EngineMixState> {
    return this.engine.request('setMasterMix', update);
  }

  // ---- Sends e Aux/Output (Fase 3.2) ------------------------------------

  /** Estado dos barramentos Aux/Output do concert. */
  async getBuses(): Promise<EngineBusState[]> {
    return this.engine.request('buses', {});
  }

  /** Altera um barramento (`aux1`..`aux4` / `output1`..`output4`). */
  async setBusMix(bus: string, update: BusMixUpdate): Promise<EngineBusState[]> {
    return this.engine.request('setBusMix', { bus, ...update });
  }

  /** Nível (dB) do send post-fader do layer para o Aux `aux` (1..4). */
  async setSend(layerId: string, aux: number, levelDb: number): Promise<EngineMixState> {
    return this.engine.request('setSend', { layerId, aux, levelDb });
  }

  /** Nível (dB) do send do bus do patch para o Aux `aux` (1..4). */
  async setPatchSend(aux: number, levelDb: number): Promise<EngineMixState> {
    return this.engine.request('setPatchSend', { aux, levelDb });
  }

  /** Nível (dB) do send do layer para o bus do patch. */
  async setLayerPatchSend(layerId: string, levelDb: number): Promise<EngineMixState> {
    return this.engine.request('setLayerPatchSend', { layerId, levelDb });
  }

  /** Saída (Output 1..4) para onde o channel strip do layer manda o áudio. */
  async setLayerOutput(layerId: string, output: number): Promise<EngineMixState> {
    return this.engine.request('setLayerOutput', { layerId, output });
  }

  /** PID do processo do motor (para o modo de desempenho). */
  getEnginePid(): number | null {
    return this.engine.getPid();
  }

  async shutdown(): Promise<void> {
    await this.engine.shutdown();
  }

  private findLoadedPlugin(identifier: string): VstPluginInfo | undefined {
    return this.loadedPlugins.get(identifier)
      ?? [...this.loadedPlugins.values()].find((plugin) => plugin.id === identifier);
  }

  private toVstPlugin(
    plugin: EnginePluginInfo | EngineLoadedPlugin,
    engineParameters: EngineParameter[] = []
  ): VstPluginInfo {
    const loaded = 'layerId' in plugin;
    const bundled = this.isBundledPlugin(plugin.path);
    const parameters: VstParameter[] = engineParameters.map((parameter) => ({
      id: String(parameter.index),
      name: parameter.name,
      label: parameter.label,
      value: parameter.value,
      defaultValue: parameter.defaultValue,
      minValue: 0,
      maxValue: 1,
      stepCount: parameter.stepCount,
    }));
    return {
      id: plugin.id,
      ...(loaded ? {
        layerId: plugin.layerId,
        minNote: plugin.minNote,
        maxNote: plugin.maxNote,
        pinned: plugin.pinned === true,
      } : {}),
      name: plugin.name,
      path: plugin.path,
      isLoaded: loaded,
      isInstrument: plugin.isInstrument,
      parameters,
      // Plugins empacotados com o app aparecem com o formato Native, mas mantêm
      // o nome e o fabricante originais (créditos ao autor do calfnXT).
      manufacturer: plugin.manufacturer,
      version: plugin.version,
      category: plugin.category,
      format: bundled ? 'Native' : plugin.format,
      arch: this.detectArch(plugin.path),
      program: 'program' in plugin ? plugin.program : undefined,
      programCount: 'programCount' in plugin ? plugin.programCount : undefined,
      programNames: 'programNames' in plugin && Array.isArray(plugin.programNames)
        ? plugin.programNames.map((name) => String(name))
        : undefined,
      patchName: 'patchName' in plugin && typeof plugin.patchName === 'string'
        ? plugin.patchName
        : undefined,
    };
  }

  /** true quando o plugin foi instalado junto com o app (vendor/resources). */
  private isBundledPlugin(filePath: string): boolean {
    if (!this.bundledFolder || !filePath) return false;
    const normalize = (value: string) => value.replace(/[\\/]+$/, '').toLowerCase();
    return normalize(filePath).startsWith(normalize(this.bundledFolder));
  }

  /**
   * O motor acumula entradas no known-plugins.xml e o id do JUCE inclui um hash
   * do caminho: o mesmo plugin em `vendor/` e em `resources/` vira duas
   * entradas com ids diferentes. Deduplica pela identidade real (formato,
   * fabricante e nome) e, quando há mais de uma cópia, mantém a empacotada com
   * o app.
   */
  private dedupePlugins(plugins: EnginePluginInfo[]): EnginePluginInfo[] {
    const byIdentity = new Map<string, EnginePluginInfo>();
    for (const plugin of plugins) {
      const key = `${plugin.format ?? ''}|${plugin.manufacturer ?? ''}|${plugin.name}`.toLowerCase();
      const current = byIdentity.get(key);
      if (!current || (this.isBundledPlugin(plugin.path) && !this.isBundledPlugin(current.path))) {
        byIdentity.set(key, plugin);
      }
    }
    // Entradas repetidas com o mesmo id (mesmo plugin listado duas vezes no
    // cache do motor) também contam como duplicata.
    const byId = new Map<string, EnginePluginInfo>();
    for (const plugin of byIdentity.values()) {
      if (!byId.has(plugin.id)) byId.set(plugin.id, plugin);
    }
    return [...byId.values()];
  }

  private detectArch(filePath: string): 'x64' | 'x86' | 'unknown' {
    // LV2 identifica o plugin por URI (http…), não por um arquivo local.
    if (/^[a-z][a-z0-9+.-]+:\/\//i.test(filePath)) return 'unknown';
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(0x1000);
      const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);
      if (read < 0x40) return 'unknown';
      // Windows PE
      if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
        const peOffset = buffer.readUInt32LE(0x3c);
        if (peOffset + 6 <= read && buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\u0000\u0000') {
          const machine = buffer.readUInt16LE(peOffset + 4);
          if (machine === 0x8664) return 'x64';
          if (machine === 0x014c) return 'x86';
        }
      }
      // Linux ELF
      if (buffer[0] === 0x7f && buffer.toString('ascii', 1, 4) === 'ELF') {
        const machine = buffer.readUInt16LE(18);
        if (machine === 0x3e) return 'x64';
        if (machine === 0x03) return 'x86';
      }
    } catch {
      // Plugin em bundle/arquivo especial: arquitetura desconhecida.
    }
    return 'unknown';
  }

  private withParameter(plugin: VstPluginInfo, parameter: EngineParameter): VstPluginInfo {
    return {
      ...plugin,
      parameters: plugin.parameters.map((current) =>
        current.id === String(parameter.index) ? { ...current, value: parameter.value } : current
      ),
    };
  }

  private parameterIndex(paramId: string): number | null {
    const match = /^(?:param_)?(\d+)$/.exec(paramId);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isSafeInteger(index) ? index : null;
  }
}
