import type { ArpSettings } from './types';
import { MAX_AUX_BUSES, SEND_OFF_DB } from './types';

/** Estrutura dos 40 patches da Factory 40. */

/** Bibliotecas que o sampler nativo lê. */
export type SampleLibrary = 'musescore' | 'sonatina' | 'salamander';

export interface SampleSpec {
  library: SampleLibrary;
  /** Banco do preset SF2 (128 = kit de bateria). */
  bank?: number;
  /** Programa do preset SF2. */
  program?: number;
  /** Mantém o loop do sample (sustains). Desligado para pianos e percussão. */
  loop?: boolean;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  cutoff?: number;
  resonance?: number;
  velocity?: number;
  transpose?: number;
  fineTune?: number;
  gain?: number;
  /** Vozes simultâneas (8..256). */
  polyphony?: number;
}

export interface CollectionLayerSpec {
  /** Instrumento sugerido (sigla do catálogo de plugins). */
  inst:
    | 'NATIVE'
    | 'FSVR'
    | 'SURGE'
    | 'DEXED'
    | 'ODIN'
    | 'HELM'
    | 'MDA'
    | 'MDA_EP'
    | 'MDA_JX';
  db: number;
  min: number;
  max: number;
  label: string;
  programIndex?: number;
  /** Banco MIDI (128 = kit de bateria GM). */
  bank?: number;
  /** Panorama -1..1. */
  pan?: number;
  velocityMin?: number;
  velocityMax?: number;
  /** Arpejador do layer. */
  arp?: ArpSettings;
  /** Preset de fábrica do Surge XT (caminho relativo em patches_factory). */
  factoryPreset?: string;
  /**
   * Quando presente, o layer usa um instrumento nativo do Preseter.
   * O id é montado como `preseter.<nativeInstrument>`.
   *
   * `piano` existe no motor, mas **não** substitui o sampler nos pianos
   * acústicos: só pode entrar como camada extra, com aprovação.
   */
  nativeInstrument?: 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx';
  /** Quando presente, o layer usa o sampler nativo (SF2/SFZ). */
  sample?: SampleSpec;
}

export interface CollectionPatchMeta {
  midiChannel?: number;
  description?: string;
  /**
   * Inserts do strip de cada layer do patch. Aceita o nome do scan
   * (`calfNXT Reverb`), o nome Preseter (`Preseter Reverb`) ou a key curta
   * (`reverb`); a identidade é resolvida por `effectKey`.
   */
  inserts?: string[];
  /** Inserts do Master do Patch (processam todos os layers). */
  master?: string[];
  /** Sends do bus do patch para os Aux 1..4, em dB (`SEND_OFF_DB` = desligado). */
  sends?: number[];
}

/** Marca um efeito nativo por nome/key (legível na tabela dos 40 patches). */
export const FX = (name: string): string => name;

/** Monta os sends do patch (Aux 1..4), preenchendo o que não foi citado com OFF. */
export function auxSends (values: Partial<Record<1 | 2 | 3 | 4, number>>): number[] {
  return Array.from(
    { length: MAX_AUX_BUSES },
    (_, index) => values[(index + 1) as 1 | 2 | 3 | 4] ?? SEND_OFF_DB
  );
}

export type CollectionPatch = [string, CollectionLayerSpec[], CollectionPatchMeta?];
export type CollectionSet = [string, CollectionPatch[]];

export const L = (
  inst: CollectionLayerSpec['inst'],
  db = 0,
  min = 0,
  max = 127,
  label = '',
  programIndex?: number,
  extra: Partial<CollectionLayerSpec> = {}
): CollectionLayerSpec => ({ inst, db, min, max, label, programIndex, ...extra });

/** Layer do sampler nativo: biblioteca + preset + ajustes de som. */
export const S = (
  db: number,
  min: number,
  max: number,
  label: string,
  sample: SampleSpec,
  extra: Partial<CollectionLayerSpec> = {}
): CollectionLayerSpec => ({ inst: 'NATIVE', db, min, max, label, sample, ...extra });

