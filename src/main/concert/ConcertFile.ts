/**
 * Formato `.preseter` (Fase 2.1): criação, leitura, escrita e validação do
 * documento do concert. Funções puras — quem grava/lê o arquivo em disco é o
 * ConcertManager (Fase 2.2).
 */

import {
  BusSettings,
  Concert,
  ConcertBusSettings,
  ConcertMapping,
  ConcertSettings,
  ConcertStrip,
  LayoutConfig,
  PanLaw,
  Preset,
  PresetSet,
  PreseterConcertFile,
  StripOverride,
} from '../../shared/types';
import {
  CONCERT_FILE_FORMAT,
  CONCERT_FILE_VERSION,
  DEFAULT_TEMPO,
  DEFAULT_TIME_SIGNATURE,
} from '../../shared/constants';
import { MAX_AUX_BUSES, MAX_OUTPUT_BUSES } from '../../shared/types';

const PAN_LAWS: readonly PanLaw[] = [0, -3, -4.5, -6];

/** Gera um id curto e único o suficiente para o concert. */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const number = toFiniteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function toInteger(value: unknown, fallback: number): number {
  const number = toFiniteNumber(value, fallback);
  return Number.isInteger(number) ? number : Math.round(number);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Canal MIDI 0-15, ou null para "qualquer canal". */
function toChannel(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 15) return null;
  return value;
}

function toPanLaw(value: unknown, fallback: PanLaw): PanLaw {
  return PAN_LAWS.includes(value as PanLaw) ? (value as PanLaw) : fallback;
}

function toTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now();
}

/** Barramento padrão ("Aux 1".."Aux 4" / "Output 1".."Output 4"), sem inserts (Fase 3.2). */
export function createDefaultBus(): BusSettings {
  return { volumeDb: 0, pan: 0, muted: false, output: 1, inserts: [] };
}

/** Barramentos Aux/Output padrão de um concert (Fase 3.2). */
export function createDefaultBuses(): ConcertBusSettings {
  return {
    aux: Array.from({ length: MAX_AUX_BUSES }, () => createDefaultBus()),
    outputs: Array.from({ length: MAX_OUTPUT_BUSES }, () => createDefaultBus()),
  };
}

/** Configurações padrão de um concert novo. */
export function createDefaultConcertSettings(): ConcertSettings {
  return {
    timeSignature: { ...DEFAULT_TIME_SIGNATURE },
    midi: {
      cc7ControlsVolume: true,
      cc10ControlsPan: true,
      sendUnassignedMidiToStrips: false,
      transpose: 0,
      programChange: { device: '', channel: null },
      sendUnusedProgramChangeToStrips: false,
    },
    channelStrips: { panLaw: -3, panLawCompensated: false },
    metronome: { enabled: false, volumeDb: -12, accentFirstBeat: true },
    buses: createDefaultBuses(),
    notes: '',
  };
}

export function createEmptyLayout(tempo: number = DEFAULT_TEMPO): LayoutConfig {
  return { elements: [], background: null, tempo };
}

export function createEmptyConcert(name: string = 'Meu Concert', tempo: number = DEFAULT_TEMPO): Concert {
  const now = Date.now();
  return {
    id: newId('concert'),
    name,
    tempo,
    settings: createDefaultConcertSettings(),
    strips: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyConcertFile(name?: string, tempo?: number): PreseterConcertFile {
  return {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: createEmptyConcert(name, tempo),
    sets: [],
    patches: [],
    layout: createEmptyLayout(tempo),
    mappings: [],
  };
}

export interface ConcertFileInput {
  concert: Concert;
  sets: PresetSet[];
  patches: Preset[];
  layout: LayoutConfig;
  mappings: ConcertMapping[];
}

/** Monta o documento do concert, carimbando formato, versão e data de atualização. */
export function buildConcertFile(input: ConcertFileInput): PreseterConcertFile {
  return {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: { ...input.concert, updatedAt: Date.now() },
    sets: input.sets,
    patches: input.patches,
    layout: input.layout,
    mappings: input.mappings,
  };
}

/** Serializa o documento no texto gravado em `.preseter` (JSON legível). */
export function serializeConcertFile(file: PreseterConcertFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Lê um arquivo `.preseter`. Lança Error (mensagem em pt-BR) quando o texto não
 * é um concert válido; preenche padrões nos campos opcionais ausentes.
 */
export function parseConcertFile(text: string): PreseterConcertFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!isObject(raw)) {
    throw new Error('O arquivo .preseter precisa conter um objeto.');
  }

  if (raw.format !== CONCERT_FILE_FORMAT) {
    throw new Error('Este arquivo não é um concert do Preseter.');
  }

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('O arquivo .preseter não informa uma versão de formato válida.');
  }
  if (version > CONCERT_FILE_VERSION) {
    throw new Error(
      `Este concert foi salvo numa versão mais nova do Preseter (formato ${version}); atualize o app para abri-lo.`
    );
  }

  return {
    format: CONCERT_FILE_FORMAT,
    version,
    concert: normalizeConcert(raw.concert),
    sets: normalizeSets(raw.sets),
    patches: normalizeObjectArray<Preset>(raw.patches, 'patches'),
    layout: normalizeLayout(raw.layout),
    mappings: normalizeObjectArray<ConcertMapping>(raw.mappings, 'mappings'),
  };
}

