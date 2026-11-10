/**
 * Templates de concert (Fase 2.3). O usuário escolhe um ao criar um concert
 * novo; cada template monta sets e patches prontos para receber instrumentos.
 */

import { ConcertTemplateSummary, Preset, PresetSet, PreseterConcertFile, UiElement } from '../../shared/types';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultConcertSettings, createEmptyLayout } from './ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { createDefaultKeyboardLayout, ensureDefaultPedals } from '../../shared/default-layout';
import { suggestPatchIcon } from '../../shared/patch-icons';

interface PatchLayerSpec {
  /** Instrumento sugerido (nome livre; não é carregado pelo template). */
  instrument: string;
  /** Volume do layer em dB (padrão 0). */
  db?: number;
  /** Faixa de teclas do layer (padrão 0–127). */
  minNote?: number;
  maxNote?: number;
  label: string;
  /** Programa interno sugerido, quando o instrumento expõe programas (ex.: GM/SF2). */
  programIndex?: number;
}

interface PatchSpec {
  name: string;
  /** Nome do set onde o patch entra (precisa estar em `sets`). */
  setName?: string;
  notes?: string;
  /** Cria o rig de teclado padrão (teclado + volume + modulação). */
  withKeyboard?: boolean;
  /** Estrutura sugerida de layers/splits (não carrega plugins: só documenta o patch). */
  layers?: PatchLayerSpec[];
}

/** Camada sugerida de um patch; só estrutura (instrumento, volume e faixa de teclas). */
function layer(
  instrument: string,
  label: string,
  opts: { db?: number; minNote?: number; maxNote?: number; programIndex?: number } = {}
): PatchLayerSpec {
  return { instrument, label, ...opts };
}

interface TemplateSpec extends ConcertTemplateSummary {
  concertName: string;
  tempo: number;
  sets: string[];
  patches: PatchSpec[];
}

let elementCounter = 0;

