import type {
  CollectionLayerSpec,
  CollectionPatch,
  CollectionSet,
  EffectRef,
} from '../collection-presets';
import { SAMPLE_LIBRARY_FILES } from '../collection-presets';
import { findEffect } from '../effects/catalog';
import { MAX_AUX_BUSES, MAX_INSERTS, SEND_OFF_DB } from '../types';

/**
 * Formato de biblioteca do Preseter: um arquivo só de dados, sem código, que o
 * botão Arquivo → Gerar Biblioteca… transforma em um ou mais concerts `.pst`.
 */
export const LIBRARY_FORMAT = 'preseter.library';
/** 1 = receitas; 2 = também aceita concerts exportados (`snapshot`). */
export const LIBRARY_VERSION = 2;
/** Referências portáteis a plugins dentro de um concert exportado. */
export const PLUGIN_PATH_TOKEN = 'preseter-plugin:';
export const PLUGIN_ID_TOKEN = 'preseter-plugin-id:';
export const LIBRARY_FILE_NAME = 'biblioteca.json';
export const LIBRARY_MAX_BYTES = 32 * 1024 * 1024;

const MAX_CONCERTS = 32;
const MAX_PATCHES_PER_CONCERT = 128;
const MAX_SNAPSHOT_PATCHES = 2048;
const MAX_LAYERS = 16;
const MAX_ERRORS = 20;

export interface LibraryPatch {
  name: string;
  /** Program Change do patch no concert (0..127), único por concert. */
  programNumber: number;
  midiChannel?: number;
  description?: string;
  layers: CollectionLayerSpec[];
  /** Efeitos do strip de cada layer. */
  inserts?: EffectRef[];
  /** Efeitos do Master do patch. */
  master?: EffectRef[];
  /** Sends do patch para os Aux 1..4, em dB (-60 = desligado). */
  sends?: number[];
  auxPresets?: Partial<Record<1 | 2 | 3 | 4, string>>;
}

export interface LibrarySet {
  name: string;
  patches: LibraryPatch[];
}

export interface LibraryConcert {
  id: string;
  name: string;
  tempo?: number;
  /** Receitas. Fica vazio quando o concert vem de `snapshot`. */
  sets: LibrarySet[];
  /** Concert exportado do app, com knobs, layout e mappings. */
  snapshot?: unknown;
}

/** Plugin citado por um concert exportado; resolvido pelo nome no scan local. */
export interface LibraryPluginRef {
  name: string;
  format?: string;
  kind: 'instrument' | 'effect';
}

export interface LibrarySampleFile {
  /** Caminho relativo à pasta de sons do Preseter. */
  path: string;
  name: string;
}

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: number;
  id: string;
  name: string;
  description?: string;
  /** Bibliotecas de samples além de `musescore`, `sonatina` e `salamander`. */
  sampleLibraries?: Record<string, LibrarySampleFile>;
  /** Plugins usados pelos concerts exportados. */
  pluginRefs?: Record<string, LibraryPluginRef>;
  concerts: LibraryConcert[];
}

// ---- Tipos trocados com a interface ----------------------------------------

export interface LibrarySummary {
  id: string;
  name: string;
  description?: string;
  concerts: number;
  patches: number;
  /** Preenchido quando o arquivo da biblioteca é inválido. */
  error?: string;
}

/** `external` = arquivo escolhido pelo usuário; outro valor = id da biblioteca. */
export type LibrarySource = string;
export const EXTERNAL_LIBRARY_SOURCE = 'external';

export interface LibraryConcertStatus {
  id: string;
  name: string;
  sets: number;
  patches: number;
  ready: number;
}

export interface LibraryInspection {
  source: LibrarySource;
  id: string;
  name: string;
  description?: string;
  concerts: LibraryConcertStatus[];
  total: number;
  ready: number;
  skipped: string[];
  missing: string[];
  /** Itens de `missing` que a Loja consegue baixar. */
  missingIds: string[];
}

export interface LibraryGeneratedConcert {
  id: string;
  name: string;
  path: string;
  sets: number;
  patches: number;
}

export interface LibraryGenerateResult {
  folder: string;
  concerts: LibraryGeneratedConcert[];
  patches: number;
  skipped: string[];
  missing: string[];
}

// ---- Validação --------------------------------------------------------------

