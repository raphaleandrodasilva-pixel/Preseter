/**
 * Padrões de fábrica do Preseter Drums (D8).
 *
 * Dados originais do projeto, escritos para o Preseter. Cada trilha usa um pad
 * (0..15 → notas 36..51) e traz uma velocity por passo (0 = desligado). Nada é
 * copiado de bancos de bateria de terceiros.
 */

import type { EngineDrumPattern } from './types';

export type DrumFactoryStepsPerBar = 8 | 12 | 16 | 32;

export interface DrumFactoryTrack {
  /** 0 = bumbo (36), 2 = caixa (38), 6 = chimbal fechado (42), etc. */
  pad: number;
  /** Uma velocity (0..127) por passo; 0 desliga. */
  steps: number[];
}

export interface DrumFactoryPattern {
  id: string;
  name: string;
  description: string;
  stepsPerBar: DrumFactoryStepsPerBar;
  bars: 1 | 2 | 4;
  swing: number;
  tracks: DrumFactoryTrack[];
}

/** Array de passos com as batidas indicadas (ignora índices fora do compasso). */
const hits = (total: number, entries: Array<[number, number]>): number[] => {
  const steps = Array.from({ length: total }, () => 0);
  for (const [index, velocity] of entries) {
    if (index >= 0 && index < total) steps[index] = velocity;
  }
  return steps;
};

/** Batidas regulares (ex.: colcheias) com acento a cada `every` passos. */
const regular = (total: number, soft: number, every: number, accent = 100): number[] =>
  Array.from(
    { length: total },
    (_, index) => (index % Math.max(1, every) === 0 ? accent : soft)
  );

/** Batidas a cada 2 passos (colcheias), com acento a cada `accentEvery` passos. */
const everyOther = (total: number, soft: number, accentEvery: number, accent = 100): number[] =>
  Array.from({ length: total }, (_, index) => {
    if (index % 2 !== 0) return 0;
    return index % Math.max(1, accentEvery) === 0 ? accent : soft;
  });

export const FACTORY_DRUM_PATTERNS: DrumFactoryPattern[] = [
  {
    id: 'rock-4-4',
    name: 'Rock 4/4',
    description: 'Bumbo nos tempos 1 e 3, caixa nos 2 e 4, chimbal em colcheias.',
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 120], [8, 120], [10, 88]]) },
      { pad: 2, steps: hits(16, [[4, 110], [12, 110]]) },
      { pad: 6, steps: everyOther(16, 62, 4, 100) },
      { pad: 13, steps: hits(16, [[0, 100]]) },
    ],
  },
  {
    id: 'pop',
    name: 'Pop',
    description: 'Bumbo 1/3 com pulso no contratempo, caixa 2/4 e chimbal aberto no fim.',
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 115], [6, 96], [8, 115]]) },
      { pad: 2, steps: hits(16, [[4, 108], [12, 108]]) },
      { pad: 6, steps: everyOther(16, 55, 4, 92) },
      { pad: 10, steps: hits(16, [[14, 78]]) },
    ],
  },
  {
    id: 'funk',
    name: 'Funk',
    description: 'Bumbo sincopado, caixa com fantasmas e chimbal com swing leve.',
    stepsPerBar: 16,
    bars: 1,
    swing: 20,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 120], [3, 88], [6, 110], [10, 96], [11, 76]]) },
      { pad: 2, steps: hits(16, [[4, 112], [12, 112], [7, 40], [15, 44]]) },
      { pad: 6, steps: regular(16, 58, 4, 98) },
      { pad: 10, steps: hits(16, [[14, 74]]) },
    ],
  },
  {
    id: 'shuffle',
    name: 'Shuffle',
    description: 'Ternário com swing forte: bumbo 1/3, caixa 2/4 e chimbal no balanço.',
    stepsPerBar: 12,
    bars: 1,
    swing: 62,
    tracks: [
      { pad: 0, steps: hits(12, [[0, 112], [6, 108]]) },
      { pad: 2, steps: hits(12, [[3, 102], [9, 102]]) },
      { pad: 6, steps: regular(12, 52, 3, 82) },
    ],
  },
  {
    id: 'balada',
    name: 'Balada',
    description: 'Bumbo 1/3, caixa suave 2/4 e condução no prato.',
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 96], [8, 96]]) },
      { pad: 2, steps: hits(16, [[4, 82], [12, 82]]) },
      { pad: 15, steps: regular(16, 0, 4, 62) },
      { pad: 6, steps: hits(16, [[2, 38], [6, 38], [10, 38], [14, 38]]) },
    ],
  },
  {
    id: 'bossa',
    name: 'Bossa',
    description: 'Bumbo 1/contratempos, aro da caixa e chimbal suave com swing curto.',
    stepsPerBar: 16,
    bars: 1,
    swing: 15,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 102], [6, 92], [10, 88]]) },
      { pad: 1, steps: hits(16, [[4, 94], [12, 94], [7, 48], [15, 48]]) },
      { pad: 6, steps: everyOther(16, 44, 4, 58) },
    ],
  },
  {
    id: 'samba',
    name: 'Samba',
    description: 'Bumbo em quatro, caixa com acentos deslocados e chimbal com swing.',
    stepsPerBar: 16,
    bars: 1,
    swing: 25,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 106], [4, 88], [8, 106], [12, 88]]) },
      { pad: 2, steps: hits(16, [[2, 68], [6, 82], [10, 68], [14, 82], [3, 48], [11, 48]]) },
      { pad: 6, steps: regular(16, 48, 4, 72) },
      { pad: 10, steps: hits(16, [[15, 66]]) },
    ],
  },
  {
    id: 'electro',
    name: 'Eletrônico',
    description: 'Bumbo em quatro, palmas nos tempos 2 e 4 e chimbal no contratempo.',
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    tracks: [
      { pad: 0, steps: hits(16, [[0, 118], [4, 118], [8, 118], [12, 118]]) },
      { pad: 3, steps: hits(16, [[4, 108], [12, 108]]) },
      { pad: 6, steps: hits(16, [[2, 70], [6, 88], [10, 70], [14, 88]]) },
      { pad: 10, steps: hits(16, [[7, 60], [15, 60]]) },
    ],
  },
];

/** Converte um padrão de fábrica no payload do comando `setDrums` do motor. */
export function toEngineDrumPattern(pattern: DrumFactoryPattern): EngineDrumPattern {
  return {
    stepsPerBar: pattern.stepsPerBar,
    bars: pattern.bars,
    swing: pattern.swing,
    tracks: pattern.tracks.map((track) => ({
      pad: track.pad,
      steps: track.steps.map((velocity) => ({
        on: velocity > 0,
        velocity: velocity > 0 ? velocity : 100,
      })),
    })),
  };
}

export function findFactoryDrumPattern(id: string): DrumFactoryPattern | undefined {
  return FACTORY_DRUM_PATTERNS.find((pattern) => pattern.id === id);
}
