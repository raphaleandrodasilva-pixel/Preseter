import type { Preset, PresetPluginAssignment, PresetSet, PreseterConcertFile, UiElement } from '../../shared/types';
import type { CollectionReadiness } from '../../shared/collection';
import { existsSync, readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultKeyboardLayout } from '../../shared/default-layout';
import { createDefaultConcertSettings, createEmptyLayout } from '../concert/ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { COLLECTION_SETS, SAMPLE_LIBRARY_FILES, type CollectionLayerSpec } from '../../shared/collection-presets';
import { suggestPatchIcon } from '../../shared/patch-icons';

export interface CollectionPlugin {
  id: string;
  name: string;
  isInstrument?: boolean;
}

interface InstrumentSpec {
  label: string;
  match: RegExp[];
  fallback?: CollectionLayerSpec['inst'];
}

/** Siglas da coleção → nomes procurados no scan do motor. */
export const COLLECTION_INSTRUMENTS: Record<CollectionLayerSpec['inst'], InstrumentSpec> = {
  SFORZANDO: { label: 'Sforzando', match: [/sforzando/i] },
  FSVR: { label: 'FSVR', match: [/fsvr/i], fallback: 'DEXED' },
  SURGE: { label: 'Surge XT', match: [/surge/i], fallback: 'DEXED' },
  DEXED: { label: 'Dexed', match: [/dexed/i] },
  ODIN: { label: 'Odin 2', match: [/odin/i], fallback: 'SURGE' },
  HELM: { label: 'Helm', match: [/helm/i], fallback: 'SURGE' },
  MDA: { label: 'MDA', match: [/mda/i], fallback: 'DEXED' },
  MDA_EP: { label: 'MDA ePiano', match: [/mda\s*epiano|mdaepiano/i], fallback: 'MDA' },
  MDA_JX: { label: 'MDA JX10', match: [/mda\s*jx\s*10|mdajx10/i], fallback: 'MDA' },
  ORG: { label: 'setBfree', match: [/setbfree/i], fallback: 'SFORZANDO' },
  SFIZZ: { label: 'sfizz', match: [/sfizz/i], fallback: 'SFORZANDO' },
};

export interface BuildCollectionResult {
  file: PreseterConcertFile;
  skipped: string[];
  missing: string[];
}