const INSTRUMENTS = new Set(['NATIVE', 'FSVR', 'SURGE', 'DEXED', 'ODIN', 'HELM', 'MDA', 'MDA_EP', 'MDA_JX']);
const NATIVE = new Set(['organ', 'tines', 'reeds', 'piano', 'dx', 'jx', 'dexed', 'zyn', 'synth2', 'drums']);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isIntIn = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isNumberIn = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Só aceita caminho relativo que fica dentro da pasta de sons. */
export function isSafeRelativePath (value: unknown): boolean {
  if (!isText(value) || value.includes('\0')) return false;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return false;
  return normalized.split('/').every((part) => part !== '..' && part !== '');
}

class Problems {
  readonly items: string[] = [];
  add (where: string, message: string): void {
    if (this.items.length < MAX_ERRORS) this.items.push(`${where}: ${message}`);
  }
}

const SAMPLE_NUMBERS: Array<[string, number, number]> = [
  ['attack', 0, 60],
  ['decay', 0, 60],
  ['sustain', 0, 1],
  ['release', 0, 60],
  ['cutoff', 20, 20000],
  ['resonance', 0, 1],
  ['velocity', 0, 2],
  ['transpose', -48, 48],
  ['fineTune', -100, 100],
  ['gain', -60, 24],
];

function checkLayer (layer: unknown, where: string, samples: Set<string>, problems: Problems): void {
  if (!isObject(layer)) {
    problems.add(where, 'camada inválida');
    return;
  }
  if (!INSTRUMENTS.has(String(layer.inst))) problems.add(where, `instrumento "${String(layer.inst)}" desconhecido`);
  if (!isNumberIn(layer.db, -60, 12)) problems.add(where, 'db deve estar entre -60 e 12');
  if (!isIntIn(layer.min, 0, 127) || !isIntIn(layer.max, 0, 127) || (layer.min as number) > (layer.max as number)) {
    problems.add(where, 'faixa de notas inválida (min/max de 0 a 127)');
  }
  if (typeof layer.label !== 'string') problems.add(where, 'label é obrigatório');
  if (layer.programIndex !== undefined && !isIntIn(layer.programIndex, 0, 16383)) problems.add(where, 'programIndex inválido');
  if (layer.pan !== undefined && !isNumberIn(layer.pan, -1, 1)) problems.add(where, 'pan deve estar entre -1 e 1');

  const velocityMin = layer.velocityMin ?? 1;
  const velocityMax = layer.velocityMax ?? 127;
  if (!isIntIn(velocityMin, 1, 127) || !isIntIn(velocityMax, 1, 127) || (velocityMin as number) > (velocityMax as number)) {
    problems.add(where, 'faixa de velocity inválida (1 a 127)');
  }
  if (layer.arp !== undefined && !isObject(layer.arp)) problems.add(where, 'arp inválido');
  if (layer.drums !== undefined && !isObject(layer.drums)) problems.add(where, 'drums inválido');
  if (layer.factoryPreset !== undefined && !isSafeRelativePath(layer.factoryPreset)) {
    problems.add(where, 'factoryPreset precisa ser um caminho relativo');
  }

  if (layer.nativeInstrument !== undefined && !NATIVE.has(String(layer.nativeInstrument))) {
    problems.add(where, `instrumento nativo "${String(layer.nativeInstrument)}" desconhecido`);
  }
  if (layer.inst === 'NATIVE' && layer.nativeInstrument === undefined && layer.sample === undefined) {
    problems.add(where, 'camada NATIVE precisa de nativeInstrument ou sample');
  }
  if (layer.sample !== undefined) {
    if (!isObject(layer.sample)) {
      problems.add(where, 'sample inválido');
      return;
    }
    if (!samples.has(String(layer.sample.library))) {
      problems.add(where, `biblioteca de samples "${String(layer.sample.library)}" não declarada`);
    }
    if (layer.sample.bank !== undefined && !isIntIn(layer.sample.bank, 0, 128)) problems.add(where, 'sample.bank inválido');
    if (layer.sample.program !== undefined && !isIntIn(layer.sample.program, 0, 127)) problems.add(where, 'sample.program inválido');
    if (layer.sample.polyphony !== undefined && !isIntIn(layer.sample.polyphony, 8, 256)) problems.add(where, 'sample.polyphony inválido');
    if (layer.sample.loop !== undefined && typeof layer.sample.loop !== 'boolean') problems.add(where, 'sample.loop inválido');
    for (const [key, min, max] of SAMPLE_NUMBERS) {
      if (layer.sample[key] !== undefined && !isNumberIn(layer.sample[key], min, max)) {
        problems.add(where, `sample.${key} deve estar entre ${min} e ${max}`);
      }
    }
  }
}