/** Layer de instrumento nativo (órgão, tines, reeds, piano, DX10 ou JX10). */
export const N = (
  nativeInstrument: NonNullable<CollectionLayerSpec['nativeInstrument']>,
  db: number,
  min: number,
  max: number,
  label: string,
  programIndex = 0,
  extra: Partial<CollectionLayerSpec> = {}
): CollectionLayerSpec => ({
  inst: 'NATIVE',
  db,
  min,
  max,
  label,
  programIndex,
  nativeInstrument,
  ...extra,
});

/** Arquivos das bibliotecas, relativos à pasta de sons. */
export const SAMPLE_LIBRARY_FILES: Record<SampleLibrary, { path: string; name: string }> = {
  musescore: { path: 'MuseScore_General/MuseScore_General.sf2', name: 'MuseScore_General' },
  sonatina: { path: 'Sonatina/Sonatina_Symphonic_Orchestra.sf2', name: 'Sonatina Symphonic Orchestra' },
  salamander: {
    path: 'Salamander/SalamanderGrandPiano-master/Salamander Grand Piano V3.sfz',
    name: 'Salamander Grand Piano V3',
  },
};

const arp = (mode: ArpSettings['mode'] = 'up'): ArpSettings => ({
  enabled: true,
  mode,
  rate: '1/16',
  octaves: 2,
  gate: 50,
  swing: 0,
  hold: false,
});

/**
 * 40 patches da Factory 40, seguindo docs/FACTORY-40-NATIVOS.md.
 * Instrumentos: sampler nativo para acústicos, Preseter Organ/Tines/Wurly,
 * DX10, JX10. Efeitos: só calfNXT, resolvidos por nome em `effectKey`.
 * Pianos acústicos usam SEMPRE o sampler (nunca `preseter.piano`).
 */