let counter = 0;
const nextId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${++counter}`;

const surgeStateCache = new Map<string, { data: string; parameters: Record<string, number>; bypass: false } | null>();

/** Pastas onde o Surge XT instala os presets de fábrica. */
function surgePresetRoots(): string[] {
  if (process.platform === 'win32') {
    return [path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Surge XT', 'patches_factory')];
  }
  if (process.platform === 'darwin') {
    return [path.join(os.homedir(), 'Library', 'Application Support', 'Surge XT', 'patches_factory')];
  }
  return [
    path.join(os.homedir(), '.local', 'share', 'Surge XT', 'patches_factory'),
    '/usr/share/surge-xt/patches_factory',
  ];
}

/**
 * Lê um preset de fábrica do Surge XT (.fxp) e devolve o estado no formato que
 * o VST3 aceita. O estado fica embutido no concert, sem depender do caminho do
 * preset na máquina de destino.
 */
function loadSurgePresetState(
  relativePath: string
): { data: string; parameters: Record<string, number>; bypass: false } | null {
  if (surgeStateCache.has(relativePath)) return surgeStateCache.get(relativePath) ?? null;
  for (const root of surgePresetRoots()) {
    const fullPath = path.join(root, relativePath);
    if (!existsSync(fullPath)) continue;
    try {
      const buffer = readFileSync(fullPath);
      const xmlStart = buffer.indexOf(Buffer.from('<?xml'));
      if (xmlStart < 0) continue;
      const state = {
        data: buffer.subarray(xmlStart).toString('base64'),
        parameters: {},
        bypass: false as const,
      };
      surgeStateCache.set(relativePath, state);
      return state;
    } catch {
      /* tenta a próxima pasta */
    }
  }
  surgeStateCache.set(relativePath, null);
  return null;
}

function keyboardRig(notes: string, tempo: number): UiElement[] {
  return createDefaultKeyboardLayout(tempo, { title: notes }).elements;
}

function resolvePlugin(
  inst: CollectionLayerSpec['inst'],
  plugins: CollectionPlugin[],
  seen: Set<CollectionLayerSpec['inst']> = new Set()
): CollectionPlugin | undefined {
  if (seen.has(inst)) return undefined;
  seen.add(inst);
  const spec = COLLECTION_INSTRUMENTS[inst];
  for (const pattern of spec.match) {
    const found = plugins.find((plugin) => pattern.test(plugin.name) && plugin.isInstrument !== false);
    if (found) return found;
  }
  return spec.fallback ? resolvePlugin(spec.fallback, plugins, seen) : undefined;
}

/**
 * Monta a estrutura do concert da coleção (sets, patches, camadas, faixas,
 * volumes, programa e teclado). Não carrega nenhum som dentro dos plugins.
 */
export function buildCollectionConcert(
  plugins: CollectionPlugin[],
  options: { tempo?: number; test?: boolean; name?: string; soundsFolder?: string } = {}
): BuildCollectionResult {
  const tempo = options.tempo ?? DEFAULT_TEMPO;
  const now = Date.now();
  const sets: PresetSet[] = [];
  const rawPatches: Preset[] = [];
  const skipped: string[] = [];
  const missing = new Set<string>();
  let program = 0;

  for (const [setName, patches] of COLLECTION_SETS) {
    const setId = nextId('set');
    let setOrder = 0;
    for (const [name, layers, meta] of patches) {
      const assignments: PresetPluginAssignment[] = [];
      const vstStates: Record<string, any> = {};
      let blocked: string | null = null;
      layers.forEach((layer, index) => {
        const layerId = `${name.replace(/\W+/g, '-').toLowerCase()}:layer:${index}`;

        // Sampler nativo: SF2/SFZ lido pelo motor, sem plugin externo.
        if (layer.sample) {
          const library = SAMPLE_LIBRARY_FILES[layer.sample.library];
          const fullPath = options.soundsFolder ? path.join(options.soundsFolder, library.path) : '';
          if (!options.soundsFolder || !existsSync(fullPath)) {
            blocked ??= `${library.name} não encontrado`;
            missing.add(library.name);
            return;
          }
          assignments.push({
            pluginId: 'preseter.sampler',
            layerId,
            name: layers.length > 1 && layer.label ? `Sampler — ${layer.label}` : 'Preseter Sampler',
            path: 'preseter.sampler',
            role: 'instrument',
            sourceKind: 'sampler',
            samplePath: library.path,
            bank: layer.sample.bank ?? 0,
            programIndex: layer.sample.program ?? 0,
            minNote: layer.min,
            maxNote: layer.max,
            velocityMin: layer.velocityMin ?? 1,
            velocityMax: layer.velocityMax ?? 127,
            mix: {
              volumeDb: layer.db,
              pan: layer.pan ?? 0,
              muted: false,
              solo: false,
            },
            ...(layer.arp ? { arp: layer.arp } : {}),
            sampler: {
              polyphony: layer.sample.polyphony ?? 64,
              loop: layer.sample.loop ?? true,
              attack: layer.sample.attack ?? 0,
              decay: layer.sample.decay ?? 0,
              sustain: layer.sample.sustain ?? 1,
              release: layer.sample.release ?? 0.3,
              cutoff: layer.sample.cutoff ?? 20000,
              resonance: layer.sample.resonance ?? 0,
              velocity: layer.sample.velocity ?? 1,
              transpose: layer.sample.transpose ?? 0,
              fineTune: layer.sample.fineTune ?? 0,
              gain: layer.sample.gain ?? 0,
            },
          });
          return;
        }

        const plugin = options.test
          ? plugins.find((entry) => /test synth/i.test(entry.name))
          : resolvePlugin(layer.inst, plugins);
        if (!plugin) {
          blocked ??= `${COLLECTION_INSTRUMENTS[layer.inst]?.label ?? layer.inst} não encontrado`;
          missing.add(COLLECTION_INSTRUMENTS[layer.inst]?.label ?? layer.inst);
          return;
        }
        assignments.push({
          pluginId: plugin.id,
          layerId,
          name: layers.length > 1 && layer.label ? `${plugin.name} — ${layer.label}` : plugin.name,
          path: plugin.id,
          role: 'instrument',
          minNote: layer.min,
          maxNote: layer.max,
          velocityMin: layer.velocityMin ?? 1,
          velocityMax: layer.velocityMax ?? 127,
          mix: {
            volumeDb: layer.db,
            pan: layer.pan ?? 0,
            muted: false,
            solo: false,
          },
          ...(layer.arp ? { arp: layer.arp } : {}),
          ...(layer.programIndex !== undefined ? { programIndex: layer.programIndex } : {}),
        });
        if (layer.factoryPreset && /surge/i.test(plugin.name)) {
          const state = loadSurgePresetState(layer.factoryPreset);
          if (state) vstStates[layerId] = state;
        }
      });
      if (blocked || !assignments || assignments.length === 0) {
        skipped.push(`${name}: ${blocked ?? 'sem camadas'}`);
        continue;
      }
      const notes = meta?.description
        || layers.map((layer) => layer.label).filter(Boolean).join(' + ')
        || name;
      rawPatches.push({
        id: nextId('preset'),
        name,
        icon: suggestPatchIcon(name, setName),
        notes,
        setId,
        setOrder: setOrder++,
        programNumber: program++,
        midiChannel: meta?.midiChannel ?? 0,
        plugins: assignments,
        vstStates,
        layout: { elements: keyboardRig(notes, tempo), background: null, tempo },
        createdAt: now,
        updatedAt: now,
      });
    }
    if (setOrder > 0) {
      sets.push({
        id: setId,
        name: setName,
        order: sets.length,
        expanded: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const migrated = migrateConcertLayout(createEmptyLayout(tempo), rawPatches);
  const file: PreseterConcertFile = {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: nextId('concert'),
      name: options.name ?? (options.test ? 'Coleção (teste)' : 'Coleção Preseter'),
      tempo,
      settings: createDefaultConcertSettings(),
      strips: [],
      createdAt: now,
      updatedAt: now,
    },
    sets,
    patches: migrated.patches,
    layout: migrated.layout,
    mappings: [],
  };
  return { file, skipped, missing: [...missing] };
}

/** Confere se os 40 timbres podem ser gerados sem pular nenhum patch. */
export function analyzeCollectionConcert(
  plugins: CollectionPlugin[],
  options: { tempo?: number; test?: boolean; name?: string; soundsFolder?: string } = {}
): Omit<CollectionReadiness, 'missingIds'> {
  const { skipped, missing } = buildCollectionConcert(plugins, options);
  const total = COLLECTION_SETS.reduce((sum, [, patches]) => sum + patches.length, 0);
  return {
    total,
    ready: Math.max(0, total - skipped.length),
    blocked: skipped.length,
    missing,
    skipped,
    readyToGenerate: skipped.length === 0 && missing.length === 0,
  };
}
