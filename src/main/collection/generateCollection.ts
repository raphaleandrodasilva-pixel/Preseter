import type { Insert, Preset, PresetPluginAssignment, PresetSet, PreseterConcertFile } from '../../shared/types';
import { MAX_INSERTS } from '../../shared/types';
import type { CollectionReadiness } from '../../shared/collection';
import { existsSync, readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultConcertSettings, createEmptyLayout } from '../concert/ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { COLLECTION_SETS, SAMPLE_LIBRARY_FILES, type CollectionLayerSpec, type CollectionSet, type EffectSpec } from '../../shared/collection-presets';
import { buildPatchLayout } from '../../shared/collection-layouts';
import { effectKey, findEffect } from '../../shared/effects/catalog';
import { suggestPatchIcon } from '../../shared/patch-icons';

export interface CollectionPlugin {
  id: string;
  name: string;
  isInstrument?: boolean;
  /** Caminho do bundle no scan; necessário para montar um `Insert`. */
  path?: string;
}

/**
 * Acha um efeito nativo pelo nome do scan, nome Preseter ou key curta.
 * A identidade é o `effectKey` (basename sem `calfNXT`, minúsculo alfanumérico).
 */
export function findEffectPlugin (
  plugins: CollectionPlugin[],
  ref: string
): CollectionPlugin | undefined {
  const key = effectKey(ref);
  if (!key) return undefined;

  const direct = plugins.find((plugin) => effectKey(plugin.path ?? plugin.name) === key);
  if (direct) return direct;

  // LV2: a key do caminho é o bundle (`gxts9`), não o nome Preseter. Usa o
  // catálogo para casar displayName/shortName/pluginNames com o plugin real.
  const effect = findEffect(ref);
  if (!effect) return undefined;
  const wanted = new Set(
    [
      effectKey(effect.match),
      effectKey(effect.displayName),
      effectKey(effect.shortName),
      ...(effect.pluginNames ?? []).map(effectKey),
    ].filter(Boolean)
  );
  return plugins.find((plugin) =>
    [plugin.path, plugin.name, plugin.id]
      .filter((value): value is string => Boolean(value))
      .some((value) => wanted.has(effectKey(value)))
  );
}

/** Resolve uma lista de efeitos em inserts (slots 0..3); ausente vai para `missing`. */
export function resolveEffectInserts (
  plugins: CollectionPlugin[],
  refs: EffectSpec[] | undefined,
  missing: Set<string>
): Insert[] {
  const inserts: Insert[] = [];
  for (const ref of refs ?? []) {
    if (inserts.length >= MAX_INSERTS) break;
    const name = typeof ref === 'string' ? ref : ref.effect;
    const presetId = typeof ref === 'string' ? undefined : ref.preset;
    const found = findEffectPlugin(plugins, name);
    if (!found) {
      missing.add(name);
      continue;
    }
    inserts.push({
      slot: inserts.length,
      pluginId: found.id,
      name: found.name,
      path: found.path ?? found.id,
      bypass: false,
      ...(presetId ? { presetId } : {}),
    });
  }
  return inserts;
}

/** Nome mostrado para cada instrumento nativo do Preseter. */
export const NATIVE_INSTRUMENT_NAMES: Record<
  NonNullable<CollectionLayerSpec['nativeInstrument']>,
  string
> = {
  organ: 'Preseter Organ',
  tines: 'Preseter Tines',
  reeds: 'Preseter Wurly',
  piano: 'Preseter Piano',
  dx: 'Preseter DX10',
  jx: 'Preseter JX10',
  synth2: 'Preseter Synth2',
  drums: 'Preseter Drums',
};

/**
 * Monta o assignment de um layer que usa instrumento nativo.
 * O id (e o path) é sempre `preseter.<nativeInstrument>`.
 */
export function nativeAssignmentFor(
  layer: CollectionLayerSpec,
  layerId: string,
  layerCount: number
): PresetPluginAssignment | null {
  if (!layer.nativeInstrument) return null;

  const nativeId = `preseter.${layer.nativeInstrument}`;
  return {
    pluginId: nativeId,
    layerId,
    name: layerCount > 1 && layer.label
      ? `Preseter — ${layer.label}`
      : NATIVE_INSTRUMENT_NAMES[layer.nativeInstrument],
    path: nativeId,
    role: 'instrument',
    programIndex: layer.programIndex ?? 0,
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
    ...(layer.drums ? { drums: layer.drums } : {}),
  };
}

interface InstrumentSpec {
  label: string;
  match: RegExp[];
  fallback?: CollectionLayerSpec['inst'];
}

