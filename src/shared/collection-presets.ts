import type { ArpSettings } from './types';

/** Estrutura dos 40 patches da Factory 40. Só nomes, faixas, volumes e fontes. */

export interface CollectionLayerSpec {
  /** Instrumento sugerido (sigla do catálogo). */
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
  /** Panorama -1..1. */
  pan?: number;
  velocityMin?: number;
  velocityMax?: number;
  /** Arpejador do layer. */
  arp?: ArpSettings;
}

export interface CollectionPatchMeta {
  /** Canal MIDI 0-based (0 = canal 1). */
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
 * 40 patches da Factory 40, inspirados na especificação
 * docs/Preseter_Biblioteca_40_Patches.md. Os instrumentos usam os plugins e
 * bibliotecas que o Preseter realmente instala; quando a fonte original não
 * está disponível, o patch usa a alternativa mais próxima do catálogo.
 */
export const COLLECTION_SETS: CollectionSet[] = [
  ['Pianos & Keys', [
    ['Concert Grand', [L('SFORZANDO', -2, 0, 127, 'Piano', 299)]],
    ['Soft Grand', [L('SFORZANDO', -3, 0, 127, 'Piano suave', 299)]],
    ['Pop Piano', [L('SFORZANDO', -1, 0, 127, 'Piano pop', 299)]],
    ['Upright Piano', [L('SFORZANDO', -2, 0, 127, 'Piano vertical', 299)]],
    ['Rhodes Classic', [L('SFORZANDO', -2, 0, 127, 'Rhodes', 4)]],
    ['Wurlitzer EP', [L('SFORZANDO', -2, 0, 127, 'Wurlitzer', 30)]],
    ['FM Electric Piano', [L('DEXED', -2, 0, 127, 'Piano elétrico FM')]],
    ['Clavinet Funk', [L('SFORZANDO', -2, 0, 127, 'Clavinet', 135)]],
  ]],
  ['Organs', [
    ['Hammond Jazz', [L('ORG', -2, 0, 127, 'Hammond jazz', 123)]],
    ['Hammond Gospel', [L('ORG', -2, 0, 127, 'Hammond gospel', 123)]],
    ['Hammond Rock', [L('ORG', -2, 0, 127, 'Hammond rock', 112)]],
    ['Vintage Transistor Organ', [L('SURGE', -2, 0, 127, 'Órgão combo')]],
  ]],
  ['Strings', [
    ['Solo Violin', [L('SFORZANDO', -2, 0, 127, 'Violino solo', 67)]],
    ['String Ensemble', [
      L('SFORZANDO', -3, 55, 108, 'Violinos', 261, { pan: -0.15 }),
      L('SFORZANDO', -4, 48, 102, 'Violas', 269, { pan: 0 }),
      L('SFORZANDO', -3, 36, 82, 'Cellos', 273, { pan: 0.12 }),
      L('SFORZANDO', -5, 24, 66, 'Contrabaixos', 277, { pan: 0.18 }),
    ]],
    ['Cinematic Strings', [
      L('SFORZANDO', -2, 55, 108, 'Violinos', 262, { pan: -0.12 }),
      L('SFORZANDO', -3, 36, 84, 'Cellos', 274, { pan: 0.12 }),
      L('SURGE', -8, 0, 127, 'Pad de cordas'),
    ]],
    ['Pizzicato Strings', [L('SFORZANDO', -3, 36, 96, 'Cordas em pizzicato', 253)]],
    ['Warm String Pad', [L('SURGE', -3, 0, 127, 'Pad de cordas')]],
  ]],
  ['Brass', [
    ['Solo Trumpet', [L('SFORZANDO', -2, 0, 127, 'Trompete', 170)]],
    ['Trombone', [L('SFORZANDO', -2, 0, 127, 'Trombone', 171)]],
    ['French Horn', [L('SFORZANDO', -2, 0, 127, 'Trompa', 173)]],
    ['Brass Section', [
      L('SFORZANDO', -3, 60, 108, 'Trompetes', 170, { pan: -0.1 }),
      L('SFORZANDO', -3, 43, 91, 'Trombones', 171, { pan: 0.05 }),
      L('SFORZANDO', -4, 36, 84, 'Trompas', 173, { pan: 0.15 }),
    ]],
  ]],
  ['Woodwinds', [
    ['Concert Flute', [L('SFORZANDO', -2, 0, 127, 'Flauta', 62)]],
    ['Clarinet', [L('SFORZANDO', -2, 0, 127, 'Clarinete', 182)]],
    ['Oboe', [L('SFORZANDO', -2, 0, 127, 'Oboé', 150)]],
  ]],
  ['Guitars & Bass', [
    ['Acoustic Guitar Nylon', [L('SFORZANDO', -2, 0, 127, 'Violão de nylon', 110)]],
    ['Acoustic Guitar Steel', [L('SFORZANDO', -2, 0, 127, 'Violão de aço', 109)]],
    ['Electric Guitar Clean', [L('SFORZANDO', -2, 0, 127, 'Guitarra limpa', 86)]],
    ['Precision Bass', [L('SFORZANDO', -2, 0, 127, 'Baixo precision', 108)]],
    ['Synth Bass', [
      L('SURGE', -2, 0, 127, 'Baixo sintetizado'),
      L('FSVR', -6, 0, 127, 'FM bass'),
    ]],
  ]],
  ['Drums & Percussion', [
    ['Acoustic Rock Kit', [L('SFORZANDO', -2, 0, 127, 'Kit acústico', 120)]],
    ['Electronic Drum Kit', [L('SFORZANDO', -2, 0, 127, 'Kit eletrônico', 118)]],
    ['Orchestral Percussion', [L('SFORZANDO', -2, 0, 127, 'Percussão orquestral', 115)]],
  ]],
  ['Synthesizers', [
    ['Analog Poly Synth', [L('SURGE', -2, 0, 127, 'Analógico polifônico')]],
    ['Vintage Analog Lead', [L('ODIN', -2, 0, 127, 'Lead analógico')]],
    ['Modern Synth Lead', [L('SURGE', -2, 0, 127, 'Lead moderno')]],
    ['Warm Analog Pad', [L('SURGE', -3, 0, 127, 'Pad analógico')]],
    ['Digital Bell', [L('DEXED', -2, 0, 127, 'Sino digital')]],
    ['Arpeggiator', [L('SURGE', -2, 0, 127, 'Arpejo', undefined, { arp: arp() })]],
    ['Deep Synth Bass', [L('SURGE', -2, 0, 127, 'Baixo profundo')]],
    ['Ambient Texture', [L('SURGE', -3, 0, 127, 'Textura ambiente')]],
  ]],
];
