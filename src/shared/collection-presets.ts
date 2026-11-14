import type { ArpSettings } from './types';

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
    | 'SFORZANDO'
    | 'FSVR'
    | 'SURGE'
    | 'DEXED'
    | 'ODIN'
    | 'HELM'
    | 'MDA'
    | 'MDA_EP'
    | 'MDA_JX'
    | 'ORG'
    | 'SFIZZ';
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
  /** Quando presente, o layer usa o sampler nativo (SF2/SFZ). */
  sample?: SampleSpec;
}

export interface CollectionPatchMeta {
  midiChannel?: number;
  description?: string;
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
): CollectionLayerSpec => ({ inst: 'SFORZANDO', db, min, max, label, sample, ...extra });

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
 * 40 patches da Factory 40, seguindo docs/Preseter_Biblioteca_40_Patches.md e
 * os JSONs em docs/Preseter_Factory_40_JSON. Os instrumentos sampleados usam o
 * sampler nativo; os sintetizadores seguem em plugins.
 */
export const COLLECTION_SETS: CollectionSet[] = [
  ['Pianos & Keys', [
    ['Concert Grand', [
      S(-2, 0, 127, 'Piano de cauda', {
        library: 'salamander', loop: false, velocity: 1, polyphony: 64,
      }),
    ]],
    ['Soft Grand', [
      S(-3, 0, 127, 'Piano macio', {
        library: 'salamander', loop: false, cutoff: 5500, attack: 0.004,
        release: 0.25, velocity: 0.75, polyphony: 64,
      }),
    ]],
    ['Pop Piano', [
      S(-1, 0, 127, 'Piano pop', {
        library: 'salamander', loop: false, cutoff: 14000, attack: 0.001,
        velocity: 1, polyphony: 64,
      }),
    ]],
    ['Upright Piano', [
      S(-2, 0, 127, 'Piano vertical', {
        library: 'sonatina', bank: 0, program: 0, loop: false, release: 0.35,
        velocity: 0.95, polyphony: 48,
      }),
    ]],
    ['Rhodes Classic', [
      S(-2, 0, 127, 'Rhodes', {
        library: 'musescore', bank: 0, program: 4, loop: true, release: 0.6,
        velocity: 1.1, polyphony: 32,
      }),
    ]],
    ['Wurlitzer EP', [
      S(-2, 0, 127, 'Wurlitzer', {
        library: 'musescore', bank: 0, program: 5, loop: true, release: 0.35,
        cutoff: 9000, velocity: 1.1, polyphony: 32,
      }),
    ]],
    ['FM Electric Piano', [
      S(-3, 0, 127, 'Piano elétrico FM', {
        library: 'musescore', bank: 8, program: 5, loop: true, release: 0.8,
        velocity: 1.1, polyphony: 32,
      }),
    ]],
    ['Clavinet Funk', [
      S(-2, 0, 127, 'Clavinet', {
        library: 'musescore', bank: 0, program: 7, loop: false, release: 0.12,
        cutoff: 12000, velocity: 1.1, polyphony: 24,
      }),
    ]],
  ]],
  ['Organs', [
    ['Hammond Jazz', [
      S(-3, 0, 127, 'Hammond jazz', {
        library: 'musescore', bank: 0, program: 16, loop: true, release: 0.08,
        cutoff: 8000, velocity: 0.3, polyphony: 32,
      }),
    ]],
    ['Hammond Gospel', [
      S(-2, 0, 127, 'Hammond gospel', {
        library: 'musescore', bank: 0, program: 16, loop: true, release: 0.08,
        velocity: 0.3, polyphony: 32,
      }),
    ]],
    ['Hammond Rock', [
      S(-2, 0, 127, 'Hammond rock', {
        library: 'musescore', bank: 0, program: 18, loop: true, release: 0.08,
        cutoff: 10000, velocity: 0.3, polyphony: 32,
      }),
    ]],
    ['Vintage Transistor Organ', [
      S(-3, 0, 127, 'Órgão combo', {
        library: 'musescore', bank: 0, program: 17, loop: true, release: 0.12,
        cutoff: 7000, velocity: 0.4, polyphony: 24,
      }),
    ]],
  ]],
  ['Strings', [
    ['Solo Violin', [
      S(-2, 0, 127, 'Violino solo', {
        library: 'sonatina', bank: 0, program: 12, loop: true, release: 0.45,
        velocity: 0.9, polyphony: 16,
      }),
    ]],
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
    ]],
    ['Cinematic Strings', [
      S(-2, 55, 108, 'Violinos', {
        library: 'sonatina', bank: 0, program: 2, loop: true, attack: 0.35,
        release: 1.6, polyphony: 24,
      }, { pan: -0.12 }),
      S(-3, 36, 84, 'Cellos', {
        library: 'sonatina', bank: 0, program: 8, loop: true, attack: 0.4,
        release: 1.8, polyphony: 16,
      }, { pan: 0.12 }),
    ]],
    ['Pizzicato Strings', [
      S(-3, 36, 96, 'Cordas em pizzicato', {
        library: 'sonatina', bank: 0, program: 3, loop: false, release: 0.18,
        velocity: 1.1, polyphony: 24,
      }),
    ]],
    ['Warm String Pad', [
      L('SURGE', -3, 0, 127, 'Pad de cordas', undefined, {
        factoryPreset: 'Pads/Subtle Comb Strings.fxp',
      }),
    ]],
  ]],
  ['Brass', [
    ['Solo Trumpet', [
      S(-2, 0, 127, 'Trompete', {
        library: 'sonatina', bank: 0, program: 27, loop: true, release: 0.35,
        velocity: 0.95, polyphony: 16,
      }),
    ]],
    ['Trombone', [
      S(-2, 0, 127, 'Trombone', {
        library: 'sonatina', bank: 0, program: 31, loop: true, release: 0.4,
        velocity: 0.95, polyphony: 16,
      }),
    ]],
    ['French Horn', [
      S(-2, 0, 127, 'Trompa', {
        library: 'sonatina', bank: 0, program: 29, loop: true, release: 0.45,
        velocity: 0.9, polyphony: 16,
      }),
    ]],
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
    ]],
  ]],
  ['Woodwinds', [
    ['Concert Flute', [
      S(-2, 0, 127, 'Flauta', {
        library: 'sonatina', bank: 0, program: 14, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ]],
    ['Clarinet', [
      S(-2, 0, 127, 'Clarinete', {
        library: 'sonatina', bank: 0, program: 20, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ]],
    ['Oboe', [
      S(-2, 0, 127, 'Oboé', {
        library: 'sonatina', bank: 0, program: 16, loop: true, release: 0.35,
        velocity: 0.9, polyphony: 12,
      }),
    ]],
  ]],
  ['Guitars & Bass', [
    ['Acoustic Guitar Nylon', [
      S(-3, 0, 127, 'Violão de nylon', {
        library: 'musescore', bank: 0, program: 24, loop: false, release: 0.5,
        velocity: 1, polyphony: 24,
      }),
    ]],
    ['Acoustic Guitar Steel', [
      S(-3, 0, 127, 'Violão de aço', {
        library: 'musescore', bank: 0, program: 25, loop: false, release: 0.5,
        velocity: 1, polyphony: 24,
      }),
    ]],
    ['Electric Guitar Clean', [
      S(-3, 0, 127, 'Guitarra limpa', {
        library: 'musescore', bank: 0, program: 27, loop: false, release: 0.45,
        velocity: 1, polyphony: 24,
      }),
    ]],
    ['Precision Bass', [
      S(-3, 0, 127, 'Baixo precision', {
        library: 'musescore', bank: 0, program: 34, loop: false, release: 0.25,
        velocity: 1, polyphony: 12,
      }),
    ]],
    ['Synth Bass', [
      L('SURGE', -2, 0, 127, 'Baixo sintetizado', undefined, {
        factoryPreset: 'Basses/Sub 1.fxp',
      }),
    ]],
  ]],
  ['Drums & Percussion', [
    ['Acoustic Rock Kit', [
      S(-2, 0, 127, 'Kit acústico', {
        library: 'musescore', bank: 128, program: 0, loop: false, release: 0.05,
        velocity: 1, polyphony: 32,
      }),
    ]],
    ['Electronic Drum Kit', [
      S(-2, 0, 127, 'Kit eletrônico', {
        library: 'musescore', bank: 128, program: 24, loop: false, release: 0.05,
        velocity: 1, polyphony: 32,
      }),
    ]],
    ['Orchestral Percussion', [
      S(-2, 0, 127, 'Percussão orquestral', {
        library: 'sonatina', bank: 0, program: 36, loop: false, release: 0.2,
        velocity: 1, polyphony: 32,
      }),
    ]],
  ]],
  ['Synthesizers', [
    ['Analog Poly Synth', [L('SURGE', -2, 0, 127, 'Analógico polifônico', undefined, { factoryPreset: 'Polysynths/Jupiter-8.fxp' })]],
    ['Vintage Analog Lead', [L('SURGE', -2, 0, 127, 'Lead analógico', undefined, { factoryPreset: 'Leads/Moogy Saw.fxp' })]],
    ['Modern Synth Lead', [L('SURGE', -2, 0, 127, 'Lead moderno', undefined, { factoryPreset: 'Leads/Classic Lead 1.fxp' })]],
    ['Warm Analog Pad', [L('SURGE', -3, 0, 127, 'Pad analógico', undefined, { factoryPreset: 'Pads/MKS-70 Warm Pad.fxp' })]],
    ['Digital Bell', [
      S(-3, 0, 127, 'Sino digital', {
        library: 'musescore', bank: 0, program: 14, loop: false, release: 1.5,
        velocity: 1, polyphony: 16,
      }),
    ]],
    ['Arpeggiator', [L('SURGE', -2, 0, 127, 'Arpejo', undefined, { arp: arp(), factoryPreset: 'Plucks/FM Pluck.fxp' })]],
    ['Deep Synth Bass', [L('SURGE', -2, 0, 127, 'Baixo profundo', undefined, { factoryPreset: 'Basses/Deep End.fxp' })]],
    ['Ambient Texture', [L('SURGE', -3, 0, 127, 'Textura ambiente', undefined, { factoryPreset: 'Pads/Computers In Space.fxp' })]],
  ]],
];