function normalizeObjectArray<T>(value: unknown, field: string): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`O campo "${field}" do concert está inválido.`);
  }
  value.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`O item ${index + 1} do campo "${field}" é inválido.`);
    }
  });
  return value as T[];
}

/** Channel strips definidos no concert/set (Fase 3.3): só confere a forma básica. */
function normalizeStrips(value: unknown, field: string): ConcertStrip[] {
  return normalizeObjectArray<ConcertStrip>(value, field);
}

/** Sobreposições de strips (`{ [stripId]: StripOverride }`) de um set (Fase 3.3). */
function normalizeStripOverrides(value: unknown, field: string): Record<string, StripOverride> {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) {
    throw new Error(`O campo "${field}" do concert está inválido.`);
  }
  const overrides: Record<string, StripOverride> = {};
  for (const [stripId, override] of Object.entries(value)) {
    if (!isObject(override)) {
      throw new Error(`A sobreposição do channel strip "${stripId}" está inválida.`);
    }
    overrides[stripId] = override as StripOverride;
  }
  return overrides;
}

/** Sets do concert, normalizando os channel strips e as sobreposições (Fase 3.3). */
function normalizeSets(value: unknown): PresetSet[] {
  return normalizeObjectArray<PresetSet>(value, 'sets').map((set) => {
    const next: PresetSet = { ...set };
    if (set.strips !== undefined) {
      next.strips = normalizeStrips(set.strips, 'sets[].strips');
    }
    if (set.stripOverrides !== undefined) {
      next.stripOverrides = normalizeStripOverrides(set.stripOverrides, 'sets[].stripOverrides');
    }
    return next;
  });
}

function normalizeLayout(value: unknown): LayoutConfig {
  if (value === undefined || value === null) return createEmptyLayout();
  if (!isObject(value)) {
    throw new Error('O layout do concert está inválido.');
  }
  const elements = Array.isArray(value.elements) ? value.elements.filter(isObject) : [];
  return {
    elements: elements as unknown as LayoutConfig['elements'],
    background: typeof value.background === 'string' ? value.background : null,
    tempo: toPositiveNumber(value.tempo, DEFAULT_TEMPO),
  };
}

function normalizeConcert(value: unknown): Concert {
  if (!isObject(value)) {
    throw new Error('O concert do arquivo está ausente ou inválido.');
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') {
    throw new Error('O concert do arquivo não tem nome.');
  }
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : newId('concert'),
    name,
    tempo: toPositiveNumber(value.tempo, DEFAULT_TEMPO),
    settings: normalizeSettings(value.settings),
    strips: normalizeStrips(value.strips, 'concert.strips'),
    createdAt: toTimestamp(value.createdAt),
    updatedAt: toTimestamp(value.updatedAt),
  };
}

function normalizeBuses(value: unknown, defaults: ConcertBusSettings): ConcertBusSettings {
  const raw = isObject(value) ? value : {};
  const normalizeList = (list: unknown, fallback: BusSettings[]): BusSettings[] =>
    fallback.map((fallbackBus, index) => normalizeBus(Array.isArray(list) ? list[index] : undefined, fallbackBus));
  return {
    aux: normalizeList(raw.aux, defaults.aux),
    outputs: normalizeList(raw.outputs, defaults.outputs),
  };
}

