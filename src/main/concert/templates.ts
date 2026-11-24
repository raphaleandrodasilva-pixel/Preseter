/**
 * Templates de concert (Fase 2.3). O usuário escolhe um ao criar um concert
 * novo; cada template monta sets e patches prontos para receber instrumentos.
 */

import { AudioInputSettings, ConcertTemplateSummary, Insert, MAX_AUX_BUSES, Preset, PresetPluginAssignment, PresetSet, PreseterConcertFile, SEND_OFF_DB } from '../../shared/types';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultConcertSettings, createEmptyLayout } from './ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { createDefaultKeyboardLayout, ensureDefaultPedals } from '../../shared/default-layout';
import type { CollectionLayerSpec } from '../../shared/collection-presets';
import { buildPatchLayout, buildPedalboardLayout } from '../../shared/collection-layouts';
import { nativeInstrumentInfo } from '../../shared/native-instruments';
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
  /** Camada nativa carregada pelo template (além das sugestões de VST). */
  native?: {
    id: 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx' | 'dexed' | 'synth2';
    programIndex?: number;
  };
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
  /** Instrumento nativo que o template carrega no patch (tocável). */
  native?: {
    id: 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx' | 'dexed' | 'synth2';
    programIndex?: number;
    label?: string;
  };
  /** Inserts do Master do Patch com a cadeia Guitarix embutida. */
  masterInserts?: GuitarInsertSpec[];
  /** Layout de pedaleira (sem teclado): pedais para os inserts do Master. */
  pedalboard?: boolean;
  /** Entrada de áudio do patch (pedaleira ao vivo). */
  audioInput?: AudioInputSettings;
}

/** Efeito de guitarra embutido (URI estável do bundle LV2). */
interface GuitarInsertSpec {
  name: string;
  pluginId: string;
  uri: string;
  preset?: string;
}

const GX = {
  overdrive: {
    name: 'Preseter Overdrive',
    pluginId: 'preseter.gx.overdrive',
    uri: 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim',
  },
  preamp: {
    name: 'Preseter Preamp',
    pluginId: 'preseter.gx.preamp',
    uri: 'http://guitarix.sourceforge.net/plugins/gx_studiopre#studiopre',
  },
  cab: {
    name: 'Preseter Cab',
    pluginId: 'preseter.gx.cab',
    uri: 'http://guitarix.sourceforge.net/plugins/gx_cabinet#CABINET',
  },
  amp: {
    name: 'Preseter Amp',
    pluginId: 'preseter.gx.amp',
    uri: 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX',
  },
  tremolo: {
    name: 'Preseter Tremolo',
    pluginId: 'preseter.gx.tremolo',
    uri: 'http://guitarix.sourceforge.net/plugins/gx_tremolo#_tremolo',
  },
} as const;

function gx(id: keyof typeof GX, preset?: string): GuitarInsertSpec {
  return { ...GX[id], ...(preset ? { preset } : {}) };
}

/** Entrada de áudio habilitada e roteada pelo Master do Patch (pedaleira ao vivo). */
function audioInputForPedalboard (): AudioInputSettings {
  return {
    enabled: true,
    inputChannel: 0,
    mode: 'mono',
    volumeDb: 0,
    pan: 0,
    muted: false,
    feedbackProtection: true,
    output: 1,
    destination: 'patch',
  };
}

