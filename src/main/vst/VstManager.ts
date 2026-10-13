import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { VstPluginInfo, VstParameter } from '../../shared/types';
import { PLUGIN_DIRECTORIES } from '../../shared/constants';

/**
 * VSTManager - Gerencia o carregamento e controle de plugins VST3
 *
 * IMPORTANTE: Para carregar plugins VST3 reais, esta classe precisa ser
 * estendida com um binding nativo (Node.js addon) que utilize o
 * VST3 SDK da Steinberg.
 *
 * O SDK VST3 pode ser baixado em: https://www.steinberg.net/sdk_downloads
 *
 * Esta implementação fornece a estrutura e API, mas o carregamento real
 * de plugins requer compilação nativa.
 *
 * Alternativas para integração VST3:
 * 1. vst3sdk + JUCE (recomendado para produção)
 * 2. Carla VST plugin host (Linux)
 * 3. Pedalboard (Python, para VST3 no Windows)
 */
export class VstManager extends EventEmitter {
  private scannedPlugins: VstPluginInfo[] = [];
  private loadedPlugins: Map<string, VstPluginInfo> = new Map();
  private pluginStates: Map<string, any> = new Map();

  constructor() {
    super();
  }

  /**
   * Scanear diretórios padrão por plugins VST3
   */
  scanDefaultDirectories(): Promise<VstPluginInfo[]> {
    return this.scanDirectories(PLUGIN_DIRECTORIES);
  }

  /**
   * Escanear diretórios específicos por plugins VST3
   */
  scanDirectories(directories: string[]): Promise<VstPluginInfo[]> {
    return new Promise((resolve) => {
      const found: VstPluginInfo[] = [];

      for (const dir of directories) {
        if (!fs.existsSync(dir)) continue;

        const files = this.readDirRecursive(dir);

        for (const file of files) {
          if (file.toLowerCase().endsWith('.vst3')) {
            const pluginInfo: VstPluginInfo = {
              id: this.generatePluginId(file),
              name: path.basename(file, '.vst3'),
              path: file,
              isLoaded: false,
              isInstrument: this.guessIsInstrument(file),
              parameters: [],
            };
            found.push(pluginInfo);
          }
        }
      }

      this.scannedPlugins = found;
      console.log(`[VST] Encontrado ${found.length} plugins`);
      this.emit('scanned', found);
      resolve(found);
    });
  }

  /**
   * Carregar um plugin VST3 por caminho
   */
  async loadPlugin(pluginPath: string): Promise<VstPluginInfo | null> {
    const exists = fs.existsSync(pluginPath);
    if (!exists) {
      console.error(`[VST] Plugin não encontrado: ${pluginPath}`);
      return null;
    }

    const pluginId = this.generatePluginId(pluginPath);
    const name = path.basename(pluginPath, '.vst3');

    // Criar instância do plugin (stub - requer native addon)
    const pluginInfo: VstPluginInfo = {
      id: pluginId,
      name,
      path: pluginPath,
      isLoaded: true,
      isInstrument: this.guessIsInstrument(pluginPath),
      parameters: this.getDefaultParameters(name),
    };

    this.loadedPlugins.set(pluginId, pluginInfo);

    // Salvar estado inicial do plugin
    this.pluginStates.set(pluginId, {
      parameters: {},
      bypass: false,
    });

    console.log(`[VST] Plugin carregado: ${name} (${pluginId})`);
    this.emit('plugin-loaded', pluginInfo);
    return pluginInfo;
  }

  /**
   * Carregar plugin por ID
   */
  async loadPluginById(pluginId: string): Promise<VstPluginInfo | null> {
    const plugin = this.scannedPlugins.find((p) => p.id === pluginId);
    if (!plugin) {
      console.error(`[VST] Plugin não encontrado: ${pluginId}`);
      return null;
    }

    const loaded = this.loadedPlugins.get(pluginId);
    if (loaded) return loaded;

    return this.loadPlugin(plugin.path);
  }

  /**
   * Descarregar um plugin
   */
  unloadPlugin(pluginId: string): boolean {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) return false;

    this.loadedPlugins.delete(pluginId);
    this.pluginStates.delete(pluginId);

