import raw from './catalog.json';

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

export const EFFECTS: EffectDefinition[] = catalog.effects;
export const PANEL_EFFECTS: EffectDefinition[] = EFFECTS.filter((effect) => effect.nativePanel);
export const ORIGINAL_EDITOR_EFFECTS: EffectDefinition[] = EFFECTS.filter((effect) => !effect.nativePanel);

/** Normaliza nome/caminho para casar com a chave do catálogo. */
export function effectKey (text: string): string {
  const base = String(text ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  return base
    .replace(/\.(vst3|vst|dll|so|dylib)$/i, '')
    .replace(/^calfnxt/i, '')
    .replace(/^preseter/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

const byKey = new Map<string, EffectDefinition>();
for (const effect of EFFECTS) byKey.set(effect.match.toLowerCase(), effect);

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
  return !param.toggle
    && param.scale === 'linear'
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
