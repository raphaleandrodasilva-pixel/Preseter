import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  VstPluginInfo,
  VstPreset,
  VstPresetLibraryStatus,
  VstPresetListResult,
} from '../../shared/types';
import type { VstManager } from './VstManager';

interface CachedPlugin {
  id: string;
  name: string;
  path: string;
  version?: string;
  programCount: number;
  scannedAt: number;
}

interface PresetOverride {
  category?: string;
  favorite?: boolean;
}

interface IndexFile {
  version: 1;
  plugins: Record<string, CachedPlugin>;
  presets: VstPreset[];
  overrides: Record<string, PresetOverride>;
  lastScan?: number;
}

const EMPTY_INDEX: IndexFile = {
  version: 1,
  plugins: {},
  presets: [],
  overrides: {},
};

const CATEGORY_KEYWORDS: { category: string; terms: string[] }[] = [
  { category: 'Piano', terms: ['piano', 'grand', 'upright', 'acoustic piano'] },
  { category: 'E-Piano', terms: ['electric piano', 'e-piano', 'epiano', 'rhodes', 'wurlitzer', 'wurli', 'suitcase', 'clavinet', 'clav'] },
  { category: 'Organ', terms: ['organ', 'b3', 'hammond', 'drawbar', 'church organ'] },
  { category: 'Strings', terms: ['string', 'violin', 'viola', 'cello', 'ensemble', 'orchestra'] },
  { category: 'Brass', terms: ['brass', 'trumpet', 'trombone', 'horn', 'tuba'] },
  { category: 'Woodwinds', terms: ['flute', 'clarinet', 'oboe', 'bassoon', 'sax'] },
  { category: 'Guitar', terms: ['guitar', 'nylon', 'steel string', 'amp'] },
  { category: 'Bass', terms: ['bass', 'sub bass', 'upright bass', 'bass guitar'] },
  { category: 'Synth Bass', terms: ['synth bass', 'acid', 'reese', 'wobble'] },
  { category: 'Synth Lead', terms: ['lead', 'solo', 'mono synth', 'supersaw'] },
  { category: 'Synth Pad', terms: ['pad', 'atmosphere', 'ambient', 'texture', 'drone'] },
  { category: 'Arp', terms: ['arp', 'arpeggio', 'sequence', 'sequencer'] },
  { category: 'Drums', terms: ['drum', 'kick', 'snare', 'hat', 'percussion', 'perc', 'kit'] },
  { category: 'FX', terms: ['fx', 'effect', 'noise', 'riser', 'impact', 'sweep'] },
];

const PLUGIN_CATEGORY_MAP: { match: RegExp; category: string }[] = [
  { match: /piano/i, category: 'Piano' },
  { match: /organ/i, category: 'Organ' },
  { match: /string/i, category: 'Strings' },
  { match: /drum|percussion/i, category: 'Drums' },
  { match: /bass/i, category: 'Bass' },
  { match: /synth|instrument/i, category: 'Synth Lead' },
  { match: /effect|fx/i, category: 'FX' },
];


function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function categoryFromText(text: string, fallback = 'Outros'): string {
  const normalized = normalize(text);
  for (const { category, terms } of CATEGORY_KEYWORDS) {
    if (terms.some((term) => normalized.includes(term))) return category;
  }
  return fallback;
}

function categoryFromPlugin(plugin: VstPluginInfo): string {
  const category = plugin.category ?? '';
  for (const { match, category: mapped } of PLUGIN_CATEGORY_MAP) {
    if (match.test(category)) return mapped;
  }
  return categoryFromText(`${plugin.name} ${plugin.manufacturer ?? ''}`, 'Outros');
}

function fileExists(filePath: string | undefined): boolean {
  if (!filePath) return false;
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listFiles(root: string, extension: string): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) found.push(full);
    }
  };
  walk(root);
  return found;
}

function readVitalStyle(filePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { preset_style?: unknown };
    if (typeof parsed.preset_style === 'string') return parsed.preset_style;
  } catch {
    // Arquivo inválido ou versão diferente: segue com heurística pelo nome.
  }
  return undefined;
}

