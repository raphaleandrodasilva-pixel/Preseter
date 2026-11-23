import type { ArpSettings } from '../../types';
import {
  FX,
  N,
  PATCH_FX,
  S,
  type CollectionLayerSpec,
  type CollectionPatch,
  type CollectionSet,
  type EffectSpec,
  type SampleSpec,
} from '../../collection-presets';
import voices from './voices.json';

/**
 * Coleção Workstation: 6 bancos de 128 posições, organizados por categoria.
 *
 * As receitas são próprias do Preseter e valem por subcategoria. Não contêm
 * nomes, parâmetros nem amostras de nenhum fabricante: `voices.json` guarda só
 * a categoria de cada posição.
 */
export const WORKSTATION_BANKS = ['PRE1', 'PRE2', 'PRE3', 'PRE4', 'PRE5', 'PRE6'] as const;
export type WorkstationBank = (typeof WORKSTATION_BANKS)[number];

type Source = (label: string) => CollectionLayerSpec[];
interface Space {
  r?: { preset: string; db: number };
  d?: { preset: string; db: number };
}
interface Recipe {
  label: string;
  sources: Source[];
  chains: EffectSpec[][];
  spaces: Space[];
}

// ---- Fontes -----------------------------------------------------------------

const sample = (library: SampleSpec['library'], base: Partial<SampleSpec>) =>
  (program: number, options: Partial<SampleSpec> = {}, db = -3): Source =>
    (label) => [S(db, 0, 127, label, { library, bank: 0, program, ...base, ...options })];

/** Sons sustentados do MuseScore General (programas GM). */
const gm = sample('musescore', { loop: true, release: 0.35, polyphony: 32 });
/** Sons percutidos/dedilhados do MuseScore General. */
const gmHit = sample('musescore', { loop: false, release: 0.3, polyphony: 32 });
const son = sample('sonatina', { loop: true, release: 0.45, polyphony: 24 });

const piano = (options: Partial<SampleSpec> = {}, db = -2): Source =>
  (label) => [S(db, 0, 127, label, {
    library: 'salamander', loop: false, velocity: 1, polyphony: 64, ...options,
  })];

const kit = (program: number): Source =>
  (label) => [S(-3, 0, 127, label, {
    library: 'musescore', bank: 128, program, loop: false, release: 0.05, velocity: 1, polyphony: 32,
  })];

type NativeName = NonNullable<CollectionLayerSpec['nativeInstrument']>;
const native = (instrument: NativeName) =>
  (program: number, db = -3, extra: Partial<CollectionLayerSpec> = {}): Source =>
    (label) => [N(instrument, db, 0, 127, label, program, extra)];

const organ = native('organ');
const tines = native('tines');
const reeds = native('reeds');
const dx = native('dx');
const jx = native('jx');
const synth2 = native('synth2');

const arp = (mode: ArpSettings['mode'], rate: ArpSettings['rate'], octaves: number): ArpSettings => ({
  enabled: true, mode, rate, octaves, gate: 50, swing: 0, hold: false,
});
const jxArp = (program: number, settings: ArpSettings): Source => jx(program, -3, { arp: settings });

/** Duas fontes juntas, com a segunda mais baixa. */
const stack = (main: Source, support: Source): Source => (label) => [
  ...main(`${label} principal`),
  ...support(`${label} apoio`).map((layer) => ({ ...layer, db: layer.db - 6 })),
];

/** Troca de fonte por velocity. */
const byVelocity = (soft: Source, hard: Source, at = 96): Source => (label) => [
  ...soft(`${label} suave`).map((layer) => ({ ...layer, velocityMin: 1, velocityMax: at - 1 })),
  ...hard(`${label} forte`).map((layer) => ({ ...layer, velocityMin: at, velocityMax: 127 })),
];