function nextId(prefix: string): string {
  elementCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${elementCounter}`;
}

/** Rig padrão de um patch de teclado; usa o mesmo layout de todo o app. */
function keyboardRig(notes: string, tempo: number): UiElement[] {
  return createDefaultKeyboardLayout(tempo, { title: notes }).elements;
}

/** Monta as notas do patch a partir das camadas sugeridas (instrumento, faixa e volume). */
function layerNotes(layers: PatchLayerSpec[]): string {
  return layers
    .map((item) => {
      const min = item.minNote ?? 0;
      const max = item.maxNote ?? 127;
      const range = min > 0 || max < 127 ? ` (${min}–${max})` : '';
      const volume = item.db && item.db !== 0 ? ` ${item.db} dB` : '';
      return `${item.label}${range}${volume}`.trim();
    })
    .join(' + ');
}

export const CONCERT_TEMPLATES: TemplateSpec[] = [
  {
    id: 'vazio',
    name: 'Vazio',
    description: 'Começa do zero: sem sets e sem patches.',
    concertName: 'Meu Concert',
    tempo: DEFAULT_TEMPO,
    sets: [],
    patches: [],
  },
  {
    id: 'teclado',
    name: 'Teclado',
    description: 'Set "Teclado" com Piano, Piano Elétrico e Pads, cada um com teclado na tela.',
    concertName: 'Meu Concert de Teclado',
    tempo: DEFAULT_TEMPO,
    sets: ['Teclado'],
    patches: [
      { name: 'Piano', setName: 'Teclado', withKeyboard: true, notes: 'Piano acústico' },
      { name: 'Piano Elétrico', setName: 'Teclado', withKeyboard: true, notes: 'Rhodes / Wurli' },
      { name: 'Pads', setName: 'Teclado', withKeyboard: true, notes: 'Camadas de pad' },
    ],
  },
  {
    id: 'worship',
    name: 'Worship',
    description: 'Set "Worship" em 72 BPM com pads, piano e ambiente.',
    concertName: 'Meu Concert Worship',
    tempo: 72,
    sets: ['Worship'],
    patches: [
      { name: 'Pad Suave', setName: 'Worship', withKeyboard: true, notes: 'Pad de fundo' },
      { name: 'Pad Brilhante', setName: 'Worship', withKeyboard: true, notes: 'Pad com brilho' },
      { name: 'Piano Worship', setName: 'Worship', withKeyboard: true, notes: 'Piano da banda' },
      { name: 'Ambiente', setName: 'Worship', withKeyboard: true, notes: 'Texturas e transições' },
    ],
  },
  {
    id: 'fullset',
    name: 'Full Set',
    description: 'Set completo com 40 patches em 8 famílias, usando instrumentos livres (juicysfplugin/Surge/Dexed/Odin/Helm/MDA)',
    concertName: 'Full Set — 40 Patches',
    tempo: 100,
    sets: [
      'Pianos',
      'Teclas elétricas',
      'Órgãos',
      'Cordas e orquestra',
      'Pads',
      'Leads e sintetizadores',
      'Baixos',
      'Layers e splits',
    ],
    patches: [
      // 1. Pianos
      { name: 'Piano de Cauda', setName: 'Pianos', withKeyboard: true, layers: [layer('juicysfplugin', 'Piano de cauda (MuseScore_General)', { programIndex: 0 })] },
      { name: 'Piano de Cauda Brilhante', setName: 'Pianos', withKeyboard: true, layers: [layer('juicysfplugin', 'Piano brilhante', { programIndex: 0 })] },
      { name: 'Piano Suave', setName: 'Pianos', withKeyboard: true, layers: [layer('juicysfplugin', 'Piano suave', { programIndex: 0 })] },
      { name: 'Piano Vertical', setName: 'Pianos', withKeyboard: true, layers: [layer('juicysfplugin', 'Piano vertical', { programIndex: 1 })] },
      { name: 'Piano + Pad', setName: 'Pianos', withKeyboard: true, layers: [layer('juicysfplugin', 'Piano', { programIndex: 0 }), layer('Surge XT', 'Pad quente', { db: -12 })] },

      // 2. Teclas elétricas
      { name: 'Elétrico Clássico', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('Dexed', 'E.Piano', { db: -6 })] },
      { name: 'Elétrico Suave', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('Dexed', 'E.Piano release longo', { db: -6 })] },
      { name: 'Elétrico com Tremolo', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('MDA ePiano', 'ePiano + tremolo', { db: -6 })] },
      { name: 'Clavinet', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('Surge XT', 'Clavinet', { db: -6 })] },
      { name: 'Sinos Elétricos', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('Dexed', 'Bell', { db: -6 })] },

      // 3. Órgãos
      { name: 'Órgão Tonewheel', setName: 'Órgãos', withKeyboard: true, layers: [layer('juicysfplugin', 'Tonewheel', { db: -6, programIndex: 16 })] },
      { name: 'Órgão Rock', setName: 'Órgãos', withKeyboard: true, layers: [layer('juicysfplugin', 'Tonewheel + leslie rápido', { db: -6, programIndex: 16 })] },
      { name: 'Órgão de Igreja', setName: 'Órgãos', withKeyboard: true, layers: [layer('juicysfplugin', 'Church Organ', { db: -6, programIndex: 19 })] },
      { name: 'Órgão Suave', setName: 'Órgãos', withKeyboard: true, layers: [layer('Surge XT', 'Órgão', { db: -6 })] },

      // 4. Cordas e orquestra
      { name: 'Cordas Legato', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('juicysfplugin', 'Cordas sustain', { db: -6, programIndex: 48 })] },
      { name: 'Cordas Staccato', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('juicysfplugin', 'Cordas staccato', { db: -6, programIndex: 48 })] },
      { name: 'Cordas Sintéticas', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Surge XT', 'String ensemble', { db: -6 })] },
      { name: 'Metais', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('juicysfplugin', 'Metais', { db: -6, programIndex: 61 })] },
      { name: 'Flauta', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('juicysfplugin', 'Flauta', { db: -6, programIndex: 73 })] },
      { name: 'Coral', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('juicysfplugin', 'Choir Aahs', { db: -6, programIndex: 52 })] },

      // 5. Pads
      { name: 'Pad Quente', setName: 'Pads', withKeyboard: true, layers: [layer('Surge XT', 'Pad quente', { db: -6 })] },
      { name: 'Pad Ambiente', setName: 'Pads', withKeyboard: true, layers: [layer('Odin 2', 'Ataque e release longos', { db: -6 })] },
      { name: 'Pad de Cordas', setName: 'Pads', withKeyboard: true, layers: [layer('Helm', 'Pad de cordas', { db: -6 })] },
      { name: 'Pad Brilhante', setName: 'Pads', withKeyboard: true, layers: [layer('Surge XT', 'Filtro aberto', { db: -6 })] },
      { name: 'Pad Escuro', setName: 'Pads', withKeyboard: true, layers: [layer('Odin 2', 'Filtro baixo', { db: -6 })] },

      // 6. Leads e sintetizadores
      { name: 'Lead Serra', setName: 'Leads e sintetizadores', withKeyboard: true, layers: [layer('Surge XT', 'Lead saw', { db: -6 })] },
      { name: 'Lead Suave', setName: 'Leads e sintetizadores', withKeyboard: true, layers: [layer('Odin 2', 'Lead', { db: -6 })] },
      { name: 'Pluck', setName: 'Leads e sintetizadores', withKeyboard: true, layers: [layer('Surge XT', 'Pluck', { db: -6 })] },
      { name: 'Arpejo Brilhante', setName: 'Leads e sintetizadores', withKeyboard: true, layers: [layer('Surge XT', 'Arpejo', { db: -6 })] },
      { name: 'Brass Sintético', setName: 'Leads e sintetizadores', withKeyboard: true, layers: [layer('MDA JX10', 'Brass', { db: -6 })] },

      // 7. Baixos
      { name: 'Baixo Sintético', setName: 'Baixos', withKeyboard: true, layers: [layer('Surge XT', 'Sub bass', { db: -6 })] },
      { name: 'Baixo Elétrico', setName: 'Baixos', withKeyboard: true, layers: [layer('juicysfplugin', 'Electric Bass', { db: -6, programIndex: 33 })] },
      { name: 'Baixo Acústico', setName: 'Baixos', withKeyboard: true, layers: [layer('juicysfplugin', 'Acoustic Bass', { db: -6, programIndex: 32 })] },

      // 8. Layers e splits
      {
        name: 'Split Baixo + Piano', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('juicysfplugin', 'Baixo', { db: -6, minNote: 0, maxNote: 59, programIndex: 33 }),
          layer('juicysfplugin', 'Piano', { db: -6, minNote: 60, maxNote: 127, programIndex: 0 }),
        ],
      },
      {
        name: 'Split Baixo + Elétrico', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Surge XT', 'Sub bass', { db: -6, minNote: 0, maxNote: 53 }),
          layer('Dexed', 'E.Piano', { db: -6, minNote: 54, maxNote: 127 }),
        ],
      },
      {
        name: 'Piano + Cordas', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('juicysfplugin', 'Piano', { db: -6, programIndex: 0 }),
          layer('juicysfplugin', 'Cordas legato', { db: -9, programIndex: 48 }),
        ],
      },
      {
        name: 'Piano + Pad (worship)', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('juicysfplugin', 'Piano', { db: -6, programIndex: 0 }),
          layer('Surge XT', 'Pad quente', { db: -12 }),
        ],
      },
      {
        name: 'Elétrico + Pad', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Dexed', 'E.Piano', { db: -6 }),
          layer('Surge XT', 'Pad', { db: -12 }),
        ],
      },
      {
        name: 'Split Cordas / Piano', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('juicysfplugin', 'Cordas', { db: -6, minNote: 0, maxNote: 59, programIndex: 48 }),
          layer('juicysfplugin', 'Piano', { db: -6, minNote: 60, maxNote: 127, programIndex: 0 }),
        ],
      },
      {
        name: 'Tripla: Piano + Cordas + Pad', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('juicysfplugin', 'Piano', { db: -6, programIndex: 0 }),
          layer('juicysfplugin', 'Cordas', { db: -9, programIndex: 48 }),
          layer('Surge XT', 'Pad quente', { db: -12 }),
        ],
      },
    ],
  },
  {
    id: 'midi-externo',
    name: 'MIDI externo',
    description: 'Cria um patch com um timbre MIDI externo e teclado na tela. Ideal para comandar um módulo ou teclado externo.',
    concertName: 'Meu Concert MIDI',
    tempo: DEFAULT_TEMPO,
    sets: ['Externo'],
    patches: [
      { name: 'MIDI externo', setName: 'Externo', withKeyboard: true, notes: 'Timbre MIDI externo' },
    ],
  },
];

export function listTemplates(): ConcertTemplateSummary[] {
  return CONCERT_TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}

/** Monta um concert novo a partir de um template. Template desconhecido = vazio. */
export function buildTemplateConcert(templateId = 'vazio'): PreseterConcertFile {
  const template = CONCERT_TEMPLATES.find((item) => item.id === templateId) ?? CONCERT_TEMPLATES[0];
  const now = Date.now();

  const setIds = new Map<string, string>();
  const sets: PresetSet[] = template.sets.map((name, order) => {
    const id = nextId('set');
    setIds.set(name, id);
    return { id, name, order, expanded: true, createdAt: now, updatedAt: now };
  });

  const orderInSet = new Map<string, number>();
  const rawPatches: Preset[] = template.patches.map((spec, index) => {
    const setId = spec.setName ? setIds.get(spec.setName) : undefined;
    const orderKey = spec.setName ?? '';
    const setOrder = orderInSet.get(orderKey) ?? 0;
    orderInSet.set(orderKey, setOrder + 1);
    const notes = spec.notes ?? (spec.layers?.length ? layerNotes(spec.layers) : undefined);
    return {
      id: nextId('preset'),
      name: spec.name,
      icon: suggestPatchIcon(spec.name, spec.setName),
      notes,
      setId,
      setOrder,
      programNumber: index,
      midiChannel: 0,
      plugins: [],
      vstStates: {},
      layout: {
        elements: spec.withKeyboard ? keyboardRig(notes ?? spec.name, template.tempo) : [],
        background: null,
        tempo: template.tempo,
      },
      createdAt: now,
      updatedAt: now,
    };
  });

  const migrated = migrateConcertLayout(createEmptyLayout(template.tempo), rawPatches);
  const layout = migrated.layout.elements.length > 0
    ? ensureDefaultPedals(migrated.layout)
    : createDefaultKeyboardLayout(template.tempo);
  return {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: nextId('concert'),
      name: template.concertName,
      tempo: template.tempo,
      settings: createDefaultConcertSettings(),
      strips: [],
      createdAt: now,
      updatedAt: now,
    },
    sets,
    patches: migrated.patches,
    layout,
    mappings: [],
  };
}
