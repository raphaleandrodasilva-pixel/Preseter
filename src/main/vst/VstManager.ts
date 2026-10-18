import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  EngineInsertState,
  EngineLoadedPlugin,
  EngineParameter,
  EnginePluginInfo,
} from '../../shared/engine-protocol';
import type {
  AudioInputSettings,
  AudioInputState,
  AudioStartOptions,
  BusMixUpdate,
  EngineBusState,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  MidiThruBlock,
  PlaybackState,
  VstParameter,
  VstPluginInfo,
} from '../../shared/types';
import { EngineProcess } from './EngineProcess';

export class VstManager extends EventEmitter {
  private readonly engine = new EngineProcess();
  private scannedPlugins: VstPluginInfo[] = [];
  private loadedPlugins = new Map<string, VstPluginInfo>();
  /** Fila para serializar cargas concorrentes de plugins. */
  private loadQueue: Promise<unknown> = Promise.resolve();

  constructor() {
    super();
    this.engine.on('crashed', (error: Error) => {
      // O motor reinicia vazio: o que estava carregado deixou de existir.
      this.loadedPlugins.clear();
      this.emit('engine-crashed', error);
    });
  }

  /** Serializa cargas de plugin: nunca roda duas ao mesmo tempo. */
  private enqueueLoad<T>(task: () => Promise<T>): Promise<T> {
    const run = this.loadQueue.then(task, task);
    this.loadQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async scanDefaultDirectories(): Promise<VstPluginInfo[]> {
    const result = await this.engine.request('scan', { rescan: false }, 10 * 60 * 1000);
    this.scannedPlugins = result.plugins.map((plugin) => this.toVstPlugin(plugin));
    this.emit('scanned', this.scannedPlugins);
    return this.scannedPlugins;
  }

  async scanDirectories(directories: string[]): Promise<VstPluginInfo[]> {
    const result = await this.engine.request('scan', { paths: directories, rescan: false }, 10 * 60 * 1000);
    this.scannedPlugins = result.plugins.map((plugin) => this.toVstPlugin(plugin));
    this.emit('scanned', this.scannedPlugins);
    return this.scannedPlugins;
  }

  async loadPlugin(
    pluginPathOrId: string,
    layerId = `layer_${randomUUID()}`,
    minNote = 0,
    maxNote = 127,
    pinned = false
  ): Promise<VstPluginInfo> {
    return this.enqueueLoad(() =>
      this.loadWithCommand('load', pluginPathOrId, layerId, minNote, maxNote, pinned)
    );
  }

  /** Carrega um instrumento em modo encadeado, para troca de patch sem corte. */
  async stageLoad(
    pluginPathOrId: string,
    layerId = `layer_${randomUUID()}`,
    minNote = 0,
    maxNote = 127
  ): Promise<VstPluginInfo> {
    return this.enqueueLoad(() => this.loadWithCommand('stageLoad', pluginPathOrId, layerId, minNote, maxNote));
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
    pinned = false
  ): Promise<VstPluginInfo> {
    const scanned = this.scannedPlugins.find(
      (plugin) => plugin.path === pluginPathOrId || plugin.id === pluginPathOrId
    );
    const request = scanned
      ? { plugin: scanned.id, layerId, minNote, maxNote, pinned }
      : { path: pluginPathOrId, layerId, minNote, maxNote, pinned };
    const enginePlugin = await this.engine.request(command, request, 60_000);
    try {
      const devices = await this.getAudioDevices();
      if (!devices.running) {
        await this.startAudio({ outputs: 2, inputs: 0 });
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

  async setParameter(layerOrPluginId: string, paramId: string, value: number): Promise<boolean> {
    const plugin = this.findLoadedPlugin(layerOrPluginId);
    if (!plugin?.layerId) return false;
    const index = this.parameterIndex(paramId);
    if (index === null) return false;
    const parameter = await this.engine.request('setParam', {
      layerId: plugin.layerId,
      index,
      value,
    });
    this.loadedPlugins.set(plugin.layerId, this.withParameter(plugin, parameter));
    this.emit('parameter-changed', { pluginId: plugin.id, layerId: plugin.layerId, paramId, value: parameter.value });
    return true;
  }

  async setLayerRange(layerId: string, minNote: number, maxNote: number): Promise<VstPluginInfo> {
    const plugin = this.loadedPlugins.get(layerId);
    if (!plugin) throw new Error('O layer selecionado não está carregado.');
    const result = await this.engine.request('setLayerRange', { layerId, minNote, maxNote });
    const updated = { ...plugin, minNote: result.minNote, maxNote: result.maxNote };
    this.loadedPlugins.set(layerId, updated);
    return updated;
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
    const chunk = await this.engine.request('getState', { layerId: plugin.layerId });
    const parameters = await this.engine.request('params', { layerId: plugin.layerId });
    return {
      data: chunk.data,
      parameters: Object.fromEntries(parameters.map((parameter) => [String(parameter.index), parameter.value])),
      bypass: false,
    };
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
        const devices = await this.getAudioDevices();
        if (!devices.running) await this.startAudio({ outputs: 2, inputs: 0 });
      } catch (error) {
        console.warn('[Preseter] Não foi possível garantir o áudio após o insert:', error);
      }
      return state;
    });
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
      return null;
    }
  }

  async setInsertState(layerId: string, slot: number, data: string): Promise<boolean> {
    await this.engine.request('setState', { layerId, slot, data });
    return true;
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

  getLoadedPlugins(): VstPluginInfo[] {
    return [...this.loadedPlugins.values()];
  }

  async getAudioDevices() {
    return this.engine.request('audioConfiguration', {});
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

  /** Saída (Output 1..4) para onde o channel strip do layer manda o áudio. */
  async setLayerOutput(layerId: string, output: number): Promise<EngineMixState> {
    return this.engine.request('setLayerOutput', { layerId, output });
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
    };
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