/** Split do teclado: `low` até a nota anterior a `key`, `high` a partir dela. */
const split = (low: Source, high: Source, key = 60): Source => (label) => [
  ...low(`${label} grave`).map((layer) => ({ ...layer, min: 0, max: key - 1 })),
  ...high(`${label} agudo`).map((layer) => ({ ...layer, min: key, max: 127 })),
];

const range = <T>(from: number, to: number, build: (value: number) => T): T[] =>
  Array.from({ length: to - from + 1 }, (_, index) => build(from + index));

// ---- Efeitos ----------------------------------------------------------------

const eq = (preset: string) => FX('calfNXT Equalizer', preset);
const comp = (preset: string) => FX('calfNXT Compressor', preset);
const chorus = (preset: string) => FX('calfNXT Chorus', preset);
const phaser = (preset: string) => FX('calfNXT Phaser', preset);
const flanger = (preset: string) => FX('calfNXT Flanger', preset);
const pulsator = (preset: string) => FX('calfNXT Pulsator', preset);
const stereo = (preset: string) => FX('calfNXT Stereo', preset);
const harmonics = (preset: string) => FX('calfNXT Harmonics', preset);
const transients = (preset: string) => FX('calfNXT Transients', preset);
const filter = (preset: string) => FX('calfNXT Filter', preset);
const crusher = (preset: string) => FX('calfNXT Crusher', preset);
const ringMod = (preset: string) => FX('calfNXT Ringmodulator', preset);
// Amp e Overdrive do Guitarix são mono: só em guitarras e leads.
const amp = (preset: string) => FX('Preseter Amp', preset);
const overdrive = (preset: string) => FX('Preseter Overdrive', preset);

const space = (reverb?: [string, number], delay?: [string, number]): Space => ({
  ...(reverb ? { r: { preset: reverb[0], db: reverb[1] } } : {}),
  ...(delay ? { d: { preset: delay[0], db: delay[1] } } : {}),
});

const ROOMS = [space(['room', -16]), space(['chamber', -14]), space(['hall', -14]), space(['plate', -16])];
const KEY_SPACES = [
  space(['plate', -16]),
  space(['room', -16], ['slap', -22]),
  space(['plate', -14], ['echo', -22]),
  space(['chamber', -14]),
];
const HALLS = [space(['hall', -10]), space(['chamber', -12]), space(['hall', -14]), space(['arena', -12])];
const SYNTH_SPACES = [
  space(['plate', -16], ['echo', -20]),
  space(['hall', -14]),
  space(['plate', -14], ['pingpong', -18]),
  space(['room', -18], ['dotted', -18]),
];
const WIDE_SPACES = [
  space(['hall', -10]),
  space(['arena', -8]),
  space(['hall', -12], ['ambient', -16]),
  space(['plate', -12], ['echo', -18]),
];
const DRY_SPACES = [space(), space(['room', -24]), space(['booth', -20]), space(['room', -20], ['slap', -26])];

// ---- Receitas por subcategoria ----------------------------------------------

