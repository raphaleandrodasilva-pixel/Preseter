/**
 * Templates de concert (Fase 2.3). O usuário escolhe um ao criar um concert
 * novo; cada template monta sets e patches prontos para receber instrumentos.
 */

import { ConcertTemplateSummary, Preset, PresetSet, PreseterConcertFile, UiElement } from '../../shared/types';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultConcertSettings, createEmptyLayout } from './ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { createDefaultKeyboardLayout, ensureDefaultPedals } from '../../shared/default-layout';

interface PatchSpec {
  name: string;
  /** Nome do set onde o patch entra (precisa estar em `sets`). */
  setName?: string;
  notes?: string;
  /** Cria o rig de teclado padrão (teclado + volume + modulação). */
  withKeyboard?: boolean;
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

function element(spec: {
  type: UiElement['type'];
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  midiCommand?: UiElement['midiCommand'];
  isMomentary?: boolean;
  pedalKind?: UiElement['pedalKind'];
  value?: number;
}): UiElement {
  return {
    id: nextId('element'),
    type: spec.type,
    label: spec.label,
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    color: spec.color ?? '#9A9AA0',
    minValue: 0,
    maxValue: 1,
    orientation: spec.orientation ?? 'vertical',
    isMomentary: spec.isMomentary ?? (spec.type === 'button' || spec.type === 'pedal' || spec.type === 'pad'),
    value: spec.type === 'keyboard' ? undefined : (spec.value ?? 0.5),
    ...(spec.midiCommand ? { midiCommand: spec.midiCommand } : {}),
    ...(spec.pedalKind ? { pedalKind: spec.pedalKind } : {}),
  };
}

function cc(controllerNumber: number): UiElement['midiCommand'] {
  return { type: 'cc', channel: 0, controllerNumber };
}

/** Rig padrão de um patch de teclado: teclado central, sustain, expression, volume, modulação e atividade MIDI. */
function keyboardRig(notes: string): UiElement[] {
  return [
    element({ type: 'keyboard', label: 'Teclado', x: 200, y: 300, width: 520, height: 200, color: '#0A84FF' }),
    element({
      type: 'pedal', label: 'Sustain', x: 100, y: 400, width: 72, height: 100,
      color: '#30D158', midiCommand: cc(64), isMomentary: true, pedalKind: 'sustain', value: 0,
    }),
    element({
      type: 'pedal', label: 'Expression', x: 16, y: 400, width: 72, height: 100,
      color: '#0A84FF', midiCommand: cc(11), isMomentary: false, pedalKind: 'expression',
    }),
    element({
      type: 'pedal', label: 'Volume', x: 16, y: 280, width: 72, height: 100,
      color: '#FF9F0A', midiCommand: cc(7), isMomentary: false, pedalKind: 'volume',
    }),
    element({ type: 'fader', label: 'Volume', x: 24, y: 24, width: 66, height: 112, midiCommand: cc(7) }),
    element({ type: 'knob', label: 'Modulação', x: 104, y: 24, width: 96, height: 112, midiCommand: cc(1) }),
    element({ type: 'midi-activity', label: 'MIDI', x: 216, y: 24, width: 128, height: 48 }),
    element({ type: 'label', label: notes, x: 216, y: 80, width: 260, height: 40 }),
  ];
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
    return {
      id: nextId('preset'),
      name: spec.name,
      notes: spec.notes,
      setId,
      setOrder,
      programNumber: index,
      midiChannel: 0,
      plugins: [],
      vstStates: {},
      layout: {
        elements: spec.withKeyboard ? keyboardRig(spec.notes ?? spec.name) : [],
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
