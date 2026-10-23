import { describe, expect, it } from 'vitest';
import { createDefaultKeyboardLayout, ensureDefaultPedals } from './default-layout';
import { createElement, createLayout } from '../test/fixtures';

describe('createDefaultKeyboardLayout', () => {
  it('creates a keyboard and the three default pedals', () => {
    const layout = createDefaultKeyboardLayout(140);
    expect(layout.tempo).toBe(140);
    expect(layout.background).toBeNull();
    expect(layout.elements.map((element) => element.type)).toEqual([
      'keyboard',
      'pedal',
      'pedal',
      'pedal',
    ]);
    expect(layout.elements.map((element) => element.label)).toEqual([
      'Teclado',
      'Sustain',
      'Expression',
      'Volume',
    ]);
  });

  it('uses safe defaults and valid keyboard ranges', () => {
    const layout = createDefaultKeyboardLayout();
    const keyboard = layout.elements.find((element) => element.type === 'keyboard')!;
    expect(layout.tempo).toBe(120);
    expect(keyboard.keyboardLow).toBe(36);
    expect(keyboard.keyboardHigh).toBe(84);
    expect(keyboard.keyboardSplit).toBeNull();
    expect(keyboard.keyboardChannel).toBe(0);
  });

  it('uses the expected MIDI controllers for the pedals', () => {
    const pedals = createDefaultKeyboardLayout().elements.filter((element) => element.type === 'pedal');
    expect(pedals.map((pedal) => pedal.midiCommand?.controllerNumber)).toEqual([64, 11, 7]);
    expect(pedals.map((pedal) => pedal.pedalKind)).toEqual(['sustain', 'expression', 'volume']);
    expect(pedals.map((pedal) => pedal.isMomentary)).toEqual([true, false, false]);
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
    expect(result.elements.filter((element) => element.type === 'pedal')).toHaveLength(3);
  });
});
