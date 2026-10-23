import { describe, expect, it } from 'vitest';
import type { Preset, UiElement } from '@shared/types';
import {
  PALETTE_CATEGORIES,
  PALETTE_ITEMS,
  findPaletteItem,
  makeElement,
  midiBindingDescription,
  noteName,
  pluginBindingDescription,
  snap8,
} from './elementFactory';
import { createElement, createPreset } from '../../../test/fixtures';

describe('grid and note helpers', () => {
  it('snaps values to the nearest 8px grid', () => {
    expect(snap8(0)).toBe(0);
    expect(snap8(3)).toBe(0);
    expect(snap8(4)).toBe(8);
    expect(snap8(12)).toBe(16);
    expect(snap8(-5)).toBe(-8);
  });

  it('formats and clamps MIDI note names', () => {
    expect(noteName(0)).toBe('C-1');
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(127)).toBe('G9');
    expect(noteName(-10)).toBe('C-1');
    expect(noteName(200)).toBe('G9');
    expect(noteName(60.4)).toBe('C4');
  });
});

describe('palette', () => {
  it('lists every category and finds items by key', () => {
    expect(PALETTE_CATEGORIES.map((category) => category.id)).toEqual([
      'panel',
      'organ',
      'concert',
      'meters',
      'grouped',
      'all',
    ]);
    expect(findPaletteItem('sustain')).toMatchObject({
      label: 'Sustain',
      pedalKind: 'sustain',
      isMomentary: true,
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 64 },
    });
    expect(findPaletteItem('group-drawbars')?.group).toHaveLength(9);
    expect(findPaletteItem('missing')).toBeNull();
    expect(findPaletteItem(null)).toBeNull();
    expect(PALETTE_ITEMS.length).toBeGreaterThan(10);
  });
});

describe('makeElement', () => {
  it('uses per-type defaults and clamps the position', () => {
    const drawbar = makeElement('drawbar', -10, -20, '8');
    expect(drawbar).toMatchObject({
      type: 'drawbar',
      x: 0,
      y: 0,
      width: 36,
      height: 190,
      minValue: 0,
      maxValue: 8,
      value: 0,
      orientation: 'vertical',
      isMomentary: false,
      color: '#C6A15B',
    });
    expect(drawbar.id).toMatch(/^element_/);

    expect(makeElement('slider', 10, 20, 'S')).toMatchObject({
      orientation: 'horizontal',
      width: 190,
      height: 56,
    });
    expect(makeElement('pedal', 0, 0, 'P')).toMatchObject({
      isMomentary: true,
      color: '#0A84FF',
    });
    expect(makeElement('audio-input', 0, 0, 'A').color).toBe('#FF9F0A');
    expect(makeElement('button', 0, 0, 'B')).toMatchObject({
      isMomentary: true,
      value: 0.5,
    });
  });

  it('applies palette overrides', () => {
    const sustain = findPaletteItem('sustain')!;
    const element = makeElement('pedal', 0, 0, sustain.label, undefined, sustain);
    expect(element).toMatchObject({
      label: 'Sustain',
      color: '#30D158',
      value: 0,
      isMomentary: true,
      pedalKind: 'sustain',
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 64 },
    });
  });

  it('allows orientation and palette color overrides', () => {
    const element = makeElement('knob', 0, 0, 'K', 'horizontal', {
      key: 'custom',
      type: 'knob',
      label: 'K',
      hint: '',
      category: 'panel',
      color: '#123456',
    });
    expect(element.orientation).toBe('horizontal');
    expect(element.color).toBe('#123456');
  });
});

describe('midiBindingDescription', () => {
  function element(binding: UiElement['midiCommand'], extra: Partial<UiElement> = {}): UiElement {
    return createElement({ midiCommand: binding, ...extra });
  }

  it('shows a dash without a binding', () => {
    expect(midiBindingDescription(createElement({ midiCommand: undefined }), 0)).toBe('\u2014');
  });

  it('describes CC, note, program, pitch and aftertouch bindings', () => {
    expect(
      midiBindingDescription(
        element({ type: 'cc', channel: 1, controllerNumber: 7 }),
        3
      )
    ).toMatch(/^CC 7 .* 2$/);
    expect(
      midiBindingDescription(
        element({ type: 'note', channel: 0 }, { noteNumber: 60 }),
        0
      )
    ).toMatch(/^Nota C4 \(60\) .* 1$/);
    expect(
      midiBindingDescription(element({ type: 'pc', channel: 0, programNumber: 12 }), 4)
    ).toMatch(/^PC 12 .* 1$/);
    expect(
      midiBindingDescription(element({ type: 'pitch', channel: 0 }), 0)
    ).toMatch(/Pitch Bend .* 1$/);
    expect(
      midiBindingDescription(
        element({ type: 'aftertouch', channel: 0, controllerNumber: 64 }),
        0
      )
    ).toMatch(/Aftertouch E4 .* 1$/);
    expect(
      midiBindingDescription(element({ type: 'aftertouch', channel: 0 }), 1)
    ).toMatch(/^Aftertouch .* 1$/);
    expect(
      midiBindingDescription(
        element({ type: 'bogus' } as unknown as UiElement['midiCommand']),
        3
      )
    ).toMatch(/4$/);
  });

  it('uses fallback values for incomplete bindings', () => {
    expect(
      midiBindingDescription(element({ type: 'cc' } as unknown as UiElement['midiCommand']), 0)
    ).toMatch(/CC \? .* 1$/);
    expect(
      midiBindingDescription(element({ type: 'pc' } as unknown as UiElement['midiCommand']), 0)
    ).toMatch(/PC \? .* 1$/);
    expect(
      midiBindingDescription(element({ type: 'note' } as unknown as UiElement['midiCommand']), 0)
    ).toMatch(/Nota C4 \(60\)/);
  });
});

describe('pluginBindingDescription', () => {
  const draft: Preset = createPreset({
    plugins: [
      {
        pluginId: 'p1',
        name: 'My Plug',
        path: 'C:/p.vst3',
        role: 'instrument',
      },
    ],
  });

  it('returns a dash without a plugin path', () => {
    expect(pluginBindingDescription(createElement(), draft, [])).toBe('\u2014');
  });

  it('uses the plugin name and resolved parameter name', () => {
    const element = createElement({ pluginPath: 'C:/p.vst3', parameterId: 'cutoff' });
    expect(
      pluginBindingDescription(element, draft, [
        { path: 'C:/p.vst3', params: [{ id: 'cutoff', name: 'Cutoff' }] },
      ])
    ).toMatch(/^My Plug .* Cutoff$/);
  });

  it('falls back to path and parameter id when names are unknown', () => {
    const element = createElement({ pluginPath: 'C:/unknown.vst3', parameterId: 'param-x' });
    expect(pluginBindingDescription(element, draft, [])).toMatch(
      /^C:\/unknown\.vst3 .* param-x$/
    );
    expect(
      pluginBindingDescription(createElement({ pluginPath: 'C:/p.vst3' }), draft, [])
    ).toBe('My Plug');
  });
});