export const COLLECTION_SETS: CollectionSet[] = [
  ['Pianos & Keys', [
    ['Concert Grand', [
      S(-2, 0, 127, 'Piano de cauda', {
        library: 'salamander', loop: false, velocity: 1, polyphony: 64,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['Soft Grand', [
      S(-3, 0, 127, 'Piano macio', {
        library: 'salamander', loop: false, cutoff: 5500, attack: 0.004,
        release: 0.25, velocity: 0.75, polyphony: 64,
      }),
    ], {
      inserts: [FX('calfNXT Equalizer')],
      sends: auxSends({ 1: -12 }),
    }],
    ['Pop Piano', [
      S(-1, 0, 127, 'Piano pop', {
        library: 'salamander', loop: false, cutoff: 14000, attack: 0.001,
        velocity: 1, polyphony: 64,
      }),
    ], {
      inserts: [FX('calfNXT Compressor')],
      sends: auxSends({ 1: -16 }),
    }],
    ['Upright Piano', [
      S(-2, 0, 127, 'Piano vertical', {
        library: 'sonatina', bank: 0, program: 0, loop: false, release: 0.35,
        velocity: 0.95, polyphony: 48,
      }),
    ], { sends: auxSends({ 1: -16 }) }],
    ['Rhodes Classic', [
      N('tines', -3, 0, 127, 'Rhodes', 0),
    ], {
      inserts: [FX('calfNXT Chorus'), FX('calfNXT Phaser')],
      sends: auxSends({ 1: -16, 2: -22 }),
    }],
    ['Wurlitzer EP', [
      N('reeds', -3, 0, 127, 'Wurly', 0),
    ], {
      inserts: [FX('calfNXT Pulsator')],
      sends: auxSends({ 1: -16, 2: -22 }),
    }],
    ['FM Electric Piano', [
      N('dx', -3, 0, 127, 'Piano elétrico FM', 0),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -16, 2: -22 }),
    }],
    ['Clavinet Funk', [
      S(-2, 0, 127, 'Clavinet', {
        library: 'musescore', bank: 0, program: 7, loop: false, release: 0.12,
        cutoff: 12000, velocity: 1.1, polyphony: 24,
      }),
    ], { inserts: [FX('calfNXT Phaser')] }],
  ]],
  ['Organs', [
    ['Hammond Jazz', [
      N('organ', -3, 0, 127, 'Hammond jazz', 0),
    ], { sends: auxSends({ 1: -20 }) }],
    ['Hammond Gospel', [
      N('organ', -2, 0, 127, 'Hammond gospel', 1),
    ], { sends: auxSends({ 1: -18 }) }],
    ['Hammond Rock', [
      N('organ', -2, 0, 127, 'Hammond rock', 2),
    ], {
      inserts: [FX('calfNXT Compressor')],
      sends: auxSends({ 1: -22 }),
    }],
    ['Vintage Transistor Organ', [
      N('organ', -3, 0, 127, 'Órgão combo', 3),
    ], {
      inserts: [FX('calfNXT Phaser')],
      sends: auxSends({ 1: -20 }),
    }],
  ]],
  ['Strings', [
    ['Solo Violin', [
      S(-2, 0, 127, 'Violino solo', {
        library: 'sonatina', bank: 0, program: 12, loop: true, release: 0.45,
        velocity: 0.9, polyphony: 16,
      }),
    ], { sends: auxSends({ 1: -10 }) }],
    ['String Ensemble', [
      S(-3, 55, 108, 'Violinos', {
        library: 'sonatina', bank: 0, program: 2, loop: true, release: 0.5, polyphony: 24,
      }, { pan: -0.15 }),
      S(-4, 48, 102, 'Violas', {
        library: 'sonatina', bank: 0, program: 6, loop: true, release: 0.5, polyphony: 16,
      }, { pan: 0 }),
      S(-3, 36, 82, 'Cellos', {
        library: 'sonatina', bank: 0, program: 8, loop: true, release: 0.5, polyphony: 16,
      }, { pan: 0.12 }),
      S(-5, 24, 66, 'Contrabaixos', {
        library: 'sonatina', bank: 0, program: 10, loop: true, release: 0.5, polyphony: 8,
      }, { pan: 0.18 }),
    ], { sends: auxSends({ 1: -10 }) }],
    ['Cinematic Strings', [
      S(-2, 55, 108, 'Violinos', {
        library: 'sonatina', bank: 0, program: 2, loop: true, attack: 0.35,
        release: 1.6, polyphony: 24,
      }, { pan: -0.12 }),
      S(-3, 36, 84, 'Cellos', {
        library: 'sonatina', bank: 0, program: 8, loop: true, attack: 0.4,
        release: 1.8, polyphony: 16,
      }, { pan: 0.12 }),
    ], {
      inserts: [FX('calfNXT Equalizer')],
      sends: auxSends({ 1: -8 }),
    }],
    ['Pizzicato Strings', [
      S(-3, 36, 96, 'Cordas em pizzicato', {
        library: 'sonatina', bank: 0, program: 3, loop: false, release: 0.18,
        velocity: 1.1, polyphony: 24,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['Warm String Pad', [
      N('jx', -3, 0, 127, 'Pad de cordas', 29),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -10 }),
    }],
  ]],
  ['Brass', [
    ['Solo Trumpet', [
      S(-2, 0, 127, 'Trompete', {
        library: 'sonatina', bank: 0, program: 27, loop: true, release: 0.35,
        velocity: 0.95, polyphony: 16,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['Trombone', [
      S(-2, 0, 127, 'Trombone', {
        library: 'sonatina', bank: 0, program: 31, loop: true, release: 0.4,
        velocity: 0.95, polyphony: 16,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['French Horn', [
      S(-2, 0, 127, 'Trompa', {
        library: 'sonatina', bank: 0, program: 29, loop: true, release: 0.45,
        velocity: 0.9, polyphony: 16,
      }),
    ], { sends: auxSends({ 1: -12 }) }],
    ['Brass Section', [
      S(-3, 60, 108, 'Trompetes', {
        library: 'sonatina', bank: 0, program: 28, loop: true, release: 0.4, polyphony: 16,
      }, { pan: -0.1 }),
      S(-3, 43, 91, 'Trombones', {
        library: 'sonatina', bank: 0, program: 32, loop: true, release: 0.4, polyphony: 12,
      }, { pan: 0.05 }),
      S(-4, 36, 84, 'Trompas', {
        library: 'sonatina', bank: 0, program: 30, loop: true, release: 0.5, polyphony: 12,
      }, { pan: 0.15 }),
    ], {
      master: [FX('calfNXT Compressor')],
      sends: auxSends({ 1: -14 }),
    }],
  ]],
  ['Woodwinds', [
    ['Concert Flute', [
      S(-2, 0, 127, 'Flauta', {
        library: 'sonatina', bank: 0, program: 14, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['Clarinet', [
      S(-2, 0, 127, 'Clarinete', {
        library: 'sonatina', bank: 0, program: 20, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
    ['Oboe', [
      S(-2, 0, 127, 'Oboé', {
        library: 'sonatina', bank: 0, program: 16, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ], { sends: auxSends({ 1: -14 }) }],
  ]],
  ['Guitars & Bass', [
    ['Acoustic Guitar Nylon', [
      S(-3, 0, 127, 'Violão de nylon', {
        library: 'musescore', bank: 0, program: 24, loop: false, release: 0.5,
        velocity: 1, polyphony: 24,
      }),
    ], { sends: auxSends({ 1: -16, 2: -20 }) }],
    ['Acoustic Guitar Steel', [
      S(-3, 0, 127, 'Violão de aço', {
        library: 'musescore', bank: 0, program: 25, loop: false, release: 0.5,
        velocity: 1, polyphony: 24,
      }),
    ], {
      inserts: [FX('calfNXT Compressor')],
      sends: auxSends({ 1: -16, 2: -20 }),
    }],
    ['Electric Guitar Clean', [
      S(-3, 0, 127, 'Guitarra limpa', {
        library: 'musescore', bank: 0, program: 27, loop: false, release: 0.45,
        velocity: 1, polyphony: 24,
      }),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -16, 2: -20 }),
    }],
    ['Precision Bass', [
      S(-3, 0, 127, 'Baixo precision', {
        library: 'musescore', bank: 0, program: 34, loop: false, release: 0.25,
        velocity: 1, polyphony: 12,
      }),
    ], {
      inserts: [FX('calfNXT Compressor'), FX('calfNXT Equalizer')],
    }],
    ['Synth Bass', [
      N('jx', -2, 0, 127, 'Baixo sintetizado', 17),
    ], {
      inserts: [FX('calfNXT Filter')],
    }],
  ]],
  ['Drums & Percussion', [
    ['Acoustic Rock Kit', [
      S(-2, 0, 127, 'Kit acústico', {
        library: 'musescore', bank: 128, program: 0, loop: false, release: 0.05,
        velocity: 1, polyphony: 32,
      }),
    ], {
      master: [FX('calfNXT Compressor')],
      sends: auxSends({ 1: -18 }),
    }],
    ['Electronic Drum Kit', [
      S(-2, 0, 127, 'Kit eletrônico', {
        library: 'musescore', bank: 128, program: 24, loop: false, release: 0.05,
        velocity: 1, polyphony: 32,
      }),
    ], { sends: auxSends({ 1: -18 }) }],
    ['Orchestral Percussion', [
      S(-2, 0, 127, 'Percussão orquestral', {
        library: 'sonatina', bank: 0, program: 36, loop: false, release: 0.2,
        velocity: 1, polyphony: 32,
      }),
    ], { sends: auxSends({ 1: -12 }) }],
  ]],
  ['Synthesizers', [
    ['Analog Poly Synth', [
      N('jx', -2, 0, 127, 'Analógico polifônico', 3),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -14, 2: -20 }),
    }],
    ['Vintage Analog Lead', [
      N('jx', -2, 0, 127, 'Lead analógico', 8),
    ], { sends: auxSends({ 1: -16, 2: -14 }) }],
    ['Modern Synth Lead', [
      N('jx', -2, 0, 127, 'Lead moderno', 9),
    ], { sends: auxSends({ 1: -16, 2: -14 }) }],
    ['Warm Analog Pad', [
      N('jx', -3, 0, 127, 'Pad analógico', 27),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -10 }),
    }],
    ['Digital Bell', [
      N('dx', -3, 0, 127, 'Sino digital', 4),
    ], { sends: auxSends({ 1: -12, 2: -20 }) }],
    ['Arpeggiator', [
      N('jx', -2, 0, 127, 'Arpejo', 12, { arp: arp() }),
    ], { sends: auxSends({ 1: -16, 2: -14 }) }],
    ['Deep Synth Bass', [
      N('jx', -2, 0, 127, 'Baixo profundo', 20),
    ], { inserts: [FX('calfNXT Equalizer')] }],
    ['Ambient Texture', [
      N('jx', -3, 0, 127, 'Textura ambiente', 48),
    ], {
      inserts: [FX('calfNXT Chorus')],
      sends: auxSends({ 1: -8, 2: -12 }),
    }],
  ]],
];
