import type { LayoutConfig, UiElement } from './types';
import { MAX_AUX_BUSES, SEND_OFF_DB } from './types';
import { DEFAULT_TEMPO } from './constants';

function elementId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cc(controllerNumber: number): UiElement['midiCommand'] {
  return { type: 'cc', channel: 0, controllerNumber };
}

export interface DefaultKeyboardLayoutOptions {
  /** Texto do label central (normalmente o nome do patch). */
  title?: string;
  /** Primeira nota do teclado; padrão C1. */
  keyboardLow?: number;
  /** Última nota do teclado; padrão C6. */
  keyboardHigh?: number;
}

/**
 * Layout padrão no estilo MainStage, na disposição usada pelo app:
 * Volume + Modulação + MIDI + nome do patch no topo esquerdo, Aux 1–4 à
 * direita, teclado centralizado embaixo e só Expression/Sustain como pedais.
 * O Volume é um fader; não existe pedal de volume duplicado.
 */
export function createDefaultKeyboardLayout(
  tempo: number = DEFAULT_TEMPO,
  options: DefaultKeyboardLayoutOptions = {}
): LayoutConfig {
  const volume: UiElement = {
    id: elementId('element_default_volume'),
    type: 'fader',
    label: 'Volume',
    x: 40,
    y: 28,
    width: 56,
    height: 112,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    midiCommand: cc(7),
  };
  const modulation: UiElement = {
    id: elementId('element_default_modulation'),
    type: 'knob',
    label: 'Modulação',
    x: 120,
    y: 28,
    width: 68,
    height: 112,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    midiCommand: cc(1),
  };
  const midiActivity: UiElement = {
    id: elementId('element_default_midi'),
    type: 'midi-activity',
    label: 'MIDI',
    x: 224,
    y: 28,
    width: 100,
    height: 56,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
  };
  const title: UiElement = {
    id: elementId('element_default_title'),
    type: 'label',
    label: options.title?.trim() || 'Novo patch',
    labelBinding: 'patch-name',
    x: 330,
    y: 96,
    width: 170,
    height: 32,
    color: '#F2F2F2',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
  };
  const patchSends: UiElement[] = Array.from({ length: MAX_AUX_BUSES }, (_, index) => ({
    id: elementId(`element_default_send${index + 1}`),
    type: 'knob',
    label: `Aux ${index + 1}`,
    x: 744 + (index % 2) * 98,
    y: 24 + Math.floor(index / 2) * 104,
    width: 78,
    height: 100,
    color: '#0A84FF',
    minValue: SEND_OFF_DB,
    maxValue: 6,
    orientation: 'vertical',
    isMomentary: false,
    value: SEND_OFF_DB,
    patchSendAux: index + 1,
  }));
  const keyboard: UiElement = {
    id: elementId('element_default_keyboard'),
    type: 'keyboard',
    label: 'Teclado',
    x: 208,
    y: 393,
    width: 695,
    height: 172,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    keyboardLow: options.keyboardLow ?? 24,
    keyboardHigh: options.keyboardHigh ?? 84,
    keyboardSplit: null,
    keyboardChannel: 0,
  };
  const expression: UiElement = {
    id: elementId('element_default_expression'),
    type: 'pedal',
    label: 'Expression',
    x: 40,
    y: 512,
    width: 58,
    height: 90,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    midiCommand: cc(11),
    pedalKind: 'expression',
  };
  const sustain: UiElement = {
    id: elementId('element_default_sustain'),
    type: 'pedal',
    label: 'Sustain',
    x: 118,
    y: 512,
    width: 58,
    height: 90,
    color: '#8E8E93',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: true,
    value: 0,
    midiCommand: cc(64),
    pedalKind: 'sustain',
  };
  return {
    elements: [volume, modulation, midiActivity, title, ...patchSends, keyboard, expression, sustain],
    background: null,
    tempo,
  };
}

/** Adiciona os pedais padrão a um layout que já tem teclado, se faltarem. */
export function ensureDefaultPedals(layout: LayoutConfig): LayoutConfig {
  const hasPedal = layout.elements.some((element) => element.type === 'pedal');
  if (hasPedal) return layout;
  const template = createDefaultKeyboardLayout(layout.tempo);
  const pedals = template.elements.filter((element) => element.type === 'pedal');
  return { ...layout, elements: [...layout.elements, ...pedals] };
}
