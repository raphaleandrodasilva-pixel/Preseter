import { EventEmitter } from 'events';
import type {
  EngineLoadedPlugin,
  EngineParameter,
  EnginePluginInfo,
} from '../../shared/engine-protocol';
import type { VstParameter, VstPluginInfo } from '../../shared/types';
import { EngineProcess } from './EngineProcess';

export class VstManager extends EventEmitter {
  private readonly engine = new EngineProcess();
  private scannedPlugins: VstPluginInfo[] = [];
  private loadedPlugin: VstPluginInfo | null = null;

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

  async loadPlugin(pluginPathOrId: string): Promise<VstPluginInfo> {
    const scanned = this.scannedPlugins.find(
      (plugin) => plugin.path === pluginPathOrId || plugin.id === pluginPathOrId
    );
    const request = scanned ? { plugin: scanned.id } : { path: pluginPathOrId };
    const enginePlugin = await this.engine.request('load', request, 60_000);
    const previous = this.loadedPlugin;
    this.loadedPlugin = null;
    if (previous) this.emit('plugin-unloaded', previous.id);
    try {
      const parameters = await this.engine.request('params', {});
      const loaded = this.toVstPlugin(enginePlugin, parameters, true);
      await this.engine.request('audioStart', {
        inputs: loaded.isInstrument ? 0 : 2,
        outputs: 2,
      });
      this.loadedPlugin = loaded;
      this.emit('plugin-loaded', loaded);
      return loaded;
    } catch (error) {
      try {
        await this.engine.request('unload', {});
      } catch (unloadError) {
        console.warn('[Preseter] Não foi possível descarregar o plugin após falha:', unloadError);
      }
      throw new Error(
        `Não foi possível preparar o plugin "${enginePlugin.name}" e iniciar o áudio: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async loadPluginById(pluginId: string): Promise<VstPluginInfo | null> {
    const plugin = this.scannedPlugins.find((entry) => entry.id === pluginId);
    if (!plugin) return null;
    return this.loadPlugin(plugin.id);
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    if (!this.loadedPlugin || this.loadedPlugin.id !== pluginId) return false;
    const result = await this.engine.request('unload', {});
    if (!result.unloaded) return false;
    this.loadedPlugin = null;
    this.emit('plugin-unloaded', pluginId);
    return true;
  }

  async setParameter(pluginId: string, paramId: string, value: number): Promise<boolean> {
    if (!this.loadedPlugin || this.loadedPlugin.id !== pluginId) return false;
    const index = this.parameterIndex(paramId);
    if (index === null) return false;
    const parameter = await this.engine.request('setParam', { index, value });
    this.loadedPlugin = this.withParameter(this.loadedPlugin, parameter);
    this.emit('parameter-changed', { pluginId, paramId, value: parameter.value });
    return true;
  }

  async sendMidi(bytes: number[]): Promise<boolean> {
    if (!this.loadedPlugin) return false;
    await this.engine.request('midi', { bytes });
    return true;
  }

  async getPluginState(pluginId: string): Promise<{ parameters: Record<string, number>; bypass: false } | null> {
    if (!this.loadedPlugin || this.loadedPlugin.id !== pluginId) return null;
    const parameters = await this.engine.request('params', {});
    return {
      parameters: Object.fromEntries(parameters.map((parameter) => [String(parameter.index), parameter.value])),
      bypass: false,
    };
  }

  async setPluginState(pluginId: string, state: unknown): Promise<boolean> {
    if (!this.loadedPlugin || this.loadedPlugin.id !== pluginId) return false;
    if (!state || typeof state !== 'object') throw new TypeError('O estado do plugin precisa ser um objeto.');

    const stateRecord = state as { parameters?: unknown; bypass?: unknown };
    if (stateRecord.bypass === true) {
      throw new Error('O engine JUCE ainda não oferece controle de bypass do plugin.');
    }
    if (stateRecord.parameters === undefined) return true;
    if (!stateRecord.parameters || typeof stateRecord.parameters !== 'object') {
      throw new TypeError('O campo parameters do estado precisa ser um objeto.');
    }

    for (const [key, value] of Object.entries(stateRecord.parameters)) {
      const index = this.parameterIndex(key);
      if (index === null || typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`Parâmetro inválido no estado do plugin: ${key}.`);
      }
      const parameter = await this.engine.request('setParam', { index, value });
      this.loadedPlugin = this.withParameter(this.loadedPlugin, parameter);
    }
    return true;
  }

  getScannedPlugins(): VstPluginInfo[] {
    return this.scannedPlugins;
  }

  getLoadedPlugins(): VstPluginInfo[] {
    return this.loadedPlugin ? [this.loadedPlugin] : [];
  }

  async shutdown(): Promise<void> {
    await this.engine.shutdown();
  }

  private toVstPlugin(
    plugin: EnginePluginInfo | EngineLoadedPlugin,
    engineParameters: EngineParameter[] = [],
    isLoaded = false
  ): VstPluginInfo {
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
      name: plugin.name,
      path: plugin.path,
      isLoaded,
      isInstrument: plugin.isInstrument,
      parameters,
    };
  }

  private withParameter(plugin: VstPluginInfo, parameter: EngineParameter): VstPluginInfo {
    const next = plugin.parameters.map((current) =>
      current.id === String(parameter.index)
        ? { ...current, value: parameter.value }
        : current
    );
    return { ...plugin, parameters: next };
  }

  private parameterIndex(paramId: string): number | null {
    const match = /^(?:param_)?(\d+)$/.exec(paramId);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isSafeInteger(index) ? index : null;
  }
}
