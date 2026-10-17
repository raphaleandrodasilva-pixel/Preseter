/**
 * Resolução dos channel strips por nível (Fase 3.3).
 *
 * Um channel strip pode ser definido no concert, no set ou no patch. O patch
 * enxerga os strips dos três níveis; cada atributo vale o valor do nível mais
 * específico que o definir (patch > set > concert). Um strip do concert pode ser
 * sobreposto pelo set e pelo patch; um strip do set, só pelo patch.
 *
 * Funções puras: nada aqui fala com o motor nem com o disco.
 */

import {
  ConcertStrip,
  EffectiveStrip,
  Insert,
  MAX_AUX_BUSES,
  PresetPluginAssignment,
  SEND_OFF_DB,
  STRIP_ATTRIBUTES,
  StripAttribute,
  StripLevel,
  StripOverride,
} from './types';

/** Região de notas padrão de um strip (todas as notas). */
export const DEFAULT_STRIP_MIN_NOTE = 0;
export const DEFAULT_STRIP_MAX_NOTE = 127;
/** Saída padrão de um strip (Output 1). */
export const DEFAULT_STRIP_OUTPUT = 1;

/** Sends todos desligados (-60 dB). */
export function defaultSends(): number[] {
  return Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB);
}

/** Id do layer de um strip do patch (`Preset.plugins[i]`). */
export function patchStripId(
  presetId: string,
  assignment: PresetPluginAssignment,
  index: number
): string {
  const explicit = typeof assignment.layerId === 'string' ? assignment.layerId.trim() : '';
  return explicit !== '' ? explicit : `${presetId}:layer:${index}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampDb(value: unknown, fallback = 0): number {
  return isNumber(value) ? clamp(value, -60, 6) : fallback;
}

function clampPan(value: unknown, fallback = 0): number {
  return isNumber(value) ? clamp(value, -1, 1) : fallback;
}

function clampNote(value: unknown, fallback: number): number {
  return isNumber(value) ? clamp(Math.round(value), 0, 127) : fallback;
}

function outputNumber(value: unknown): number {
  return isNumber(value) ? clamp(Math.round(value), 1, 4) : DEFAULT_STRIP_OUTPUT;
}

function normalizeSends(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [];
  return defaultSends().map((off, index) =>
    isNumber(list[index]) ? clamp(list[index] as number, SEND_OFF_DB, 6) : off
  );
}

/** Mantém apenas inserts com slot e caminho válidos. */
function normalizeInserts(value: unknown): Insert[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Insert =>
        !!item &&
        typeof item === 'object' &&
        isNumber((item as Insert).slot) &&
        typeof (item as Insert).path === 'string' &&
        (item as Insert).path !== ''
    )
    .map((item) => ({
      slot: clamp(Math.round(item.slot), 0, 3),
      pluginId: typeof item.pluginId === 'string' ? item.pluginId : '',
      name: typeof item.name === 'string' && item.name !== '' ? item.name : 'Efeito',
      path: item.path,
      bypass: item.bypass === true,
    }))
    .sort((a, b) => a.slot - b.slot);
}

function normalizeRange(minNote: unknown, maxNote: unknown): [number, number] {
  const min = clampNote(minNote, DEFAULT_STRIP_MIN_NOTE);
  const max = clampNote(maxNote, DEFAULT_STRIP_MAX_NOTE);
  return min <= max ? [min, max] : [max, min];
}

function allSources(level: StripLevel): Partial<Record<StripAttribute, StripLevel>> {
  const sources: Partial<Record<StripAttribute, StripLevel>> = {};
  for (const attribute of STRIP_ATTRIBUTES) sources[attribute] = level;
  return sources;
}

function roleOf(value: unknown): 'instrument' | 'effect' {
  return value === 'effect' ? 'effect' : 'instrument';
}

export interface ResolveStripsInput {
  /** Strips definidos no concert (`Concert.strips`). */
  concertStrips?: ConcertStrip[];
  /** Strips definidos no set do patch (`PresetSet.strips`). */
  setStrips?: ConcertStrip[];
  /** Strips do patch (`Preset.plugins`). */
  patchStrips?: PresetPluginAssignment[];
  /** Id do patch; usado para montar o id dos layers sem `layerId` próprio. */
  patchId: string;
  /** Sobrepõe os strips do concert dentro do set (`PresetSet.stripOverrides`). */
  setOverrides?: Record<string, StripOverride>;
  /** Sobrepõe os strips herdados dentro do patch (`Preset.stripOverrides`). */
  patchOverrides?: Record<string, StripOverride>;
}

/**
 * Strips visíveis em um patch: os do patch primeiro, depois os herdados do set
 * e do concert (`level` diz de onde cada um vem).
 */
export function resolveStrips(input: ResolveStripsInput): EffectiveStrip[] {
  const resolved: EffectiveStrip[] = (input.patchStrips ?? []).map((assignment, index) =>
    effectiveFromPatch(input.patchId, assignment, index)
  );

  const seen = new Set<string>(resolved.map((strip) => strip.id));
  const addInherited = (strips: ConcertStrip[] | undefined, level: 'concert' | 'set') => {
    for (const strip of strips ?? []) {
      if (!strip || typeof strip.id !== 'string' || strip.id === '' || seen.has(strip.id)) continue;
      // O set pode sobrepor o strip do concert; o patch, qualquer um dos dois.
      const chain: Array<[Record<string, StripOverride> | undefined, StripLevel]> =
        level === 'concert'
          ? [
              [input.setOverrides, 'set'],
              [input.patchOverrides, 'patch'],
            ]
          : [[input.patchOverrides, 'patch']];
      seen.add(strip.id);
      resolved.push(effectiveFromInherited(strip, level, chain));
    }
  };

  addInherited(input.setStrips, 'set');
  addInherited(input.concertStrips, 'concert');
  return resolved;
}

function effectiveFromPatch(
  presetId: string,
  assignment: PresetPluginAssignment,
  index: number
): EffectiveStrip {
  const [minNote, maxNote] = normalizeRange(assignment.minNote, assignment.maxNote);
  return {
    id: patchStripId(presetId, assignment, index),
    name: assignment.name,
    pluginId: assignment.pluginId,
    path: assignment.path,
    role: roleOf(assignment.role),
    level: 'patch',
    volumeDb: clampDb(assignment.mix?.volumeDb),
    pan: clampPan(assignment.mix?.pan),
    muted: assignment.mix?.muted === true,
    solo: assignment.mix?.solo === true,
    minNote,
    maxNote,
    output: outputNumber(assignment.output),
    sends: normalizeSends(assignment.sends),
    inserts: normalizeInserts(assignment.inserts),
    sources: allSources('patch'),
  };
}

function effectiveFromInherited(
  strip: ConcertStrip,
  level: 'concert' | 'set',
  chain: Array<[Record<string, StripOverride> | undefined, StripLevel]>
): EffectiveStrip {
  const [minNote, maxNote] = normalizeRange(strip.minNote, strip.maxNote);
  const result: EffectiveStrip = {
    id: strip.id,
    name: typeof strip.name === 'string' && strip.name !== '' ? strip.name : 'Channel Strip',
    pluginId: strip.pluginId,
    path: strip.path,
    role: roleOf(strip.role),
    level,
    volumeDb: clampDb(strip.mix?.volumeDb),
    pan: clampPan(strip.mix?.pan),
    muted: strip.mix?.muted === true,
    solo: strip.mix?.solo === true,
    minNote,
    maxNote,
    output: outputNumber(strip.output),
    sends: normalizeSends(strip.sends),
    inserts: normalizeInserts(strip.inserts),
    sources: allSources(level),
  };

  for (const [overrides, overrideLevel] of chain) {
    const override = strip.id ? overrides?.[strip.id] : undefined;
    if (!override) continue;

    if (isNumber(override.volumeDb)) {
      result.volumeDb = clampDb(override.volumeDb);
      result.sources.volumeDb = overrideLevel;
    }
    if (isNumber(override.pan)) {
      result.pan = clampPan(override.pan);
      result.sources.pan = overrideLevel;
    }
    if (typeof override.muted === 'boolean') {
      result.muted = override.muted;
      result.sources.muted = overrideLevel;
    }
    if (typeof override.solo === 'boolean') {
      result.solo = override.solo;
      result.sources.solo = overrideLevel;
    }
    if (isNumber(override.minNote)) {
      result.minNote = clampNote(override.minNote, result.minNote);
      result.sources.minNote = overrideLevel;
    }
    if (isNumber(override.maxNote)) {
      result.maxNote = clampNote(override.maxNote, result.maxNote);
      result.sources.maxNote = overrideLevel;
    }
    if (isNumber(override.output)) {
      result.output = outputNumber(override.output);
      result.sources.output = overrideLevel;
    }
    if (Array.isArray(override.sends)) {
      result.sends = normalizeSends(override.sends);
      result.sources.sends = overrideLevel;
    }
    if (Array.isArray(override.inserts)) {
      result.inserts = normalizeInserts(override.inserts);
      result.sources.inserts = overrideLevel;
    }
  }

  // Depois das sobreposições, garante uma região válida.
  if (result.minNote > result.maxNote) result.maxNote = result.minNote;
  return result;
}
