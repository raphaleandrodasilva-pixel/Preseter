import type { LayoutConfig, UiElement } from './types';
import { DEFAULT_TEMPO } from './constants';

function elementId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cc(controllerNumber: number): UiElement['midiCommand'] {
  return { type: 'cc', channel: 0, controllerNumber };
}

/**
 * Layout inicial no estilo MainStage: teclado centralizado na parte inferior,
 * sustain e expression pedals à esquerda. Usado apenas quando o concert ainda
 * não tem nenhum controle.
 */
export function createDefaultKeyboardLayout(tempo: number = DEFAULT_TEMPO): LayoutConfig {
  const keyboard: UiElement = {
    id: elementId('element_default_keyboard'),
    type: 'keyboard',
    label: 'Teclado',
    x: 220,
    y: 330,
    width: 560,
    height: 200,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    keyboardLow: 36,
    keyboardHigh: 84,
    keyboardSplit: null,
    keyboardChannel: 0,
  };
  const sustain: UiElement = {
    id: elementId('element_default_sustain'),
    type: 'pedal',
    label: 'Sustain',
    x: 100,
    y: 430,
    width: 72,
    height: 100,
    color: '#30D158',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: true,
    value: 0,
    midiCommand: cc(64),
    pedalKind: 'sustain',
  };
  const expression: UiElement = {
    id: elementId('element_default_expression'),
    type: 'pedal',
    label: 'Expression',
    x: 16,
    y: 430,
    width: 72,
    height: 100,
    color: '#0A84FF',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    midiCommand: cc(11),
    pedalKind: 'expression',
  };
  const volume: UiElement = {
    id: elementId('element_default_volume'),
    type: 'pedal',
    label: 'Volume',
    x: 16,
    y: 310,
    width: 72,
    height: 100,
    color: '#FF9F0A',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: 0.5,
    midiCommand: cc(7),
    pedalKind: 'volume',
  };
  return { elements: [keyboard, sustain, expression, volume], background: null, tempo };
}

/** Adiciona os pedais padrão a um layout que já tem teclado, se faltarem. */
export function ensureDefaultPedals(layout: LayoutConfig): LayoutConfig {
  const hasPedal = layout.elements.some((element) => element.type === 'pedal');
  if (hasPedal) return layout;
  const template = createDefaultKeyboardLayout(layout.tempo);
  const pedals = template.elements.filter((element) => element.type === 'pedal');
  return { ...layout, elements: [...layout.elements, ...pedals] };
}