/**
 * Índice de presets de VST3 usado pela Channel Strip Library.
 *
 * Fontes:
 * - programas internos expostos pelo plugin (JUCE getNumPrograms/getProgramName)
 * - arquivos .vstpreset em Documents/VST3 Presets
 * - arquivos .vital em Documents/Vital (JSON de estado do Vital)
 * - snapshots salvos pelo próprio Preseter
 *
 * O índice fica em userData/vst-presets.json; os estados dos snapshots ficam em
 * userData/vst-presets/states/*.bin. Não há banco de dados.
 */
export class VstPresetLibrary extends EventEmitter {
  private readonly indexPath: string;
  private readonly statesDir: string;
  private readonly documentsPath: string;
  private index: IndexFile = { ...EMPTY_INDEX, plugins: {}, presets: [], overrides: {} };
  private status: VstPresetLibraryStatus = { scanning: false, scanned: 0, total: 0 };
  private scanPromise: Promise<void> | null = null;

  constructor(userDataPath: string, documentsPath: string) {
    super();
    this.indexPath = path.join(userDataPath, 'vst-presets.json');
    this.statesDir = path.join(userDataPath, 'vst-presets', 'states');
    this.documentsPath = documentsPath;
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.indexPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')) as Partial<IndexFile>;
      this.index = {
        version: 1,
        plugins: raw.plugins ?? {},
        presets: Array.isArray(raw.presets) ? raw.presets : [],
        overrides: raw.overrides ?? {},
        lastScan: raw.lastScan,
      };
    } catch (error) {
      console.warn('[Preseter] Não foi possível ler o índice de presets VST:', error);
      this.index = { ...EMPTY_INDEX, plugins: {}, presets: [], overrides: {} };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[Preseter] Não foi possível gravar o índice de presets VST:', error);
    }
  }

  private emitChange(): void {
    this.emit('changed', this.listResult());
  }

  private applyOverride(preset: VstPreset): VstPreset {
    const override = this.index.overrides[preset.id];
    if (!override) return preset;
    return {
      ...preset,
      category: override.category ?? preset.category,
      favorite: override.favorite ?? preset.favorite,
    };
  }

  listResult(): VstPresetListResult {
    return {
      presets: this.index.presets
        .filter((preset) => {
          if (preset.source === 'snapshot') return true;
          if (preset.source === 'vital' || preset.source === 'vstpreset') return fileExists(preset.filePath);
          return true;
        })
        .map((preset) => this.applyOverride(preset)),
      status: { ...this.status },
    };
  }

  getStatus(): VstPresetLibraryStatus {
    return { ...this.status };
  }

  /** Reindexa todos os plugins e arquivos de preset. */
  scan(plugins: VstPluginInfo[], vst: VstManager, force = false): Promise<void> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.runScan(plugins, vst, force).finally(() => {
      this.scanPromise = null;
    });
    return this.scanPromise;
  }

  private async runScan(plugins: VstPluginInfo[], vst: VstManager, force: boolean): Promise<void> {
    this.status = {
      scanning: true,
      scanned: 0,
      total: Math.max(1, plugins.filter((plugin) => plugin.isInstrument).length),
      current: undefined,
      lastScan: this.index.lastScan,
    };
    this.emitChange();

    const instruments = plugins.filter((plugin) => plugin.isInstrument);
    const instrumentIds = new Set(instruments.map((plugin) => plugin.id));
    this.index.presets = this.index.presets.filter(
      (preset) => preset.source !== 'program' || instrumentIds.has(preset.pluginId)
    );
    for (const pluginId of Object.keys(this.index.plugins)) {
      if (!instrumentIds.has(pluginId)) delete this.index.plugins[pluginId];
    }
    for (const plugin of instruments) {
      if (!force) {
        const cached = this.index.plugins[plugin.id];
        if (
          cached &&
          cached.path === plugin.path &&
          cached.programCount >= 0 &&
          (cached.version ?? '') === (plugin.version ?? '')
        ) {
          this.status.scanned += 1;
          this.status.current = plugin.name;
          this.emitChange();
          continue;
        }
      }

      this.status.current = plugin.name;
      this.emitChange();

      try {
        const result = await vst.scanPluginPrograms(plugin.id);
        this.index.presets = this.index.presets.filter(
          (preset) => !(preset.source === 'program' && preset.pluginId === plugin.id)
        );
        for (const program of result.programs) {
          this.index.presets.push(
            this.applyOverride({
              id: `program:${plugin.id}:${program.index}`,
              name: program.name,
              category: categoryFromText(`${plugin.name} ${program.name}`, categoryFromPlugin(plugin)),
              source: 'program',
              pluginId: plugin.id,
              pluginName: plugin.name,
              pluginPath: plugin.path,
              programIndex: program.index,
              collection: plugin.name,
              favorite: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          );
        }
        this.index.plugins[plugin.id] = {
          id: plugin.id,
          name: plugin.name,
          path: plugin.path,
          version: plugin.version,
          programCount: result.programs.length,
          scannedAt: Date.now(),
        };
      } catch (error) {
        console.warn(`[Preseter] Falha ao ler programas de "${plugin.name}":`, error);
        this.index.plugins[plugin.id] = {
          id: plugin.id,
          name: plugin.name,
          path: plugin.path,
          version: plugin.version,
          programCount: -1,
          scannedAt: Date.now(),
        };
      }

      this.status.scanned += 1;
      this.emitChange();
    }

    this.scanPresetFiles(plugins);
    this.index.lastScan = Date.now();
    this.status = {
      scanning: false,
      scanned: instruments.length,
      total: instruments.length,
      lastScan: this.index.lastScan,
    };
    this.save();
    this.emitChange();
  }

  private scanPresetFiles(plugins: VstPluginInfo[]): void {
    // Remove entradas antigas de arquivos; serão relidas agora.
    this.index.presets = this.index.presets.filter(
      (preset) => preset.source === 'program' || preset.source === 'snapshot'
    );

    const pluginByName = new Map(
      plugins.map((plugin) => [normalize(plugin.name), plugin])
    );

    const presetRoots = [
      path.join(this.documentsPath, 'VST3 Presets'),
      path.join(path.dirname(this.indexPath), 'VST3 Presets'),
    ];
    const seenRoots = new Set<string>();
    for (const root of presetRoots) {
      const resolved = path.resolve(root);
      if (seenRoots.has(resolved)) continue;
      seenRoots.add(resolved);
      for (const filePath of listFiles(resolved, '.vstpreset')) {
        const relative = path.relative(resolved, filePath);
        const parts = relative.split(path.sep);
        const fileName = path.basename(filePath, path.extname(filePath));
        const folder = parts.length > 1 ? parts[parts.length - 2] : 'VST3 Presets';
        const plugin =
          parts
            .map((part) => pluginByName.get(normalize(part)))
            .find((match) => match !== undefined) ??
          [...pluginByName.entries()].find(
            ([name]) => normalize(folder).includes(name) || name.includes(normalize(folder))
          )?.[1];
        this.index.presets.push({
          id: `vstpreset:${filePath}`,
          name: fileName,
          category: categoryFromText(`${folder} ${fileName}`, plugin ? categoryFromPlugin(plugin) : 'Outros'),
          source: 'vstpreset',
          pluginId: plugin?.id ?? '',
          pluginName: plugin?.name ?? folder,
          pluginPath: plugin?.path ?? '',
          filePath,
          collection: folder,
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const vitalPlugin = plugins.find((plugin) => normalize(plugin.name).includes('vital'));
    if (vitalPlugin) {
      const vitalRoot = path.join(this.documentsPath, 'Vital');
      for (const filePath of listFiles(vitalRoot, '.vital')) {
        const relative = path.relative(vitalRoot, filePath);
        const parts = relative.split(path.sep);
        const fileName = path.basename(filePath, path.extname(filePath));
        const collection = parts.length > 1 ? parts[0] : 'Vital';
        const style = readVitalStyle(filePath);
        this.index.presets.push({
          id: `vital:${filePath}`,
          name: fileName,
          category: style ? categoryFromText(style, style) : categoryFromText(fileName, 'Synth Lead'),
          source: 'vital',
          pluginId: vitalPlugin.id,
          pluginName: vitalPlugin.name,
          pluginPath: vitalPlugin.path,
          filePath,
          collection,
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  /** Captura o som atual do layer como um preset reutilizável. */
  async saveSnapshot(input: {
    layerId: string;
    plugin: VstPluginInfo;
    name: string;
    category?: string;
    vst: VstManager;
  }): Promise<VstPreset | null> {
    const state = await input.vst.getPluginState(input.layerId);
    if (!state?.data) return null;

    const id = `snapshot:${randomUUID()}`;
    const stateFile = `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
    try {
      fs.mkdirSync(this.statesDir, { recursive: true });
      fs.writeFileSync(path.join(this.statesDir, stateFile), Buffer.from(state.data, 'base64'));
    } catch (error) {
      console.warn('[Preseter] Não foi possível gravar o estado do snapshot:', error);
      return null;
    }

    const preset: VstPreset = {
      id,
      name: input.name.trim() || 'Novo preset',
      category: input.category || categoryFromText(`${input.plugin.name}`, categoryFromPlugin(input.plugin)),
      source: 'snapshot',
      pluginId: input.plugin.id,
      pluginName: input.plugin.name,
      pluginPath: input.plugin.path,
      stateFile,
      collection: 'Meus presets',
      favorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.index.presets.push(preset);
    this.save();
    this.emitChange();
    return this.applyOverride(preset);
  }

  async applyPreset(presetId: string, layerId: string, vst: VstManager): Promise<boolean> {
    const preset = this.index.presets.find((item) => item.id === presetId);
    if (!preset) throw new Error('Preset não encontrado.');

    if (preset.source === 'program') {
      if (preset.programIndex === undefined) throw new Error('Programa interno inválido.');
      return vst.setPluginProgram(layerId, preset.programIndex);
    }

    if (preset.source === 'vstpreset') {
      if (!preset.filePath) throw new Error('Arquivo .vstpreset não informado.');
      return vst.setPluginPresetFile(layerId, preset.filePath);
    }

    if (preset.source === 'vital') {
      if (!preset.filePath) throw new Error('Arquivo .vital não informado.');
      const raw = fs.readFileSync(preset.filePath);
      return vst.applyRawState(layerId, raw.toString('base64'));
    }

    if (preset.source === 'snapshot') {
      if (!preset.stateFile) throw new Error('Estado do snapshot não informado.');
      const statePath = path.join(this.statesDir, preset.stateFile);
      if (!fs.existsSync(statePath)) throw new Error('O arquivo de estado do snapshot não existe mais.');
      const raw = fs.readFileSync(statePath);
      return vst.applyRawState(layerId, raw.toString('base64'));
    }

    return false;
  }

  updatePreset(
    presetId: string,
    patch: { category?: string; favorite?: boolean }
  ): VstPreset | null {
    const index = this.index.presets.findIndex((preset) => preset.id === presetId);
    if (index < 0) return null;
    const current = this.index.presets[index];
    const next: VstPreset = {
      ...current,
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
      updatedAt: Date.now(),
    };
    this.index.presets[index] = next;
    this.index.overrides[presetId] = {
      ...(this.index.overrides[presetId] ?? {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
    };
    this.save();
    this.emitChange();
    return this.applyOverride(next);
  }

  deletePreset(presetId: string): boolean {
    const preset = this.index.presets.find((item) => item.id === presetId);
    if (!preset) return false;
    this.index.presets = this.index.presets.filter((item) => item.id !== presetId);
    delete this.index.overrides[presetId];
    if (preset.stateFile) {
      try {
        fs.rmSync(path.join(this.statesDir, preset.stateFile), { force: true });
      } catch {
        // Ignora: o índice já não aponta para o arquivo.
      }
    }
    this.save();
    this.emitChange();
    return true;
  }
}