const RECIPES: Record<string, Recipe> = {
  'Ap/A PIANO': {
    label: 'Grand Piano',
    sources: [
      piano(),
      piano({ cutoff: 14000 }, -1),
      piano({ cutoff: 5500, attack: 0.004, release: 0.25, velocity: 0.75 }, -3),
      piano({ cutoff: 9000, velocity: 0.9 }),
    ],
    chains: [[eq('piano')], [eq('piano'), comp('piano')], [eq('presence'), comp('bus')], [comp('piano')]],
    spaces: ROOMS,
  },
  'Ap/OTHER': {
    label: 'Piano Layer',
    sources: [
      stack(piano(), synth2(8)),
      stack(piano(), son(2)),
      stack(piano({ cutoff: 9000 }), dx(0)),
      stack(piano(), jx(27)),
      gmHit(3),
    ],
    chains: [[eq('piano')], [eq('piano'), comp('bus')], [comp('piano'), stereo('wide')]],
    spaces: ROOMS,
  },
  'Ap/E GRAND': {
    label: 'Electric Grand',
    sources: [gmHit(2)],
    chains: [[eq('teclas'), comp('piano'), chorus('subtle')]],
    spaces: KEY_SPACES,
  },
  'Kb/E.PIANO': {
    label: 'Electric Piano',
    sources: [
      tines(0), tines(1), tines(2), tines(3),
      reeds(0),
      dx(0), dx(1), dx(2), dx(3),
      byVelocity(tines(2), dx(0)),
      byVelocity(tines(0), tines(3)),
      gmHit(4), gmHit(5),
    ],
    chains: [
      [eq('teclas'), comp('piano')],
      [eq('teclas'), comp('piano'), chorus('subtle')],
      [eq('teclas'), chorus('vintage'), phaser('slow')],
      [eq('teclas'), comp('piano'), pulsator('slow')],
    ],
    spaces: KEY_SPACES,
  },
  'Kb/CLAVI': {
    label: 'Clavi',
    sources: [gmHit(7, { release: 0.12, velocity: 1.1 }), dx(6), byVelocity(dx(6), gmHit(7))],
    chains: [[eq('teclas'), transients('pluck')], [eq('teclas'), transients('pluck'), phaser('fast')], [comp('bus'), filter('envelope')]],
    spaces: DRY_SPACES,
  },
  'Kb/OTHER': {
    label: 'Keys',
    sources: [gmHit(6), dx(5)],
    chains: [[eq('presence')]],
    spaces: ROOMS,
  },
  'Cp/MALLET': {
    label: 'Mallet',
    sources: [gmHit(11), gmHit(12), gmHit(13), gmHit(15), gmHit(108)],
    chains: [[eq('low-cut')], [transients('attack')]],
    spaces: ROOMS,
  },
  'Cp/BELL': {
    label: 'Bell',
    sources: [
      dx(4), dx(9), dx(29), jx(2), gmHit(8), gmHit(9), gmHit(10), gmHit(14), gmHit(112),
      stack(dx(4), synth2(14)),
    ],
    chains: [[eq('low-cut')], [ringMod('bell'), chorus('subtle')], [chorus('wide')]],
    spaces: WIDE_SPACES,
  },
  'Cp/PERC.': {
    label: 'Tuned Perc',
    sources: [gmHit(114), dx(14), dx(15), jx(45), jx(44), gmHit(113)],
    chains: [[transients('attack')], [comp('drum')]],
    spaces: ROOMS,
  },
  'Dr/PERC.': {
    label: 'Percussion',
    sources: [kit(0), kit(8), kit(16), kit(24), kit(25), kit(40)],
    chains: [[transients('attack'), comp('drum')]],
    spaces: [space(['room', -18])],
  },
  'Or/ELEC.': {
    label: 'Drawbar Organ',
    sources: [
      organ(0), organ(1), organ(2), organ(3),
      jx(31), jx(32), jx(33), dx(8),
      gm(16), gm(17), gm(18),
    ],
    chains: [[eq('organ')], [eq('organ'), comp('bus')], [eq('organ'), comp('bus'), harmonics('exciter')], [eq('organ'), phaser('slow')]],
    spaces: [space(['room', -20]), space(['room', -16]), space(['chamber', -18])],
  },
  'Or/PIPE': {
    label: 'Pipe Organ',
    sources: [gm(19), gm(20)],
    chains: [[eq('organ')], [stereo('wide')], [comp('bus')]],
    spaces: [space(['hall', -8]), space(['arena', -8]), space(['chamber', -10])],
  },
  'Or/OTHER': {
    label: 'Reed Keys',
    sources: [gm(21), gm(22), gm(23)],
    chains: [[eq('low-cut')], [comp('default')]],
    spaces: ROOMS,
  },
  'Gt/A.GTR': {
    label: 'Acoustic Guitar',
    sources: [gmHit(24, { release: 0.5 }), gmHit(25, { release: 0.5 })],
    chains: [
      [eq('guitarra'), comp('piano')],
      [eq('guitarra'), comp('piano'), transients('pluck')],
      [eq('guitarra'), chorus('subtle')],
    ],
    spaces: [space(['room', -16], ['echo', -20]), space(['plate', -16]), space(['chamber', -14])],
  },
  'Gt/E.GTR': {
    label: 'Electric Guitar',
    sources: range(26, 31, (program) => gmHit(program, { release: 0.45 })),
    chains: [
      [amp('clean'), eq('guitarra'), chorus('subtle')],
      [amp('blues'), eq('guitarra')],
      [amp('crunch'), eq('guitarra')],
      [amp('lead'), eq('guitarra')],
      [overdrive('crunch'), amp('clean'), phaser('slow')],
      [amp('highgain'), eq('guitarra')],
      [eq('guitarra'), comp('bus'), flanger('subtle')],
      [amp('clean'), eq('guitarra'), pulsator('slow')],
      [overdrive('boost'), amp('blues'), chorus('vintage')],
    ],
    spaces: [space(['plate', -16], ['slap', -20]), space(['room', -16]), space(['hall', -16], ['echo', -18])],
  },
  'Gt/PLUCK': {
    label: 'Plucked',
    sources: [gmHit(104), gmHit(105), gmHit(106), gmHit(107), gmHit(46), dx(11), dx(12)],
    chains: [[eq('low-cut'), transients('pluck')], [eq('presence')]],
    spaces: ROOMS,
  },
  'Ba/A.BASS': {
    label: 'Acoustic Bass',
    sources: [gmHit(32), dx(27), dx(28)],
    chains: [[comp('bass')], [eq('baixo'), comp('bass')]],
    spaces: DRY_SPACES,
  },
  'Ba/E.BASS': {
    label: 'Electric Bass',
    sources: range(33, 37, (program) => gmHit(program, { release: 0.25 })).concat([dx(21), dx(22), dx(23)]),
    chains: [
      [eq('baixo'), comp('bass')],
      [eq('baixo'), comp('bass'), harmonics('bass')],
      [comp('bass'), transients('pluck')],
      [eq('baixo'), comp('bass'), chorus('subtle')],
    ],
    spaces: [space(), space(['room', -24])],
  },
  'Ba/SYNTH': {
    label: 'Synth Bass',
    sources: [
      ...[15, 17, 19, 21, 22, 23, 27, 28].map((program) => synth2(program)),
      ...[15, 16, 17, 18, 19, 21, 22, 23, 24].map((program) => jx(program)),
    ],
    chains: [
      [eq('baixo'), comp('bass')],
      [comp('bass'), harmonics('bass')],
      [comp('bass'), filter('envelope')],
      [comp('bass'), crusher('soft')],
    ],
    spaces: [space(), space(['room', -24])],
  },
  'St/ENSEM.': {
    label: 'String Ensemble',
    sources: [
      gm(48), gm(49), son(2), son(6),
      stack(son(2), son(8)),
      stack(gm(48), son(2)),
      split(son(8), son(2), 55),
    ],
    chains: [[eq('presence')], [eq('presence'), comp('bus')], [stereo('wide')]],
    spaces: HALLS,
  },
  'St/SOLO': {
    label: 'Solo Strings',
    sources: [son(12), gm(40), gm(41), gm(42), gm(43), gm(44), gmHit(45)],
    chains: [[comp('piano')], [eq('presence')]],
    spaces: HALLS,
  },
  'St/SYNTH': {
    label: 'Synth Strings',
    sources: [synth2(14), synth2(5), jx(29), jx(30), gm(50), gm(51)],
    chains: [[eq('low-cut'), chorus('ensemble')], [eq('low-cut'), stereo('wide')], [chorus('wide'), phaser('slow')]],
    spaces: WIDE_SPACES,
  },
  'Br/SECTION': {
    label: 'Brass Section',
    sources: [
      gm(61), son(28), son(32), son(30),
      stack(son(28), son(32)),
      stack(gm(61), son(30)),
      split(son(32), son(28), 55),
    ],
    chains: [[eq('presence'), comp('bus')], [comp('bus')], [eq('presence'), comp('bus'), stereo('wide')]],
    spaces: HALLS,
  },
  'Br/SOLO': {
    label: 'Solo Brass',
    sources: [son(27), son(31), son(29), gm(56), gm(57), gm(58), gm(59), gm(60)],
    chains: [[eq('presence'), comp('piano')], [comp('piano')]],
    spaces: ROOMS,
  },
  'Br/SYNTH': {
    label: 'Synth Brass',
    sources: [jx(37), jx(38), jx(39), jx(40), gm(62), gm(63)],
    chains: [[comp('bus'), chorus('wide')], [comp('bus'), filter('envelope')], [harmonics('exciter'), chorus('subtle')]],
    spaces: SYNTH_SPACES,
  },
  'Rp/SAX/RD': {
    label: 'Sax & Reed',
    sources: range(64, 71, (program) => gm(program)),
    chains: [[eq('low-cut'), comp('piano')], [comp('piano')]],
    spaces: ROOMS,
  },
  'Rp/PIPE': {
    label: 'Flute & Pipe',
    sources: range(72, 79, (program) => gm(program)),
    chains: [[eq('low-cut')], [eq('presence')]],
    spaces: ROOMS,
  },
  'Rp/OTHER': {
    label: 'World Wind',
    sources: [gm(109), gm(110), gm(111), gm(68)],
    chains: [[eq('low-cut')], [comp('piano')]],
    spaces: ROOMS,
  },
  'Pd/BRIGHT': {
    label: 'Bright Pad',
    sources: [synth2(2), synth2(5), synth2(6), synth2(7), synth2(39), jx(0), jx(1), jx(40), gm(90), gm(91)],
    chains: [[eq('low-cut'), chorus('wide')], [eq('low-cut'), stereo('wide')], [phaser('slow'), stereo('wide')], [flanger('subtle'), chorus('wide')]],
    spaces: WIDE_SPACES,
  },
  'Pd/SOFT': {
    label: 'Soft Pad',
    sources: [synth2(3), synth2(8), synth2(10), synth2(12), synth2(14), jx(27), gm(88), gm(89), gm(94)],
    chains: [[eq('low-cut')], [filter('smooth'), chorus('ensemble')], [filter('smooth'), stereo('wide')]],
    spaces: WIDE_SPACES,
  },
  'Pd/CHOIR': {
    label: 'Choir',
    sources: [gm(52), gm(53), gm(54), gm(85), synth2(11), stack(gm(52), gm(53))],
    chains: [[eq('low-cut')], [stereo('wide')], [eq('presence'), chorus('subtle')]],
    spaces: HALLS,
  },
  'Ld/HARD': {
    label: 'Hard Lead',
    sources: [jx(6), jx(8), jx(9), jx(14), jx(40), synth2(35), synth2(36), gm(80), gm(81)],
    chains: [[overdrive('boost'), chorus('subtle')], [overdrive('lead'), eq('presence')], [harmonics('exciter'), stereo('wide')]],
    spaces: SYNTH_SPACES,
  },
  'Ld/SOFT': {
    label: 'Soft Lead',
    sources: [jx(7), jx(11), jx(12), jx(26), synth2(37), gm(82), gm(83), gm(84)],
    chains: [[chorus('subtle')], [stereo('wide')], [filter('smooth')]],
    spaces: SYNTH_SPACES,
  },
  'Sc/HARD': {
    label: 'Hard Comp',
    sources: [synth2(33), synth2(34), synth2(35), synth2(36), synth2(38), synth2(39), jx(3), jx(4), jx(5), jx(10)],
    chains: [[comp('bus'), chorus('wide')], [comp('bus'), filter('envelope')], [harmonics('exciter'), stereo('wide')], [comp('bus'), crusher('soft')]],
    spaces: SYNTH_SPACES,
  },
  'Sc/SOFT': {
    label: 'Soft Comp',
    sources: [synth2(29), synth2(30), synth2(31), synth2(37), synth2(40), jx(4), jx(43)],
    chains: [[eq('low-cut'), chorus('subtle')], [filter('smooth')]],
    spaces: SYNTH_SPACES,
  },
  'Se/NATUR.': {
    label: 'Natural FX',
    sources: [gm(122), gm(123), gm(124), gm(125), gm(126), gm(127)],
    chains: [[eq('low-cut')]],
    spaces: WIDE_SPACES,
  },
  'Se/SYNTH': {
    label: 'Synth FX',
    sources: [jx(46), jx(47), jx(49), jx(51), jx(42), gm(96), gm(97), gm(98), gm(99), gm(103)],
    chains: [[flanger('metallic')], [ringMod('metallic')], [crusher('lofi')]],
    spaces: WIDE_SPACES,
  },
  'Me/MOTION': {
    label: 'Motion',
    sources: [
      synth2(41), synth2(42), synth2(43),
      jx(41), jx(42), jx(48), jx(0),
      gm(97), gm(99), gm(100), gm(101), gm(102),
    ],
    chains: [[filter('envelope'), stereo('wide')], [phaser('deep'), stereo('wide')], [flanger('jet'), stereo('wide')], [pulsator('fast'), stereo('wide')], [ringMod('bell'), stereo('wide')]],
    spaces: WIDE_SPACES,
  },
  'Me/HIT': {
    label: 'Hit',
    sources: [gmHit(55), jx(50), dx(31), gmHit(119), gmHit(118)],
    chains: [[transients('attack'), comp('drum')]],
    spaces: [space(['hall', -12])],
  },
  'Co/SEQ': {
    label: 'Sequence',
    sources: [
      jxArp(12, arp('up', '1/16', 2)),
      jxArp(10, arp('down', '1/16', 1)),
      jxArp(6, arp('updown', '1/8', 2)),
      jxArp(15, arp('up', '1/8', 1)),
      jxArp(2, arp('up', '1/16', 3)),
    ],
    chains: [[filter('envelope')], [flanger('subtle')], [comp('bus'), chorus('subtle')], [phaser('fast')]],
    spaces: [space(['plate', -16], ['dotted', -14]), space(['room', -18], ['pingpong', -16])],
  },
  'Co/SPLIT': {
    label: 'Split',
    sources: [split(synth2(15), synth2(8)), split(gmHit(33), piano()), split(jx(17), jx(29))],
    chains: [[comp('bus')]],
    spaces: [space(['plate', -16])],
  },
};

