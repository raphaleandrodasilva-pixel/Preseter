import { describe, expect, it } from 'vitest';
import { createDefaultKeyboardLayout, ensureDefaultPedals } from './default-layout';
import { createElement, createLayout } from '../test/fixtures';

describe('createDefaultKeyboardLayout', () => {
  it('creates the fader, modulation, MIDI, title, four patch sends, keyboard and two pedals', () => {
    const layout = createDefaultKeyboardLayout(140);
    expect(layout.tempo).toBe(140);
    expect(layout.background).toBeNull();
    expect(layout.elements.map((element) => element.type)).toEqual([
      'fader',
      'knob',
      'midi-activity',
      'label',
      'knob',
      'knob',
      'knob',
      'knob',
      'keyboard',
      'pedal',
      'pedal',
    ]);
    expect(layout.elements.map((element) => element.label)).toEqual([
      'Volume',
      'Modulação',
      'MIDI',
      'Novo patch',
      'Aux 1',
      'Aux 2',
      'Aux 3',
      'Aux 4',
      'Teclado',
      'Expression',
      'Sustain',
    ]);
  });

  it('não cria pedal de Volume; o volume principal é o fader', () => {
    const layout = createDefaultKeyboardLayout();
    expect(layout.elements.filter((element) => element.type === 'fader')).toHaveLength(1);
    expect(layout.elements.some((element) => element.pedalKind === 'volume')).toBe(false);
    expect(layout.elements.filter((element) => element.type === 'pedal')).toHaveLength(2);
  });

  it('usa o nome do patch no label central', () => {
    const layout = createDefaultKeyboardLayout(120, { title: 'Piano de Cauda' });
    expect(layout.elements.find((element) => element.type === 'label')?.label).toBe('Piano de Cauda');
  });

  it('mantém todos os controles dentro do canvas 1000×625', () => {
    for (const element of createDefaultKeyboardLayout().elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.x + element.width).toBeLessThanOrEqual(1000);
      expect(element.y + element.height).toBeLessThanOrEqual(625);
    }
  });

  it('places the four patch sends above and to the right of the keyboard', () => {
    const layout = createDefaultKeyboardLayout();
    const keyboard = layout.elements.find((element) => element.type === 'keyboard')!;
    const sends = layout.elements.filter((element) => element.patchSendAux !== undefined);
    expect(sends).toHaveLength(4);
    expect(sends.map((element) => element.patchSendAux)).toEqual([1, 2, 3, 4]);
    expect(sends.map((element) => element.minValue)).toEqual([-60, -60, -60, -60]);
    expect(sends.map((element) => element.maxValue)).toEqual([6, 6, 6, 6]);
    for (const send of sends) {
      expect(send.y + send.height).toBeLessThanOrEqual(keyboard.y);
      expect(send.x).toBeGreaterThan(keyboard.x + keyboard.width / 2);
    }
    for (let a = 0; a < sends.length; a += 1) {
      for (let b = a + 1; b < sends.length; b += 1) {
        const overlapX = sends[a].x < sends[b].x + sends[b].width && sends[b].x < sends[a].x + sends[a].width;
        const overlapY = sends[a].y < sends[b].y + sends[b].height && sends[b].y < sends[a].y + sends[a].height;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('uses safe defaults and valid keyboard ranges', () => {
    const layout = createDefaultKeyboardLayout();
    const keyboard = layout.elements.find((element) => element.type === 'keyboard')!;
    expect(layout.tempo).toBe(120);
    expect(keyboard.keyboardLow).toBe(24);
    expect(keyboard.keyboardHigh).toBe(84);
    expect(keyboard.keyboardSplit).toBeNull();
    expect(keyboard.keyboardChannel).toBe(0);
  });

  it('uses the expected MIDI controllers for the pedals', () => {
    const pedals = createDefaultKeyboardLayout().elements.filter((element) => element.type === 'pedal');
    expect(pedals.map((pedal) => pedal.midiCommand?.controllerNumber)).toEqual([11, 64]);
    expect(pedals.map((pedal) => pedal.pedalKind)).toEqual(['expression', 'sustain']);
    expect(pedals.map((pedal) => pedal.isMomentary)).toEqual([false, true]);
  });

  it('lets a single send knob be removed without touching the others', () => {
    const layout = createDefaultKeyboardLayout();
    const removed = layout.elements.find((element) => element.patchSendAux === 2)!;
    const remaining = layout.elements.filter((element) => element.id !== removed.id);
    expect(remaining.some((element) => element.id === removed.id)).toBe(false);
    expect(remaining.filter((element) => element.patchSendAux !== undefined).map((element) => element.patchSendAux))
      .toEqual([1, 3, 4]);
  });

  it('generates fresh element ids per layout', () => {
    const first = createDefaultKeyboardLayout();
    const second = createDefaultKeyboardLayout();
    expect(first.elements.map((element) => element.id)).not.toEqual(
      second.elements.map((element) => element.id)
    );
  });
});

describe('ensureDefaultPedals', () => {
  it('returns a layout that already has a pedal unchanged', () => {
    const layout = createLayout({ elements: [createElement({ type: 'pedal' })] });
    expect(ensureDefaultPedals(layout)).toBe(layout);
  });

  it('adds the default pedals to a layout with only a keyboard', () => {
    const layout = createLayout({
      elements: [createElement({ type: 'keyboard', label: 'Keys' })],
      tempo: 88,
    });
    const result = ensureDefaultPedals(layout);
    expect(result).not.toBe(layout);
    expect(result.tempo).toBe(88);
    expect(result.elements[0]).toBe(layout.elements[0]);
    expect(result.elements.filter((element) => element.type === 'pedal')).toHaveLength(2);
  });
});