function checkEffects (value: unknown, where: string, problems: Problems): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_INSERTS) {
    problems.add(where, `use uma lista de até ${MAX_INSERTS} efeitos`);
    return;
  }
  value.forEach((ref, index) => {
    const at = `${where}[${index}]`;
    if (!isObject(ref) || !isText(ref.effect)) {
      problems.add(at, 'efeito inválido');
      return;
    }
    const effect = findEffect(ref.effect);
    if (!effect) {
      problems.add(at, `efeito "${ref.effect}" não existe no catálogo`);
    } else if (ref.preset !== undefined && !effect.presets.some((preset) => preset.id === ref.preset)) {
      problems.add(at, `preset "${String(ref.preset)}" não existe em ${effect.displayName}`);
    }
  });
}

function checkAuxPresets (value: unknown, where: string, problems: Problems): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    problems.add(where, 'auxPresets inválido');
    return;
  }
  const effects: Record<string, string> = { 1: 'Reverb', 2: 'Delay' };
  for (const [aux, preset] of Object.entries(value)) {
    if (!isIntIn(Number(aux), 1, MAX_AUX_BUSES) || !isText(preset)) {
      problems.add(where, `Aux ${aux} inválido`);
      continue;
    }
    const effect = effects[aux] ? findEffect(effects[aux]) : undefined;
    if (effect && !effect.presets.some((item) => item.id === preset)) {
      problems.add(where, `preset "${preset}" não existe em ${effect.displayName}`);
    }
  }
}

function checkPatch (
  patch: unknown,
  where: string,
  samples: Set<string>,
  programs: Set<number>,
  slugs: Set<string>,
  problems: Problems
): void {
  if (!isObject(patch)) {
    problems.add(where, 'patch inválido');
    return;
  }
  const at = isText(patch.name) ? `${where} "${patch.name}"` : where;
  if (!isText(patch.name)) {
    problems.add(at, 'nome é obrigatório');
  } else {
    // O id das camadas nasce do nome: dois nomes iguais colidiriam no motor.
    const slug = patch.name.replace(/\W+/g, '-').toLowerCase();
    if (slugs.has(slug)) problems.add(at, 'nome repetido no concert');
    slugs.add(slug);
  }
  if (!isIntIn(patch.programNumber, 0, 127)) {
    problems.add(at, 'programNumber deve estar entre 0 e 127');
  } else {
    if (programs.has(patch.programNumber as number)) problems.add(at, 'programNumber repetido no concert');
    programs.add(patch.programNumber as number);
  }
  if (patch.midiChannel !== undefined && !isIntIn(patch.midiChannel, 0, 16)) problems.add(at, 'midiChannel inválido');
  if (patch.description !== undefined && typeof patch.description !== 'string') problems.add(at, 'description inválida');

  if (!Array.isArray(patch.layers) || patch.layers.length === 0 || patch.layers.length > MAX_LAYERS) {
    problems.add(at, `use de 1 a ${MAX_LAYERS} camadas`);
  } else {
    patch.layers.forEach((layer, index) => checkLayer(layer, `${at} camada ${index + 1}`, samples, problems));
  }
  checkEffects(patch.inserts, `${at} inserts`, problems);
  checkEffects(patch.master, `${at} master`, problems);
  checkAuxPresets(patch.auxPresets, `${at} auxPresets`, problems);
  if (patch.sends !== undefined) {
    const valid = Array.isArray(patch.sends)
      && patch.sends.length <= MAX_AUX_BUSES
      && patch.sends.every((send) => isNumberIn(send, SEND_OFF_DB, 12));
    if (!valid) problems.add(at, `sends: até ${MAX_AUX_BUSES} valores entre ${SEND_OFF_DB} e 12 dB`);
  }
}

/**
 * Concert exportado: plugin só pode ser nativo ou referência declarada. Assim um
 * arquivo de biblioteca nunca manda o motor carregar uma DLL por caminho direto.
 */