function normalizeBus(value: unknown, fallback: BusSettings): BusSettings {
  if (!isObject(value)) return { ...fallback, inserts: [] };
  const volumeDb = toFiniteNumber(value.volumeDb, fallback.volumeDb);
  return {
    volumeDb: volumeDb >= -60 && volumeDb <= 6 ? volumeDb : fallback.volumeDb,
    pan: Math.max(-1, Math.min(1, toFiniteNumber(value.pan, fallback.pan))),
    muted: toBoolean(value.muted, fallback.muted),
    output: Math.max(1, Math.min(MAX_OUTPUT_BUSES, toInteger(value.output, fallback.output))),
    inserts: Array.isArray(value.inserts) ? (value.inserts.filter(isObject) as unknown as BusSettings['inserts']) : [],
  };
}

function normalizeSettings(value: unknown): ConcertSettings {
  const defaults = createDefaultConcertSettings();
  if (!isObject(value)) return defaults;

  const midi = isObject(value.midi) ? value.midi : {};
  const strips = isObject(value.channelStrips) ? value.channelStrips : {};
  const metronome = isObject(value.metronome) ? value.metronome : {};
  const programChange = isObject(midi.programChange) ? midi.programChange : {};
  const timeSignature = isObject(value.timeSignature) ? value.timeSignature : {};

  return {
    timeSignature: {
      numerator: toPositiveNumber(timeSignature.numerator, defaults.timeSignature.numerator),
      denominator: toPositiveNumber(timeSignature.denominator, defaults.timeSignature.denominator),
    },
    midi: {
      cc7ControlsVolume: toBoolean(midi.cc7ControlsVolume, defaults.midi.cc7ControlsVolume),
      cc10ControlsPan: toBoolean(midi.cc10ControlsPan, defaults.midi.cc10ControlsPan),
      sendUnassignedMidiToStrips: toBoolean(
        midi.sendUnassignedMidiToStrips,
        defaults.midi.sendUnassignedMidiToStrips
      ),
      transpose: toInteger(midi.transpose, defaults.midi.transpose),
      programChange: {
        device: typeof programChange.device === 'string' ? programChange.device : defaults.midi.programChange.device,
        channel: toChannel(programChange.channel),
      },
      sendUnusedProgramChangeToStrips: toBoolean(
        midi.sendUnusedProgramChangeToStrips,
        defaults.midi.sendUnusedProgramChangeToStrips
      ),
    },
    channelStrips: {
      panLaw: toPanLaw(strips.panLaw, defaults.channelStrips.panLaw),
      panLawCompensated: toBoolean(strips.panLawCompensated, defaults.channelStrips.panLawCompensated),
    },
    metronome: {
      enabled: toBoolean(metronome.enabled, defaults.metronome.enabled),
      volumeDb: toFiniteNumber(metronome.volumeDb, defaults.metronome.volumeDb),
      accentFirstBeat: toBoolean(metronome.accentFirstBeat, defaults.metronome.accentFirstBeat),
    },
    buses: normalizeBuses(value.buses, defaults.buses),
    notes: typeof value.notes === 'string' ? value.notes : defaults.notes,
  };
}

export interface LegacyConcertInput {
  /** Patches gravados pelo PresetManager antigo (um JSON por patch). */
  presets: Preset[];
  /** Sets que viviam no localStorage do renderer. */
  sets?: PresetSet[];
  /** Nome do concert que vivia no localStorage. */
  concertName?: string;
  tempo?: number;
  layout?: LayoutConfig | null;
}

/**
 * Migra os dados do modelo antigo (patches soltos + sets no localStorage) para
 * um concert `.preseter`. Os arquivos antigos não são tocados.
 */
export function migrateLegacyConcert(input: LegacyConcertInput): PreseterConcertFile {
  const now = Date.now();
  const tempo = toPositiveNumber(input.tempo, DEFAULT_TEMPO);
  const patches = (input.presets ?? []).map((preset) => ({
    ...preset,
    layout: preset.layout ?? createEmptyLayout(tempo),
  }));

  return {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: newId('concert'),
      name: (input.concertName ?? '').trim() || 'Meu Concert',
      tempo,
      settings: createDefaultConcertSettings(),
      strips: [],
      createdAt: now,
      updatedAt: now,
    },
    sets: input.sets ?? [],
    patches,
    layout: input.layout ?? createEmptyLayout(tempo),
    mappings: [],
  };
}