const CATEGORY_SETS: Record<string, string> = {
  Ap: 'Pianos',
  Kb: 'Teclados',
  Or: 'Órgãos',
  Cp: 'Percussão afinada',
  Dr: 'Percussão',
  Gt: 'Guitarras',
  Ba: 'Baixos',
  St: 'Cordas',
  Br: 'Metais',
  Rp: 'Palhetas e sopros',
  Ld: 'Leads',
  Pd: 'Pads',
  Sc: 'Synth Comps',
  Se: 'Efeitos sonoros',
  Me: 'Motion',
  Co: 'Sequências e splits',
};

/** Programas do Synth2 que já têm chorus/delay internos: não somar outro. */
const SYNTH2_CHORUS = new Set([1, 8, 9, 10, 11, 12, 13, 19, 20, 27, 30, 31, 32, 36, 37, 40, 41, 42, 43]);
const SYNTH2_DELAY = new Set([
  3, 4, 5, 6, 7, 9, 11, 12, 13, 16, 18, 20, 22, 23, 24, 25, 26, 29, 30, 31, 32, 36, 37, 38, 40, 41, 42, 43,
]);

const effectName = (spec: EffectSpec): string => (typeof spec === 'string' ? spec : spec.effect);

function adaptToSynth2 (
  layers: CollectionLayerSpec[],
  chain: EffectSpec[],
  room: Space
): { chain: EffectSpec[]; room: Space } {
  const programs = layers
    .filter((layer) => layer.nativeInstrument === 'synth2')
    .map((layer) => layer.programIndex ?? 0);
  const hasChorus = programs.some((program) => SYNTH2_CHORUS.has(program));
  const hasDelay = programs.some((program) => SYNTH2_DELAY.has(program));
  return {
    chain: hasChorus ? chain.filter((spec) => !/chorus/i.test(effectName(spec))) : chain,
    room: hasDelay ? { ...(room.r ? { r: room.r } : {}) } : room,
  };
}