function checkSnapshot (
  snapshot: unknown,
  refs: Record<string, unknown>,
  where: string,
  problems: Problems
): void {
  if (!isObject(snapshot) || snapshot.format !== 'preseter.concert' || !Array.isArray(snapshot.patches)) {
    problems.add(where, 'concert exportado inválido');
    return;
  }
  if (snapshot.patches.length === 0 || snapshot.patches.length > MAX_SNAPSHOT_PATCHES) {
    problems.add(where, `use de 1 a ${MAX_SNAPSHOT_PATCHES} patches`);
  }
  const validRef = (value: unknown, token: string): boolean => {
    if (typeof value !== 'string') return false;
    if (/^preseter\.[a-z0-9]+$/.test(value)) return true;
    return value.startsWith(token) && Object.hasOwn(refs, value.slice(token.length));
  };
  const checkPlugin = (item: unknown, at: string): void => {
    if (!isObject(item) || !validRef(item.path, PLUGIN_PATH_TOKEN) || !validRef(item.pluginId, PLUGIN_ID_TOKEN)) {
      problems.add(at, 'plugin precisa ser nativo ou uma referência da biblioteca');
    }
  };
  const checkInserts = (value: unknown, at: string): void => {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      problems.add(at, 'inserts inválidos');
      return;
    }
    value.forEach((insert, index) => checkPlugin(insert, `${at}[${index}]`));
  };

  snapshot.patches.forEach((patch, patchIndex) => {
    const at = `${where} patch ${patchIndex + 1}`;
    if (!isObject(patch)) {
      problems.add(at, 'patch inválido');
      return;
    }
    if (patch.plugins !== undefined && !Array.isArray(patch.plugins)) problems.add(at, 'camadas inválidas');
    (Array.isArray(patch.plugins) ? patch.plugins : []).forEach((layer, layerIndex) => {
      const layerAt = `${at} camada ${layerIndex + 1}`;
      if (!isObject(layer)) {
        problems.add(layerAt, 'camada inválida');
        return;
      }
      if (!layer.externalMidi) checkPlugin(layer, layerAt);
      if (layer.samplePath !== undefined && layer.samplePath !== '' && !isSafeRelativePath(layer.samplePath)) {
        problems.add(layerAt, 'samplePath precisa ser relativo à pasta de sons');
      }
      checkInserts(layer.inserts, `${layerAt} inserts`);
    });
    if (isObject(patch.master)) checkInserts(patch.master.inserts, `${at} master`);
  });

  const concert = isObject(snapshot.concert) ? snapshot.concert : {};
  const settings = isObject(concert.settings) ? concert.settings : {};
  const buses = isObject(settings.buses) ? settings.buses : {};
  for (const group of ['aux', 'outputs']) {
    const list = buses[group];
    if (!Array.isArray(list)) continue;
    list.forEach((bus, index) => {
      if (isObject(bus)) checkInserts(bus.inserts, `${where} ${group} ${index + 1}`);
    });
  }
}

