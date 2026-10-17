import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  EngineLoadedPlugin,
  EngineParameter,
  EnginePluginInfo,
} from '../../shared/engine-protocol';
import type {
  AudioStartOptions,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  VstParameter,
  VstPluginInfo,
} from '../../shared/types';
import { EngineProcess } from './EngineProcess';

export class VstManager extends EventEmitter {
  private readonly engine = new EngineProcess();
  private scannedPlugins: VstPluginInfo[] = [];
  private loadedPlugins = new Map<string, VstPluginInfo>();

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
    maxNote = 127
  ): Promise<VstPluginInfo> {
    return this.loadWithCommand('load', pluginPathOrId, layerId, minNote, maxNote);
  }

  /** Carrega um instrumento em modo encadeado, para troca de patch sem corte. */
  async stageLoad(
    pluginPathOrId: string,
    layerId = `layer_${randomUUID()}`,
    minNote = 0,
    maxNote = 127
  ): Promise<VstPluginInfo> {
    return this.loadWithCommand('stageLoad', pluginPathOrId, layerId, minNote, maxNote);
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
    maxNote: number
  ): Promise<VstPluginInfo> {
    const scanned = this.scannedPlugins.find(
      (plugin) => plugin.path === pluginPathOrId || plugin.id === pluginPathOrId
    );
    const request = scanned
      ? { plugin: scanned.id, layerId, minNote, maxNote }
      : { path: pluginPathOrId, layerId, minNote, maxNote };
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
