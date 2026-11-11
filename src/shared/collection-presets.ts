/** Estrutura dos 40 patches da coleção (docs/PATCHES.md). Só nomes/faixas/volumes. */

export interface CollectionLayerSpec {
  /** Instrumento sugerido (sigla do catálogo). */
  inst: 'SFORZANDO' | 'FSVR' | 'SURGE' | 'DEXED' | 'ODIN' | 'HELM' | 'MDA' | 'MDA_EP' | 'MDA_JX' | 'ORG' | 'SFIZZ';
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
    ['Piano de Cauda', [L('SFORZANDO', 0, 0, 127, 'Piano', 0)]],
    ['Piano de Cauda Brilhante', [L('SFORZANDO', 0, 0, 127, 'Piano + brilho', 0)]],
    ['Piano Suave', [L('SFORZANDO', 0, 0, 127, 'Piano suave', 0)]],
    ['Piano Vertical', [L('SFORZANDO', 0, 0, 127, 'Piano vertical', 1)]],
    ['Piano + Pad', [L('SFORZANDO', -6, 0, 127, 'Piano', 0), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
  ['Teclas elétricas', [
    ['Elétrico Clássico', [L('MDA_EP', -6, 0, 127, 'ePiano', 1)]],
    ['Elétrico Suave', [L('MDA_EP', -6, 0, 127, 'E.Piano mellow', 2)]],
    ['Elétrico com Tremolo', [L('MDA_EP', -6, 0, 127, 'ePiano + tremolo', 4)]],
    ['Clavinet', [L('SURGE', -6, 0, 127, 'Clav')]],
    ['Sinos Elétricos', [L('FSVR', -6, 0, 127, 'Sinos FM')]],
  ]],
  ['Órgãos', [
    ['Órgão Tonewheel', [L('ORG', -6, 0, 127, 'Tonewheel', 16)]],
    ['Órgão Rock', [L('ORG', -6, 0, 127, 'Leslie rápido', 16)]],
    ['Órgão de Igreja', [L('SFORZANDO', -6, 0, 127, 'Órgão de tubos', 19)]],
    ['Órgão Suave', [L('SURGE', -6, 0, 127, 'Órgão')]],
  ]],
  ['Cordas e orquestra', [
    ['Cordas Legato', [L('SFORZANDO', -6, 0, 127, 'Cordas sustain', 48)]],
    ['Cordas Staccato', [L('SFORZANDO', -6, 0, 127, 'Cordas staccato', 48)]],
    ['Cordas Sintéticas', [L('SURGE', -6, 0, 127, 'String ensemble')]],
    ['Metais', [L('SFORZANDO', -6, 0, 127, 'Metais', 61)]],
    ['Flauta', [L('SFORZANDO', -6, 0, 127, 'Flauta', 73)]],
    ['Coral', [L('SFORZANDO', -6, 0, 127, 'Coral', 52)]],
  ]],
  ['Pads', [
    ['Pad Quente', [L('SURGE', -6, 0, 127, 'Pad')]],
    ['Pad Ambiente', [L('ODIN', -6, 0, 127, 'Ataque longo')]],
    ['Pad de Cordas', [L('HELM', -6, 0, 127, 'Pad de cordas', 164)]],
    ['Pad Brilhante', [L('FSVR', -9, 0, 127, 'Pad formant'), L('SURGE', -6, 0, 127, 'Filtro aberto')]],
    ['Pad Escuro', [L('ODIN', -6, 0, 127, 'Filtro baixo')]],
  ]],
  ['Leads e sintetizadores', [
    ['Lead Serra', [L('SURGE', -6, 0, 127, 'Lead saw')]],
    ['Lead Suave', [L('FSVR', -6, 0, 127, 'Lead FM'), L('ODIN', -9, 0, 127, 'Lead')]],
    ['Pluck', [L('SURGE', -6, 0, 127, 'Pluck')]],
    ['Arpejo Brilhante', [L('FSVR', -6, 0, 127, 'Arp FM')]],
    ['Brass Sintético', [L('FSVR', -6, 0, 127, 'Brass formant')]],
  ]],
  ['Baixos', [
    ['Baixo Sintético', [L('FSVR', -6, 0, 127, 'FM bass'), L('SURGE', -9, 0, 127, 'Sub bass')]],
    ['Baixo Elétrico', [L('SFORZANDO', -6, 0, 127, 'Baixo elétrico', 33)]],
    ['Baixo Acústico', [L('SFORZANDO', -6, 0, 127, 'Contrabaixo', 32)]],
  ]],
  ['Layers e splits', [
    ['Split Baixo + Piano', [L('SFORZANDO', -6, 0, 59, 'Baixo', 33), L('SFORZANDO', -6, 60, 127, 'Piano', 0)]],
    ['Split Baixo + Elétrico', [L('SURGE', -6, 0, 53, 'Sub bass'), L('MDA_EP', -6, 54, 127, 'E.Piano', 2)]],
    ['Piano + Cordas', [L('SFORZANDO', -6, 0, 127, 'Piano', 0), L('SFORZANDO', -9, 0, 127, 'Cordas legato', 48)]],
    ['Piano + Pad (worship)', [L('SFORZANDO', -6, 0, 127, 'Piano', 0), L('SURGE', -12, 0, 127, 'Pad quente')]],
    ['Elétrico + Pad', [L('MDA_EP', -6, 0, 127, 'E.Piano', 2), L('SURGE', -12, 0, 127, 'Pad')]],
    ['Split Cordas / Piano', [L('SFORZANDO', -6, 0, 59, 'Cordas', 48), L('SFORZANDO', -6, 60, 127, 'Piano', 0)]],
    ['Tripla: Piano + Cordas + Pad', [L('SFORZANDO', -6, 0, 127, 'Piano', 0), L('SFORZANDO', -9, 0, 127, 'Cordas', 48), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
];