/** Lê e valida o texto de uma biblioteca. Lança um erro com os problemas achados. */
export function parseLibraryFile (text: string): LibraryFile {
  if (text.length > LIBRARY_MAX_BYTES) throw new Error('A biblioteca é grande demais.');

  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('O arquivo da biblioteca não é um JSON válido.');
  }
  if (!isObject(raw) || raw.format !== LIBRARY_FORMAT) {
    throw new Error('Este arquivo não é uma biblioteca do Preseter.');
  }
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) {
    throw new Error('A biblioteca não informa uma versão válida.');
  }
  if ((raw.version as number) > LIBRARY_VERSION) {
    throw new Error(`Esta biblioteca usa o formato ${String(raw.version)}; atualize o Preseter para abri-la.`);
  }

  const problems = new Problems();
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) problems.add('id', 'use letras minúsculas, números e hífen');
  if (!isText(raw.name)) problems.add('name', 'nome é obrigatório');
  if (raw.description !== undefined && typeof raw.description !== 'string') problems.add('description', 'inválida');

  const samples = new Set(Object.keys(SAMPLE_LIBRARY_FILES));
  if (raw.sampleLibraries !== undefined) {
    if (!isObject(raw.sampleLibraries)) {
      problems.add('sampleLibraries', 'inválido');
    } else {
      for (const [key, item] of Object.entries(raw.sampleLibraries)) {
        if (!isObject(item) || !isSafeRelativePath(item.path) || !isText(item.name)) {
          problems.add(`sampleLibraries.${key}`, 'precisa de name e de um path relativo à pasta de sons');
        }
        samples.add(key);
      }
    }
  }

  const pluginRefs = isObject(raw.pluginRefs) ? raw.pluginRefs : {};
  if (raw.pluginRefs !== undefined && !isObject(raw.pluginRefs)) problems.add('pluginRefs', 'inválido');
  for (const [key, ref] of Object.entries(pluginRefs)) {
    if (!/^[A-Za-z0-9]+$/.test(key) || !isObject(ref) || !isText(ref.name) || (ref.kind !== 'instrument' && ref.kind !== 'effect')) {
      problems.add(`pluginRefs.${key}`, 'precisa de name e kind');
    }
  }

  if (!Array.isArray(raw.concerts) || raw.concerts.length === 0 || raw.concerts.length > MAX_CONCERTS) {
    problems.add('concerts', `use de 1 a ${MAX_CONCERTS} concerts`);
  } else {
    const concertIds = new Set<string>();
    const concertNames = new Set<string>();
    raw.concerts.forEach((concert, concertIndex) => {
      const where = `concert ${concertIndex + 1}`;
      if (!isObject(concert)) {
        problems.add(where, 'inválido');
        return;
      }
      if (typeof concert.id !== 'string' || !ID_PATTERN.test(concert.id) || concertIds.has(concert.id)) {
        problems.add(where, 'id inválido ou repetido');
      } else {
        concertIds.add(concert.id);
      }
      const nameKey = isText(concert.name) ? safeFileName(concert.name).toLowerCase() : '';
      if (!nameKey || concertNames.has(nameKey)) problems.add(where, 'nome inválido ou repetido');
      concertNames.add(nameKey);
      if (concert.tempo !== undefined && !isNumberIn(concert.tempo, 20, 400)) problems.add(where, 'tempo inválido');
      if (concert.snapshot !== undefined) {
        if (Array.isArray(concert.sets) && concert.sets.length > 0) problems.add(where, 'use sets ou snapshot, não os dois');
        checkSnapshot(concert.snapshot, pluginRefs, where, problems);
        return;
      }
      if (!Array.isArray(concert.sets) || concert.sets.length === 0) {
        problems.add(where, 'precisa de pelo menos um set');
        return;
      }

      const programs = new Set<number>();
      const slugs = new Set<string>();
      const setNames = new Set<string>();
      let total = 0;
      concert.sets.forEach((set, setIndex) => {
        const setWhere = `${where} set ${setIndex + 1}`;
        if (!isObject(set) || !isText(set.name) || !Array.isArray(set.patches) || set.patches.length === 0) {
          problems.add(setWhere, 'precisa de nome e de patches');
          return;
        }
        if (setNames.has(set.name)) problems.add(setWhere, 'nome de set repetido');
        setNames.add(set.name);
        total += set.patches.length;
        set.patches.forEach((patch, patchIndex) =>
          checkPatch(patch, `${setWhere} patch ${patchIndex + 1}`, samples, programs, slugs, problems));
      });
      if (total > MAX_PATCHES_PER_CONCERT) {
        problems.add(where, `máximo de ${MAX_PATCHES_PER_CONCERT} patches por concert; divida em mais concerts`);
      }
    });
  }

  if (problems.items.length > 0) {
    throw new Error(`Biblioteca inválida:\n${problems.items.join('\n')}`);
  }
  return raw as unknown as LibraryFile;
}

/** Nome de arquivo aceito no Windows e no Linux. */
export function safeFileName (value: string): string {
  const clean = value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!clean) return 'Biblioteca';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean) ? `${clean}_` : clean;
}

export function concertPatchCount (concert: LibraryConcert): number {
  if (isObject(concert.snapshot) && Array.isArray(concert.snapshot.patches)) return concert.snapshot.patches.length;
  return concert.sets.reduce((sum, set) => sum + set.patches.length, 0);
}

export function concertSetCount (concert: LibraryConcert): number {
  if (isObject(concert.snapshot) && Array.isArray(concert.snapshot.sets)) return concert.snapshot.sets.length;
  return concert.sets.length;
}

export const countLibraryPatches = (library: LibraryFile): number =>
  library.concerts.reduce((sum, concert) => sum + concertPatchCount(concert), 0);

/** Converte um concert da biblioteca para a estrutura do gerador de coleções. */
export function concertToCollectionSets (concert: LibraryConcert): CollectionSet[] {
  return concert.sets.map((set) => [
    set.name,
    set.patches.map((patch): CollectionPatch => [patch.name, patch.layers, {
      programNumber: patch.programNumber,
      ...(patch.midiChannel !== undefined ? { midiChannel: patch.midiChannel } : {}),
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.inserts?.length ? { inserts: patch.inserts } : {}),
      ...(patch.master?.length ? { master: patch.master } : {}),
      ...(patch.sends ? { sends: patch.sends } : {}),
      ...(patch.auxPresets ? { auxPresets: patch.auxPresets } : {}),
    }]),
  ]);
}