/** Código da posição no painel: 1 = A01, 17 = B01, 128 = H16. */
export function positionCode (position: number): string {
  const index = position - 1;
  return `${'ABCDEFGH'[Math.floor(index / 16)]}${String((index % 16) + 1).padStart(2, '0')}`;
}

function recipeFor (key: string): Recipe {
  const recipe = RECIPES[key];
  if (!recipe) throw new Error(`Subcategoria sem receita: ${key}`);
  return recipe;
}

let cachedBanks: Map<WorkstationBank, CollectionSet[]> | null = null;

function buildBanks (): Map<WorkstationBank, CollectionSet[]> {
  const data = voices as Record<WorkstationBank, string[]>;
  // A variação corre por todos os bancos, para não repetir a mesma receita.
  const variants = new Map<string, number>();
  const result = new Map<WorkstationBank, CollectionSet[]>();

  for (const bank of WORKSTATION_BANKS) {
    const sets = new Map<string, CollectionPatch[]>();
    data[bank].forEach((key, index) => {
      const position = index + 1;
      const recipe = recipeFor(key);
      const variant = variants.get(key) ?? 0;
      variants.set(key, variant + 1);

      // Contagem mista: percorre as fontes, depois as cadeias, depois os ambientes.
      const sourceCount = recipe.sources.length;
      const chainCount = recipe.chains.length;
      const source = recipe.sources[variant % sourceCount];
      const baseChain = recipe.chains[Math.floor(variant / sourceCount) % chainCount];
      const baseRoom = recipe.spaces[Math.floor(variant / (sourceCount * chainCount)) % recipe.spaces.length];

      const number = variant + 1;
      const name = `${positionCode(position)} ${recipe.label} ${number}`;
      const layers = source(recipe.label);
      const { chain, room } = adaptToSynth2(layers, baseChain, baseRoom);
      // Várias camadas: efeitos no Master, para não multiplicar a CPU.
      const fx = layers.length > 1 ? { master: chain } : { inserts: chain };
      const patch: CollectionPatch = [name, layers, {
        ...PATCH_FX({ ...fx, ...room }),
        programNumber: index,
        description: `${bank} ${positionCode(position)} · ${recipe.label}`,
      }];

      const setName = CATEGORY_SETS[key.split('/')[0]] ?? 'Outros';
      const list = sets.get(setName) ?? [];
      list.push(patch);
      sets.set(setName, list);
    });
    result.set(bank, [...sets.entries()]);
  }
  return result;
}

/** Sets de um banco, no formato usado pelo gerador de coleções. */
export function workstationBankSets (bank: WorkstationBank): CollectionSet[] {
  cachedBanks ??= buildBanks();
  const sets = cachedBanks.get(bank);
  if (!sets) throw new Error(`Banco desconhecido: ${bank}`);
  return sets;
}

export function isWorkstationBank (value: unknown): value is WorkstationBank {
  return typeof value === 'string' && (WORKSTATION_BANKS as readonly string[]).includes(value);
}
