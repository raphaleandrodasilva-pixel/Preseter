import raw from './catalog.json';
import guitarixRaw from './guitarix.json';

export type EffectScale = 'linear' | 'dB' | 'log';

export interface EffectParam {
  /** Índice do parâmetro no VST (é o que `setParam` espera). */
  index: number;
  /** Id interno do schema do plugin (ex.: `room_size`). */
  id: string;
  /** Nome original (com o Unicode correto). */
  name: string;
  /** Nome como o engine/VST reporta (pode vir com acento quebrado). */
  engineName: string;
  /** Rótulo curto em português. */
  label: string;
  unit: string;
  min: number;
  max: number;
  default: number;
  scale: EffectScale;
  precision: number;
  /** 0..1 sem casas decimais: renderiza como liga/desliga. */
  toggle: boolean;
  /** Rótulos das escolhas (LV2 scale points), indexados pelo valor inteiro. */
  choices?: string[];
  group: string;
  collapsed: boolean;
}

export interface EffectPreset {
  id: string;
  label: string;
  /** Índice do parâmetro (string no JSON) → valor normalizado 0..1. */
  values: Record<string, number>;
}

export interface EffectDefinition {
  id: string;
  bundle: string;
  /** Chave curta para casar com o nome/caminho do plugin (`Reverb`). */
  match: string;
  displayName: string;
  shortName: string;
  category: string;
  /** Painel Preseter. `false` = abre o editor original do plugin. */
  nativePanel: boolean;
  /** Origem do DSP (define o badge do painel). */
  source?: 'calfnxt' | 'guitarix';
  /** Mostrar o botão “Editor original” (UI xputty/X11 não abre no Windows). */
  originalEditor?: boolean;
  /** Nomes alternativos que o plugin reporta (ex.: `GxTubeScreamer`). */
  pluginNames?: string[];
  paramCount: number;
  subtitle: string;
  params: EffectParam[];
  presets: EffectPreset[];
}

interface CatalogFile {
  version: number;
  effects: EffectDefinition[];
}

const catalog = raw as unknown as CatalogFile;
const guitarix = guitarixRaw as unknown as CatalogFile;

export const EFFECTS: EffectDefinition[] = [...catalog.effects, ...guitarix.effects];
export const PANEL_EFFECTS: EffectDefinition[] = EFFECTS.filter((effect) => effect.nativePanel);
export const ORIGINAL_EDITOR_EFFECTS: EffectDefinition[] = EFFECTS.filter((effect) => !effect.nativePanel);

/**
 * Normaliza nome/caminho/URI para casar com a chave do catálogo.
 * LV2 usa URI (`http://…/gxts9#ts9sim`): fica o trecho do bundle (`gxts9`).
 */
