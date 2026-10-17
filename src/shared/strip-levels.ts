/**
 * Visões de um channel strip por nível (Fase 3.3).
 *
 * Um strip definido no concert ou no set pode ter cada atributo sobreposto por
 * um nível mais específico. A UI precisa mostrar o valor do nível que está
 * editando, além de saber quando um nível de baixo (patch > set > concert) está
 * ganhando. Aqui ficam essa visão e a escrita/limpeza das sobreposições — funções
 * puras, sem motor nem disco.
 */

import {
  ConcertStrip,
  EffectiveStrip,
  Insert,
  Preset,
  StripAttribute,
  StripLevel,
  StripOverride,
} from './types';
import { resolveStrips } from './concert-strips';

/** Nível onde a UI grava o que o usuário edita (o mais específico vence). */
export type StripEditTarget = StripLevel;

/** Valor de um atributo de strip (número, booleano, lista de sends ou inserts). */
export type StripValue = number | boolean | number[] | Insert[];

/** Quanto menor, mais específico (patch > set > concert). */
const SPECIFICITY: Record<StripLevel, number> = { patch: 0, set: 1, concert: 2 };

export interface StripLevelViews {
  /** Valores como o concert os define (sem set nem patch). */
  concert: EffectiveStrip[];
  /** Valores com os strips e as sobreposições do set. */
  set: EffectiveStrip[];
  /** Valores finais no patch (tudo aplicado). */
  patch: EffectiveStrip[];
}

export interface StripLevelInput {
  concertStrips?: ConcertStrip[];
  setStrips?: ConcertStrip[];
  setOverrides?: Record<string, StripOverride>;
  /** Patch atual (traz `plugins` e `stripOverrides`). */
  patch?: Preset | null;
}

/**
 * Resolve os strips nos três níveis. Cada nível usa o mesmo resolver do main,
 * então o que a UI mostra é exatamente o que o motor vai aplicar.
 */
export function stripLevelViews(input: StripLevelInput): StripLevelViews {
  const upToSet = {
    concertStrips: input.concertStrips,
    setStrips: input.setStrips,
    setOverrides: input.setOverrides,
    patchId: '',
  };
  return {
    concert: resolveStrips({ concertStrips: input.concertStrips, patchId: '' }),
    set: resolveStrips(upToSet),
    patch: resolveStrips({
      ...upToSet,
      patchStrips: input.patch?.plugins,
      patchId: input.patch?.id ?? '',
      patchOverrides: input.patch?.stripOverrides,
    }),
  };
}

/** Níveis que um strip aceita: onde ele é definido e quem pode sobrepô-lo. */
export function stripTargets(level: StripLevel): StripEditTarget[] {
  if (level === 'concert') return ['patch', 'set', 'concert'];
  if (level === 'set') return ['patch', 'set'];
  return ['patch'];
}

/** Strip como ele vale no nível pedido (o que os controles mostram). */
export function viewAt(
  views: StripLevelViews,
  target: StripEditTarget,
  stripId: string
): EffectiveStrip | undefined {
  return views[target].find((strip) => strip.id === stripId);
}

/** Nível que define o valor final do atributo no patch (undefined = ninguém). */
export function effectiveSource(
  full: EffectiveStrip | undefined,
  attr: StripAttribute
): StripLevel | undefined {
  return full?.sources[attr];
}

/** true quando um nível mais específico que `target` define este atributo. */
export function isMasked(
  full: EffectiveStrip | undefined,
  target: StripEditTarget,
  attr: StripAttribute
): boolean {
  const source = effectiveSource(full, attr);
  if (!source) return false;
  return SPECIFICITY[source] < SPECIFICITY[target];
}

/** Atributos (na ordem de `STRIP_ATTRIBUTES`) definidos acima do nível atual. */
export function maskedAttributes(
  full: EffectiveStrip | undefined,
  target: StripEditTarget,
  attributes: readonly StripAttribute[]
): StripAttribute[] {
  return attributes.filter((attr) => isMasked(full, target, attr));
}

/** Escreve um atributo na sobreposição de um strip (patch ou set). */
export function withOverride(
  overrides: Record<string, StripOverride> | undefined,
  stripId: string,
  attr: StripAttribute,
  value: StripValue
): Record<string, StripOverride> {
  const current = overrides ?? {};
  return { ...current, [stripId]: { ...(current[stripId] ?? {}), [attr]: value } };
}

/**
 * Remove a sobreposição de um atributo ("voltar ao herdado"). Quando o strip
 * fica sem nenhuma sobreposição, a entrada dele sai do mapa.
 */
export function clearOverride(
  overrides: Record<string, StripOverride> | undefined,
  stripId: string,
  attr: StripAttribute
): Record<string, StripOverride> {
  const current = overrides?.[stripId];
  if (!overrides || !current || !(attr in current)) return overrides ?? {};
  const { [attr]: _removed, ...rest } = current;
  const next = { ...overrides };
  if (Object.keys(rest).length === 0) delete next[stripId];
  else next[stripId] = rest;
  return next;
}

/** Mixagem padrão de um strip, completando o que faltar. */
function stripMix(strip: ConcertStrip) {
  return {
    volumeDb: strip.mix?.volumeDb ?? 0,
    pan: strip.mix?.pan ?? 0,
    muted: strip.mix?.muted ?? false,
    solo: strip.mix?.solo ?? false,
  };
}

/** Escreve um atributo na definição de um strip (concert/set). */
export function withStripValue(
  strip: ConcertStrip,
  attr: StripAttribute,
  value: StripValue
): ConcertStrip {
  switch (attr) {
    case 'volumeDb':
      return { ...strip, mix: { ...stripMix(strip), volumeDb: value as number } };
    case 'pan':
      return { ...strip, mix: { ...stripMix(strip), pan: value as number } };
    case 'muted':
      return { ...strip, mix: { ...stripMix(strip), muted: value as boolean } };
    case 'solo':
      return { ...strip, mix: { ...stripMix(strip), solo: value as boolean } };
    case 'minNote':
      return { ...strip, minNote: value as number };
    case 'maxNote':
      return { ...strip, maxNote: value as number };
    case 'output':
      return { ...strip, output: value as number };
    case 'sends':
      return { ...strip, sends: value as number[] };
    case 'inserts':
      return { ...strip, inserts: value as Insert[] };
    default:
      return strip;
  }
}

/** Substitui um strip na lista pelo id (devolve a lista original se não achar). */
export function replaceStrip(strips: ConcertStrip[], next: ConcertStrip): ConcertStrip[] {
  return strips.map((strip) => (strip.id === next.id ? next : strip));
}
