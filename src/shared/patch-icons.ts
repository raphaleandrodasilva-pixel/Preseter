/**
 * Catálogo dos ícones de patch (SVG) e sugestão automática pelo nome.
 *
 * O campo `Preset.icon` continua sendo uma string livre: os IDs novos são
 * renderizados como SVG, enquanto emojis antigos seguem aparecendo como texto.
 */

export const PATCH_ICON_IDS = [
  'piano',
  'epiano',
  'organ',
  'strings',
  'brass',
  'flute',
  'choir',
  'pad',
  'pad-dark',
  'pad-bright',
  'lead',
  'bass',
  'guitar',
  'drums',
  'synth',
  'split',
  'layer',
  'mic',
  'bell',
  'star',
  'fire',
  'wave',
  'generic',
  'none',
] as const;

export type PatchIconId = (typeof PATCH_ICON_IDS)[number];

export const PATCH_ICON_LABELS: Record<PatchIconId, string> = {
  piano: 'Piano',
  epiano: 'Piano elétrico',
  organ: 'Órgão',
  strings: 'Cordas',
  brass: 'Metais',
  flute: 'Flauta',
  choir: 'Coral',
  pad: 'Pad',
  'pad-dark': 'Pad escuro',
  'pad-bright': 'Pad brilhante',
  lead: 'Lead',
  bass: 'Baixo',
  guitar: 'Guitarra',
  drums: 'Bateria',
  synth: 'Synth',
  split: 'Split',
  layer: 'Layer',
  mic: 'Microfone',
  bell: 'Sino',
  star: 'Estrela',
  fire: 'Fogo',
  wave: 'Onda',
  generic: 'Genérico',
  none: 'Nenhum',
};

const PATCH_ICON_SET = new Set<string>(PATCH_ICON_IDS);

export function isPatchIconId(value: unknown): value is PatchIconId {
  return typeof value === 'string' && PATCH_ICON_SET.has(value);
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Regras em ordem de prioridade: a primeira que casar define o ícone. */
const SUGGESTION_RULES: Array<{ icon: PatchIconId; pattern: RegExp }> = [
  { icon: 'pad-dark', pattern: /\bpad\b.*(escuro|dark)|(escuro|dark).*\bpad\b/ },
  { icon: 'pad-bright', pattern: /\bpad\b.*(brilhante|bright)|(brilhante|bright).*\bpad\b/ },
  { icon: 'guitar', pattern: /guitarra|violao|guitar/ },
  { icon: 'drums', pattern: /bateria|drum|percuss/ },
  { icon: 'bass', pattern: /baixos?|\bbass\b|\bsub\b/ },
  { icon: 'mic', pattern: /microfone|\bmic\b/ },
  { icon: 'epiano', pattern: /\bpiano\b.*(eletr|el[eé]tr)|rhodes|wurli|e-?piano/ },
  { icon: 'piano', pattern: /\bpiano\b|acustic|grand piano/ },
  { icon: 'organ', pattern: /orgao|organ|hammond/ },
  { icon: 'strings', pattern: /cordas|string|violino|viola\b|cello|orquestra/ },
  { icon: 'brass', pattern: /metais|brass|trompete|trombone|sax|tuba|trompa/ },
  { icon: 'flute', pattern: /flauta|flute/ },
  { icon: 'choir', pattern: /coral|choir|voz|vocal/ },
  { icon: 'pad', pattern: /\bpads?\b/ },
  { icon: 'lead', pattern: /\bleads?\b|pluck|\barp\b|arpejo/ },
  { icon: 'synth', pattern: /synth|sintetizador|sintetiz/ },
  { icon: 'split', pattern: /split/ },
  { icon: 'layer', pattern: /layer|tripla|camada/ },
  { icon: 'bell', pattern: /sino|bell/ },
  { icon: 'star', pattern: /estrela|\bstar\b/ },
  { icon: 'fire', pattern: /fogo|\bfire\b/ },
  { icon: 'wave', pattern: /onda|\bwave\b/ },
];

/**
 * Sugere um ícone a partir do nome do patch e, se não houver match, do set.
 * O retorno nunca é vazio: sem match, usa `generic`.
 */
export function suggestPatchIcon(name?: string | null, setName?: string | null): PatchIconId {
  for (const source of [name, setName]) {
    if (!source) continue;
    const text = normalize(source);
    for (const rule of SUGGESTION_RULES) {
      if (rule.pattern.test(text)) return rule.icon;
    }
  }
  return 'generic';
}