function slugify (text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Layers que o construtor de layout recebe (nativos/sampler têm parâmetros). */
function templateLayerSpecs(spec: PatchSpec): CollectionLayerSpec[] {
  if (spec.native) {
    return [{
      inst: 'NATIVE',
      db: 0,
      min: 0,
      max: 127,
      label: spec.native.label ?? spec.name,
      nativeInstrument: spec.native.id,
      programIndex: spec.native.programIndex ?? 0,
    }];
  }
  return (spec.layers ?? []).map((item) => ({
    inst: 'MDA' as const,
    db: item.db ?? 0,
    min: item.minNote ?? 0,
    max: item.maxNote ?? 127,
    label: item.label,
    ...(item.programIndex !== undefined ? { programIndex: item.programIndex } : {}),
    ...(item.native
      ? { nativeInstrument: item.native.id, programIndex: item.native.programIndex ?? 0 }
      : {}),
  }));
}

/** Instrumento nativo pronto para tocar (o template deixa de ser só estrutura). */
function templateAssignment(spec: PatchSpec, slug: string): PresetPluginAssignment | null {
  if (spec.native) {
    const id = `preseter.${spec.native.id}`;
    const info = nativeInstrumentInfo(id);
    return {
      pluginId: id,
      layerId: `${slug}:layer:0`,
      name: info?.name ?? spec.name,
      path: id,
      role: 'instrument',
      programIndex: spec.native.programIndex ?? 0,
      minNote: 0,
      maxNote: 127,
      mix: {
        volumeDb: 0,
        pan: 0,
        muted: false,
        solo: false,
      },
    };
  }

  const index = (spec.layers ?? []).findIndex((item) => item.native);
  if (index < 0) return null;
  const item = (spec.layers ?? [])[index];
  if (!item.native) return null;
  const id = `preseter.${item.native.id}`;
  const info = nativeInstrumentInfo(id);
  return {
    pluginId: id,
    layerId: `${slug}:layer:${index}`,
    name: item.label || info?.name || spec.name,
    path: id,
    role: 'instrument',
    programIndex: item.native.programIndex ?? 0,
    minNote: item.minNote ?? 0,
    maxNote: item.maxNote ?? 127,
    mix: {
      volumeDb: item.db ?? 0,
      pan: 0,
      muted: false,
      solo: false,
    },
  };
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

/** Show de 10 músicas: cada set é uma música, com Intro/Verso/Refrão. */
const SHOW_SONG_COUNT = 10;
const SHOW_PARTS = ['Intro', 'Verso', 'Refrão'] as const;
const SHOW_SET_NAMES = Array.from(
  { length: SHOW_SONG_COUNT },
  (_, index) => `${String(index + 1).padStart(2, '0')} — Música ${index + 1}`
);
const SHOW_PATCHES: PatchSpec[] = SHOW_SET_NAMES.flatMap((setName, index) =>
  SHOW_PARTS.map((part) => ({
    name: part,
    setName,
    withKeyboard: true,
    notes: `${part} — Música ${index + 1}`,
  }))
);

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
      { name: 'Piano', setName: 'Teclado', withKeyboard: true, notes: 'Piano acústico', native: { id: 'piano' } },
      { name: 'Piano Elétrico', setName: 'Teclado', withKeyboard: true, notes: 'Rhodes / Wurli', native: { id: 'tines' } },
      { name: 'Pads', setName: 'Teclado', withKeyboard: true, notes: 'Camadas de pad', native: { id: 'jx', programIndex: 0 } },
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
      { name: 'Pad Suave', setName: 'Worship', withKeyboard: true, notes: 'Pad de fundo', native: { id: 'jx', programIndex: 0 } },
      { name: 'Pad Brilhante', setName: 'Worship', withKeyboard: true, notes: 'Pad com brilho', native: { id: 'jx', programIndex: 1 } },
      { name: 'Piano Worship', setName: 'Worship', withKeyboard: true, notes: 'Piano da banda', native: { id: 'piano' } },
      { name: 'Ambiente', setName: 'Worship', withKeyboard: true, notes: 'Texturas e transições', native: { id: 'jx', programIndex: 2 } },
    ],
  },
  {
    id: 'show-10',
    name: 'Show — 10 músicas',
    description: '10 sets, um por música, com Intro, Verso e Refrão em cada um. Adicione os instrumentos e efeitos de cada parte.',
    concertName: 'Meu Show — 10 Músicas',
    tempo: DEFAULT_TEMPO,
    sets: SHOW_SET_NAMES,
    patches: SHOW_PATCHES,
  },
  {
    id: 'guitarra',
    name: 'Guitarra',
    description: 'Pedaleira para entrada ao vivo (guitarra, microfone, baixo, violão): a cadeia Guitarix (Preseter Overdrive, Preamp, Cab, Amp e Tremolo) já vem no Master do Patch, com a entrada de áudio habilitada e roteada para os pedais.',
    concertName: 'Meu Concert de Guitarra',
    tempo: 100,
    sets: ['Guitarra'],
    patches: [
      {
        name: 'Guitarra Clean', setName: 'Guitarra', withKeyboard: false, pedalboard: true,
        notes: 'Preamp → Cab → Tremolo. Plugar a fonte na entrada de áudio.',
        masterInserts: [gx('preamp', 'bright'), gx('cab', 'open'), gx('tremolo', 'subtle')],
        audioInput: audioInputForPedalboard(),
      },
      {
        name: 'Guitarra Crunch', setName: 'Guitarra', withKeyboard: false, pedalboard: true,
        notes: 'Overdrive → Amp (Crunch). Plugar a fonte na entrada de áudio.',
        masterInserts: [gx('overdrive', 'crunch'), gx('amp', 'crunch')],
        audioInput: audioInputForPedalboard(),
      },
      {
        name: 'Guitarra Lead', setName: 'Guitarra', withKeyboard: false, pedalboard: true,
        notes: 'Overdrive → Amp (Lead). Plugar a fonte na entrada de áudio.',
        masterInserts: [gx('overdrive', 'lead'), gx('amp', 'lead')],
        audioInput: audioInputForPedalboard(),
      },
    ],
  },
  {
    id: 'fullset',
    name: 'Full Set',
    description: 'Set completo com 40 patches em 8 famílias, usando instrumentos livres (Sforzando/FSVR/Surge/Dexed nativo/Odin/Helm/MDA)',
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
      { name: 'Piano de Cauda', setName: 'Pianos', withKeyboard: true, layers: [layer('Sforzando', 'Piano de cauda (MuseScore_General)', { programIndex: 0 })] },
      { name: 'Piano de Cauda Brilhante', setName: 'Pianos', withKeyboard: true, layers: [layer('Sforzando', 'Piano brilhante', { programIndex: 0 })] },
      { name: 'Piano Suave', setName: 'Pianos', withKeyboard: true, layers: [layer('Sforzando', 'Piano suave', { programIndex: 0 })] },
      { name: 'Piano Vertical', setName: 'Pianos', withKeyboard: true, layers: [layer('Sforzando', 'Piano vertical', { programIndex: 1 })] },
      { name: 'Piano + Pad', setName: 'Pianos', withKeyboard: true, layers: [layer('Sforzando', 'Piano', { programIndex: 0 }), layer('Surge XT', 'Pad quente', { db: -12 })] },

      // 2. Teclas elétricas
      { name: 'Elétrico Clássico', setName: 'Teclas elétricas', withKeyboard: true, native: { id: 'dexed', programIndex: 87 } },
      { name: 'Elétrico Suave', setName: 'Teclas elétricas', withKeyboard: true, native: { id: 'dexed', programIndex: 483 } },
      { name: 'Elétrico com Tremolo', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('MDA ePiano', 'ePiano + tremolo', { db: -6 })] },
      { name: 'Clavinet', setName: 'Teclas elétricas', withKeyboard: true, layers: [layer('Surge XT', 'Clavinet', { db: -6 })] },
      { name: 'Sinos Elétricos', setName: 'Teclas elétricas', withKeyboard: true, native: { id: 'dexed', programIndex: 667 } },

      // 3. Órgãos
      { name: 'Órgão Tonewheel', setName: 'Órgãos', withKeyboard: true, layers: [layer('Sforzando', 'Tonewheel', { db: -6, programIndex: 16 })] },
      { name: 'Órgão Rock', setName: 'Órgãos', withKeyboard: true, layers: [layer('Sforzando', 'Tonewheel + leslie rápido', { db: -6, programIndex: 16 })] },
      { name: 'Órgão de Igreja', setName: 'Órgãos', withKeyboard: true, layers: [layer('Sforzando', 'Church Organ', { db: -6, programIndex: 19 })] },
      { name: 'Órgão Suave', setName: 'Órgãos', withKeyboard: true, layers: [layer('Surge XT', 'Órgão', { db: -6 })] },

      // 4. Cordas e orquestra
      { name: 'Cordas Legato', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Sforzando', 'Cordas sustain', { db: -6, programIndex: 48 })] },
      { name: 'Cordas Staccato', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Sforzando', 'Cordas staccato', { db: -6, programIndex: 48 })] },
      { name: 'Cordas Sintéticas', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Surge XT', 'String ensemble', { db: -6 })] },
      { name: 'Metais', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Sforzando', 'Metais', { db: -6, programIndex: 61 })] },
      { name: 'Flauta', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Sforzando', 'Flauta', { db: -6, programIndex: 73 })] },
      { name: 'Coral', setName: 'Cordas e orquestra', withKeyboard: true, layers: [layer('Sforzando', 'Choir Aahs', { db: -6, programIndex: 52 })] },

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
      { name: 'Baixo Elétrico', setName: 'Baixos', withKeyboard: true, layers: [layer('Sforzando', 'Electric Bass', { db: -6, programIndex: 33 })] },
      { name: 'Baixo Acústico', setName: 'Baixos', withKeyboard: true, layers: [layer('Sforzando', 'Acoustic Bass', { db: -6, programIndex: 32 })] },

      // 8. Layers e splits
      {
        name: 'Split Baixo + Piano', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Sforzando', 'Baixo', { db: -6, minNote: 0, maxNote: 59, programIndex: 33 }),
          layer('Sforzando', 'Piano', { db: -6, minNote: 60, maxNote: 127, programIndex: 0 }),
        ],
      },
      {
        name: 'Split Baixo + Elétrico', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Surge XT', 'Sub bass', { db: -6, minNote: 0, maxNote: 53 }),
          { instrument: 'Dexed', label: 'E.Piano', db: -6, minNote: 54, maxNote: 127, native: { id: 'dexed', programIndex: 87 } },
        ],
      },
      {
        name: 'Piano + Cordas', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Sforzando', 'Piano', { db: -6, programIndex: 0 }),
          layer('Sforzando', 'Cordas legato', { db: -9, programIndex: 48 }),
        ],
      },
      {
        name: 'Piano + Pad (worship)', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Sforzando', 'Piano', { db: -6, programIndex: 0 }),
          layer('Surge XT', 'Pad quente', { db: -12 }),
        ],
      },
      {
        name: 'Elétrico + Pad', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          { instrument: 'Dexed', label: 'E.Piano', db: -6, native: { id: 'dexed', programIndex: 87 } },
          layer('Surge XT', 'Pad', { db: -12 }),
        ],
      },
      {
        name: 'Split Cordas / Piano', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Sforzando', 'Cordas', { db: -6, minNote: 0, maxNote: 59, programIndex: 48 }),
          layer('Sforzando', 'Piano', { db: -6, minNote: 60, maxNote: 127, programIndex: 0 }),
        ],
      },
      {
        name: 'Tripla: Piano + Cordas + Pad', setName: 'Layers e splits', withKeyboard: true,
        layers: [
          layer('Sforzando', 'Piano', { db: -6, programIndex: 0 }),
          layer('Sforzando', 'Cordas', { db: -9, programIndex: 48 }),
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
  const usedSlugs = new Set<string>();
  const rawPatches: Preset[] = template.patches.map((spec, index) => {
    const setId = spec.setName ? setIds.get(spec.setName) : undefined;
    const orderKey = spec.setName ?? '';
    const setOrder = orderInSet.get(orderKey) ?? 0;
    orderInSet.set(orderKey, setOrder + 1);
    const notes = spec.notes ?? (spec.layers?.length
      ? layerNotes(spec.layers)
      : spec.native
        ? `${nativeInstrumentInfo(`preseter.${spec.native.id}`)?.name ?? spec.native.id} · cartucho de fábrica`
        : undefined);
    const baseSlug = slugify(spec.name) || 'patch';
    let slug = baseSlug;
    if (usedSlugs.has(slug)) {
      slug = slugify(`${spec.setName ?? ''}-${spec.name}`) || baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
    }
    usedSlugs.add(slug);
    const assignment = templateAssignment(spec, slug);
    const masterInserts: Insert[] = (spec.masterInserts ?? []).map((item, slot) => ({
      slot,
      pluginId: item.pluginId,
      name: item.name,
      path: item.uri,
      bypass: false,
      ...(item.preset ? { presetId: item.preset } : {}),
    }));
    return {
      id: nextId('preset'),
      name: spec.name,
      icon: suggestPatchIcon(spec.name, spec.setName),
      notes,
      setId,
      setOrder,
      programNumber: index,
      midiChannel: 0,
      plugins: assignment ? [assignment] : [],
      vstStates: {},
      ...(spec.audioInput ? { audioInput: spec.audioInput } : {}),
      ...(masterInserts.length > 0
        ? {
            master: {
              volumeDb: 0,
              pan: 0,
              muted: false,
              inserts: masterInserts,
              sends: Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB),
            },
          }
        : {}),
      layout: spec.pedalboard
        ? buildPedalboardLayout({
            slug,
            title: notes ?? spec.name,
            tempo: template.tempo,
            owner: 'patch',
            inserts: masterInserts,
          })
        : spec.withKeyboard === false
          ? { elements: [], background: null, tempo: template.tempo }
          : buildPatchLayout({
              slug,
              title: notes ?? spec.name,
              tempo: template.tempo,
              setName: spec.setName ?? '',
              patchName: spec.name,
              layers: templateLayerSpecs(spec),
              layerId: assignment?.layerId,
              masterInserts,
            }),
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