export function effectKey (text: string): string {
  const clean = String(text ?? '').replace(/\\/g, '/').split('#')[0];
  const base = clean.split('/').filter(Boolean).pop() ?? '';
  return base
    .replace(/\.(vst3|vst|dll|so|dylib|lv2)$/i, '')
    .replace(/^calfnxt/i, '')
    .replace(/^preseter/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

const byKey = new Map<string, EffectDefinition>();
for (const effect of EFFECTS) {
  const keys = [
    effect.match,
    effectKey(effect.displayName),
    effectKey(effect.shortName),
    effectKey(effect.id),
    ...(effect.pluginNames ?? []).map(effectKey),
  ];
  for (const key of keys) if (key) byKey.set(key.toLowerCase(), effect);
}

/** Acha o efeito pelo caminho do plugin, nome do plugin ou nome Preseter. */
export function findEffect (pathOrName: string): EffectDefinition | undefined {
  if (!pathOrName) return undefined;
  const key = effectKey(pathOrName);
  return byKey.get(key) ?? byKey.get(`calfnxt${key}`) ?? byKey.get(`preseter${key}`);
}

/** Nome exibido para um insert (Preseter Reverb etc.), com fallback no original. */
export function effectDisplayName (pathOrName: string, fallback: string): string {
  return findEffect(pathOrName)?.displayName ?? fallback;
}

/**
 * Valores de um preset do catálogo, já no formato que o motor usa em `setParam`
 * (índice do parâmetro → valor normalizado 0..1). Lista vazia se o efeito ou o
 * preset não existirem.
 *
 * Em insert de Aux (`aux: true`), um preset sem sufixo (`hall`) usa a versão
 * `hall-aux` (Seco −60 dB / Molhado 0 dB) quando ela existir; sem ela, cai no
 * preset original. Isso mantém coleções antigas corretas.
 */
export function effectPresetValues (
  pathOrName: string,
  presetId: string | undefined,
  options: { aux?: boolean } = {}
): Array<{ index: number; value: number }> {
  if (!presetId) return [];
  const effect = findEffect(pathOrName);
  if (!effect) return [];
  const candidates = options.aux && !presetId.endsWith('-aux')
    ? [`${presetId}-aux`, presetId]
    : [presetId];
  const preset = candidates
    .map((id) => effect.presets.find((entry) => entry.id === id))
    .find((entry) => entry !== undefined);
  if (!preset) return [];
  return Object.entries(preset.values)
    .map(([index, value]) => ({ index: Number(index), value }))
    .filter((entry) => Number.isSafeInteger(entry.index))
    .sort((a, b) => a.index - b.index);
}

export const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Valor real do parâmetro a partir do normalizado 0..1. */
export function paramReal (param: EffectParam, normalized: number): number {
  return param.min + clamp01(normalized) * (param.max - param.min);
}

/** Normalizado 0..1 a partir do valor real. */
export function paramNormalized (param: EffectParam, real: number): number {
  const span = param.max - param.min;
  if (!Number.isFinite(span) || span === 0) return 0;
  return clamp01((real - param.min) / span);
}

const usesLogCurve = (param: EffectParam): boolean =>
  param.scale === 'log' && param.min > 0 && param.max > param.min;

/**
 * Posição do knob (0..1) a partir do valor normalizado. Em parâmetros `log` a
 * curva é exponencial (como no plugin), senão é linear.
 */
export function paramPosition (param: EffectParam, normalized: number): number {
  if (!usesLogCurve(param)) return clamp01(normalized);
  const real = paramReal(param, normalized);
  return clamp01(Math.log(real / param.min) / Math.log(param.max / param.min));
}

/** Normalizado a partir da posição do knob (inverso de `paramPosition`). */
export function positionToNormalized (param: EffectParam, position: number): number {
  if (!usesLogCurve(param)) return clamp01(position);
  const real = param.min * Math.pow(param.max / param.min, clamp01(position));
  return paramNormalized(param, real);
}

const PLAIN_UNITS = new Set(['%', '°', '×', ':1']);

/** Texto do valor no padrão do plugin (ex.: `-12.0 dB`, `0.75`, `4.0:1`). */
export function formatParam (param: EffectParam, normalized: number): string {
  const real = paramReal(param, normalized);
  const digits = Math.max(0, Math.min(4, param.precision ?? 2));
  const text = real.toFixed(digits);
  if (!param.unit) return text;
  if (PLAIN_UNITS.has(param.unit) || param.unit.startsWith(':')) return `${text}${param.unit}`;
  return `${text} ${param.unit}`;
}

/** Parâmetros que devem aparecer como escolha (0..N inteiro) em vez de knob. */
export function isChoice (param: EffectParam): boolean {
  if (param.toggle) return false;
  if (param.choices && param.choices.length > 0) return true;
  return param.scale === 'linear'
    && param.precision === 0
    && param.max > param.min
    && param.max - param.min <= 8;
}

/** Default do parâmetro já normalizado. */
export const paramDefault = (param: EffectParam): number =>
  paramNormalized(param, param.default);

/**
 * Agrupa os parâmetros na ordem do schema, mas deixa "Controles" no topo e
 * "Avançado" (entrada/saída/utilitários) no fim.
 */
export function groupParams (params: EffectParam[]): Array<{ title: string; collapsed: boolean; params: EffectParam[] }> {
  const groups: Array<{ title: string; collapsed: boolean; params: EffectParam[] }> = [];
  for (const param of params) {
    let group = groups.find((item) => item.title === param.group);
    if (!group) {
      group = { title: param.group, collapsed: param.collapsed, params: [] };
      groups.push(group);
    }
    group.params.push(param);
  }
  const priority = (title: string): number =>
    title === 'Controles' ? 0 : title === 'Avançado' ? 2 : 1;
  return groups.sort((a, b) => priority(a.title) - priority(b.title));
}