    console.log(`[VST] Plugin descarregado: ${plugin.name}`);
    this.emit('plugin-unloaded', pluginId);
    return true;
  }

  /**
   * Definir valor de um parâmetro do plugin
   */
  setParameter(pluginId: string, paramId: string, value: number): boolean {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) return false;

    const param = plugin.parameters.find((p) => p.id === paramId);
    if (!param) return false;

    // Normalizar valor
    const normalized = Math.max(0, Math.min(1, value));
    param.value = normalized;

    // Salvar no estado
    const state = this.pluginStates.get(pluginId) || { parameters: {} };
    state.parameters = { ...state.parameters, [paramId]: normalized };
    this.pluginStates.set(pluginId, state);

    console.log(`[VST] Parâmetro ${param.name} = ${normalized}`);
    this.emit('parameter-changed', { pluginId, paramId, value: normalized });
    return true;
  }

  /**
   * Obter estado completo de um plugin
   */
  getPluginState(pluginId: string): any | null {
    return this.pluginStates.get(pluginId) || null;
  }

  /**
   * Definir estado completo de um plugin
   */
  setPluginState(pluginId: string, state: any): boolean {
    if (!this.loadedPlugins.has(pluginId)) {
      console.warn(`[VST] Plugin não carregado: ${pluginId}`);
      return false;
    }

    this.pluginStates.set(pluginId, state);

    if (state.parameters) {
      const plugin = this.loadedPlugins.get(pluginId)!;
      for (const [paramId, value] of Object.entries(state.parameters)) {
        const param = plugin.parameters.find((p) => p.id === paramId);
        if (param) {
          param.value = value as number;
        }
      }
    }

    console.log(`[VST] Estado restaurado para: ${pluginId}`);
    this.emit('state-restored', pluginId);
    return true;
  }

  /**
   * Obter todos os plugins encontrados no escaneamento
   */
  getScannedPlugins(): VstPluginInfo[] {
    return this.scannedPlugins;
  }

  /**
   * Obter plugins atualmente carregados
   */
  getLoadedPlugins(): VstPluginInfo[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Obter informações de um plugin específico
   */
  getPlugin(pluginId: string): VstPluginInfo | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Obter parâmetros de um plugin
   */
  getParameters(pluginId: string): VstParameter[] | null {
    const plugin = this.loadedPlugins.get(pluginId);
    return plugin ? plugin.parameters : null;
  }

  /**
   * Processar áudio (stub - requer implementação nativa)
   */
  processAudio(
    pluginId: string,
    inputBuffer: Float32Array[],
    outputBuffer: Float32Array[],
    sampleRate: number,
    numFrames: number
  ): boolean {
    // Este método requer a implementação real do processo de áudio do plugin
    // A implementação real usará o VST3 SDK
    return true;
  }

  /**
   * Limpar todos os plugins carregados
   */
  clearAll(): void {
    for (const pluginId of this.loadedPlugins.keys()) {
      this.unloadPlugin(pluginId);
    }
  }

  // Métodos auxiliares

  private readDirRecursive(dir: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.readDirRecursive(fullPath));
      } else {
        results.push(fullPath);
      }
    }

    return results;
  }

  private generatePluginId(filePath: string): string {
    const normalizedPath = path.resolve(filePath).toLowerCase();
    const pathHash = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);
    return `plugin_${pathHash}`;
  }

  private guessIsInstrument(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    const instrumentKeywords = ['synth', 'piano', 'organ', 'bass', 'drum', 'sampler'];
    return instrumentKeywords.some((kw) => name.includes(kw));
  }

  private getDefaultParameters(pluginName: string): VstParameter[] {
    // Parâmetros padrão - serão substituídos quando o plugin real for carregado
    // via native addon VST3 SDK
    return [
      {
        id: 'param_0',
        name: 'Volume',
        label: 'dB',
        value: 0.75,
        defaultValue: 0.75,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
      {
        id: 'param_1',
        name: 'Pan',
        label: 'pan',
        value: 0.5,
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
      {
        id: 'param_2',
        name: 'Drive',
        label: '',
        value: 0.3,
        defaultValue: 0.3,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
      {
        id: 'param_3',
        name: 'Cutoff',
        label: 'Hz',
        value: 0.6,
        defaultValue: 0.6,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
      {
        id: 'param_4',
        name: 'Resonance',
        label: 'Q',
        value: 0.2,
        defaultValue: 0.2,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
      {
        id: 'param_5',
        name: 'Dry/Wet',
        label: '%',
        value: 0.5,
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        stepCount: 0,
      },
    ];
  }
}