/** Siglas da coleção → nomes procurados no scan do motor. */
export const COLLECTION_INSTRUMENTS: Record<CollectionLayerSpec['inst'], InstrumentSpec> = {
  NATIVE: { label: 'Preseter Sampler', match: [/preseter sampler/i] },
  FSVR: { label: 'FSVR', match: [/fsvr/i], fallback: 'DEXED' },
  SURGE: { label: 'Surge XT', match: [/surge/i], fallback: 'DEXED' },
  DEXED: { label: 'Dexed', match: [/dexed/i] },
  ODIN: { label: 'Odin 2', match: [/odin/i], fallback: 'SURGE' },
  HELM: { label: 'Helm', match: [/helm/i], fallback: 'SURGE' },
  MDA: { label: 'MDA', match: [/mda/i], fallback: 'DEXED' },
  MDA_EP: { label: 'MDA ePiano', match: [/mda\s*epiano|mdaepiano/i], fallback: 'MDA' },
  MDA_JX: { label: 'MDA JX10', match: [/mda\s*jx\s*10|mdajx10/i], fallback: 'MDA' },
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
  options: {
    tempo?: number;
    name?: string;
    soundsFolder?: string;
    /** Sets de outra biblioteca. Ausente = Factory 40. */
    sets?: CollectionSet[];
    /** Bibliotecas de samples extras declaradas pelo arquivo de biblioteca. */
    sampleLibraries?: Record<string, { path: string; name: string }>;
  } = {}
): BuildCollectionResult {
  const tempo = options.tempo ?? DEFAULT_TEMPO;
  const now = Date.now();
  const sets: PresetSet[] = [];
  const rawPatches: Preset[] = [];
  const skipped: string[] = [];
  const missing = new Set<string>();
  let program = 0;

  for (const [setName, patches] of options.sets ?? COLLECTION_SETS) {
    const setId = nextId('set');
    let setOrder = 0;
    for (const [name, layers, meta] of patches) {
      const assignments: PresetPluginAssignment[] = [];
      const vstStates: Record<string, any> = {};
      let blocked: string | null = null;
      // Inserts de timbre: valem para o strip de cada layer do patch.
      const stripInserts = resolveEffectInserts(plugins, meta?.inserts, missing);
      const cloneInserts = (): Insert[] => stripInserts.map((insert) => ({ ...insert }));
      layers.forEach((layer, index) => {
        const layerId = `${name.replace(/\W+/g, '-').toLowerCase()}:layer:${index}`;

        // Instrumento nativo do Preseter (órgão, tines, reeds, piano, DX10, JX10).
        if (layer.nativeInstrument) {
          const assignment = nativeAssignmentFor(layer, layerId, layers.length);
          if (assignment) {
            assignments.push(stripInserts.length > 0
              ? { ...assignment, inserts: cloneInserts() }
              : assignment);
          }
          return;
        }

        // Sampler nativo: SF2/SFZ lido pelo motor, sem plugin externo.
        if (layer.sample) {
          const library = options.sampleLibraries?.[layer.sample.library]
            ?? SAMPLE_LIBRARY_FILES[layer.sample.library as keyof typeof SAMPLE_LIBRARY_FILES];
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
            ...(stripInserts.length > 0 ? { inserts: cloneInserts() } : {}),
          });
          return;
        }

        const plugin = resolvePlugin(layer.inst, plugins);
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
          ...(stripInserts.length > 0 ? { inserts: cloneInserts() } : {}),
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
      // Master do patch (processa todos os layers) e sends para os Aux.
      const masterInserts = resolveEffectInserts(plugins, meta?.master, missing);
      const master = masterInserts.length > 0 || meta?.sends
        ? {
            volumeDb: 0,
            pan: 0,
            muted: false,
            inserts: masterInserts,
            ...(meta?.sends ? { sends: meta.sends } : {}),
          }
        : undefined;
      rawPatches.push({
        id: nextId('preset'),
        name,
        icon: suggestPatchIcon(name, setName),
        notes,
        setId,
        setOrder: setOrder++,
        programNumber: meta?.programNumber ?? program++,
        midiChannel: meta?.midiChannel ?? 0,
        plugins: assignments,
        vstStates,
        ...(master ? { master } : {}),
        ...(meta?.auxPresets ? { auxPresets: meta.auxPresets } : {}),
        layout: buildPatchLayout({
          slug: name.replace(/\W+/g, '-').toLowerCase(),
          title: notes,
          tempo,
          setName,
          patchName: name,
          layers,
          layerId: assignments[0]?.layerId,
          layerInserts: stripInserts,
          masterInserts,
          meta,
        }),
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

  // Aux 1 = Reverb e Aux 2 = Delay, como na arquitetura do app. Sem o efeito,
  // o barramento fica desabilitado e o nome entra em `missing`.
  const settings = createDefaultConcertSettings();
  const enableAux = (
    index: number,
    ref: string,
    effect: CollectionPlugin | undefined
  ) => {
    const bus = settings.buses.aux[index];
    if (!bus) return;
    if (!effect) {
      missing.add(ref);
      return;
    }
    settings.buses.aux[index] = {
      ...bus,
      enabled: true,
      volumeDb: 0,
      pan: 0,
      muted: false,
      output: 1,
      inserts: [{
        slot: 0,
        pluginId: effect.id,
        name: effect.name,
        path: effect.path ?? effect.id,
        bypass: false,
      }],
    };
  };
  enableAux(0, 'calfNXT Reverb', findEffectPlugin(plugins, 'calfNXT Reverb'));
  enableAux(1, 'calfNXT Delay', findEffectPlugin(plugins, 'calfNXT Delay'));

  const file: PreseterConcertFile = {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: nextId('concert'),
      name: options.name ?? 'Coleção Preseter',
      tempo,
      settings,
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
  options: { tempo?: number; name?: string; soundsFolder?: string } = {}
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
