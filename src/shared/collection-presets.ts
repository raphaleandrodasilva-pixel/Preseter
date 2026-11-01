/** Estrutura dos 40 patches da coleção (docs/PATCHES.md). Só nomes/faixas/volumes. */

export interface CollectionLayerSpec {
  /** Instrumento sugerido (sigla do catálogo). */
  inst: 'JUICY' | 'SURGE' | 'DEXED' | 'ODIN' | 'HELM' | 'MDA' | 'ORG' | 'SFIZZ';
  db: number;
  min: number;
  max: number;
  label: string;
  programIndex?: number;
}

export type CollectionSet = [string, Array<[string, CollectionLayerSpec[]]>];

export const L = (
  inst: CollectionLayerSpec['inst'],
  db = 0,
  min = 0,
  max = 127,
  label = '',
  programIndex?: number
): CollectionLayerSpec => ({ inst, db, min, max, label, programIndex });

export const COLLECTION_SETS: CollectionSet[] = [
  ['Pianos', [
    ['Piano de Cauda', [L('JUICY', 0, 0, 127, 'Piano', 0)]],
    ['Piano de Cauda Brilhante', [L('JUICY', 0, 0, 127, 'Piano + brilho', 0)]],
    ['Piano Suave', [L('JUICY', 0, 0, 127, 'Piano suave', 0)]],
    ['Piano Vertical', [L('JUICY', 0, 0, 127, 'Piano vertical', 1)]],
    ['Piano + Pad', [L('JUICY', -6, 0, 127, 'Piano', 0), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
  ['Teclas elétricas', [
    ['Elétrico Clássico', [L('MDA', -6, 0, 127, 'ePiano')]],
    ['Elétrico Suave', [L('DEXED', -6, 0, 127, 'E.Piano')]],
    ['Elétrico com Tremolo', [L('MDA', -6, 0, 127, 'ePiano + tremolo')]],
    ['Clavinet', [L('SURGE', -6, 0, 127, 'Clav')]],
    ['Sinos Elétricos', [L('DEXED', -6, 0, 127, 'Bell')]],
  ]],
  ['Órgãos', [
    ['Órgão Tonewheel', [L('ORG', -6, 0, 127, 'Tonewheel', 16)]],
    ['Órgão Rock', [L('ORG', -6, 0, 127, 'Leslie rápido', 16)]],
    ['Órgão de Igreja', [L('JUICY', -6, 0, 127, 'Órgão de tubos', 19)]],
    ['Órgão Suave', [L('SURGE', -6, 0, 127, 'Órgão')]],
  ]],
  ['Cordas e orquestra', [
    ['Cordas Legato', [L('JUICY', -6, 0, 127, 'Cordas sustain', 48)]],
    ['Cordas Staccato', [L('JUICY', -6, 0, 127, 'Cordas staccato', 48)]],
    ['Cordas Sintéticas', [L('SURGE', -6, 0, 127, 'String ensemble')]],
    ['Metais', [L('JUICY', -6, 0, 127, 'Metais', 61)]],
    ['Flauta', [L('JUICY', -6, 0, 127, 'Flauta', 73)]],
    ['Coral', [L('JUICY', -6, 0, 127, 'Coral', 52)]],
  ]],
  ['Pads', [
    ['Pad Quente', [L('SURGE', -6, 0, 127, 'Pad')]],
    ['Pad Ambiente', [L('ODIN', -6, 0, 127, 'Ataque longo')]],
    ['Pad de Cordas', [L('HELM', -6, 0, 127, 'Pad de cordas')]],
    ['Pad Brilhante', [L('SURGE', -6, 0, 127, 'Filtro aberto')]],
    ['Pad Escuro', [L('ODIN', -6, 0, 127, 'Filtro baixo')]],
  ]],
  ['Leads e sintetizadores', [
    ['Lead Serra', [L('SURGE', -6, 0, 127, 'Lead saw')]],
    ['Lead Suave', [L('ODIN', -6, 0, 127, 'Lead')]],
    ['Pluck', [L('SURGE', -6, 0, 127, 'Pluck')]],
    ['Arpejo Brilhante', [L('SURGE', -6, 0, 127, 'Arp')]],
    ['Brass Sintético', [L('MDA', -6, 0, 127, 'JX10')]],
  ]],
  ['Baixos', [
    ['Baixo Sintético', [L('SURGE', -6, 0, 127, 'Sub bass')]],
    ['Baixo Elétrico', [L('JUICY', -6, 0, 127, 'Baixo elétrico', 33)]],
    ['Baixo Acústico', [L('JUICY', -6, 0, 127, 'Contrabaixo', 32)]],
  ]],
  ['Layers e splits', [
    ['Split Baixo + Piano', [L('JUICY', -6, 0, 59, 'Baixo', 33), L('JUICY', -6, 60, 127, 'Piano', 0)]],
    ['Split Baixo + Elétrico', [L('SURGE', -6, 0, 53, 'Sub bass'), L('DEXED', -6, 54, 127, 'E.Piano')]],
    ['Piano + Cordas', [L('JUICY', -6, 0, 127, 'Piano', 0), L('JUICY', -9, 0, 127, 'Cordas legato', 48)]],
    ['Piano + Pad (worship)', [L('JUICY', -6, 0, 127, 'Piano', 0), L('SURGE', -12, 0, 127, 'Pad quente')]],
    ['Elétrico + Pad', [L('DEXED', -6, 0, 127, 'E.Piano'), L('SURGE', -12, 0, 127, 'Pad')]],
    ['Split Cordas / Piano', [L('JUICY', -6, 0, 59, 'Cordas', 48), L('JUICY', -6, 60, 127, 'Piano', 0)]],
    ['Tripla: Piano + Cordas + Pad', [L('JUICY', -6, 0, 127, 'Piano', 0), L('JUICY', -9, 0, 127, 'Cordas', 48), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
];
