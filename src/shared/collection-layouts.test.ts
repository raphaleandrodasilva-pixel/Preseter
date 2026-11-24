import { describe, expect, it } from 'vitest';
import type { Insert, Preset } from './types';
import type { CollectionLayerSpec } from './collection-presets';
import { buildPatchLayout, buildPresetLayout } from './collection-layouts';

function layer (overrides: Partial<CollectionLayerSpec> = {}): CollectionLayerSpec {
  return {
    inst: 'NATIVE',
    db: 0,
    min: 0,
    max: 127,
    label: 'Layer',
    ...overrides,
  };
}

function insert (overrides: Partial<Insert> = {}): Insert {
  return {
    slot: 0,
    pluginId: 'calf-reverb',
    name: 'calfNXT Reverb',
    path: 'C:/plugins/calfnxt/calfNXTReverb.vst3',
    bypass: false,
    ...overrides,
  };
}

describe('buildPatchLayout', () => {
  it('monta os 9 drawbars do órgão ligados aos parâmetros do layer', () => {
    const layout = buildPatchLayout({
      slug: 'organ-test',
      title: 'Órgão',
      tempo: 100,
      setName: 'Órgãos',
      patchName: 'Órgão Tonewheel',
      layers: [layer({ nativeInstrument: 'organ' })],
      layerId: 'organ:layer:0',
    });

    const drawbars = layout.elements.filter((element) => element.type === 'drawbar');
    expect(drawbars).toHaveLength(9);
    expect(drawbars.map((element) => element.parameterId)).toEqual(
      Array.from({ length: 9 }, (_, index) => String(index))
    );
    expect(drawbars.every((element) => element.paramOwner === 'organ:layer:0')).toBe(true);
    expect(drawbars.every((element) => element.groupId === drawbars[0].groupId)).toBe(true);

    const keyboard = layout.elements.find((element) => element.type === 'keyboard');
    expect(keyboard).toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });
  });

  it('usa o teclado de 61 teclas do órgão no piano e mapeia os parâmetros reais do sampler', () => {
    const layout = buildPatchLayout({
      slug: 'piano-test',
      title: 'Piano',
      tempo: 100,
      setName: 'Pianos',
      patchName: 'Concert Grand',
      layers: [layer({ sample: { library: 'salamander' } })],
      layerId: 'piano:layer:0',
      layerInserts: [insert()],
    });

    const keyboard = layout.elements.find((element) => element.type === 'keyboard');
    expect(keyboard).toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });

    // Sampler confirmado na P0: 4 Filtro, 3 Release, 6 Velocity, 10 Ganho.
    const samplerControls = layout.elements.filter(
      (element) => element.paramOwner === 'piano:layer:0' && element.paramSlot === undefined
    );
    expect(samplerControls.map((element) => element.parameterId)).toEqual(['4', '3', '6', '10']);
    expect(samplerControls.map((element) => element.label)).toEqual([
      'Brilho',
      'Release',
      'Dinâmica',
      'Volume',
    ]);
  });

  it('mapeia ataque/release/brilho no sampler de cordas', () => {
    const layout = buildPatchLayout({
      slug: 'strings-test',
      title: 'Cordas',
      tempo: 100,
      setName: 'Strings',
      patchName: 'String Ensemble',
      layers: [layer({ sample: { library: 'sonatina', program: 2 } })],
      layerId: 'strings:layer:0',
    });

    const samplerControls = layout.elements.filter(
      (element) => element.paramOwner === 'strings:layer:0'
    );
    expect(samplerControls.map((element) => element.parameterId)).toEqual(['0', '3', '4', '6']);
    expect(layout.elements.find((element) => element.type === 'keyboard'))
      .toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });
  });

  it('acrescenta os controles do arpejador do JX10 quando o patch usa arp', () => {
    const layout = buildPatchLayout({
      slug: 'arp-test',
      title: 'Arpejo',
      tempo: 100,
      setName: 'Synthesizers',
      patchName: 'Arpeggiator',
      layers: [layer({
        nativeInstrument: 'jx',
        arp: { enabled: true, mode: 'up', rate: '1/16', octaves: 2, gate: 50, swing: 0, hold: false },
      })],
      layerId: 'arp:layer:0',
    });

    const arp = layout.elements.filter((element) =>
      ['31', '32', '33', '34'].includes(element.parameterId ?? '')
    );
    expect(arp.map((element) => element.parameterId)).toEqual(['31', '32', '33', '34']);
    expect(arp.every((element) => element.paramOwner === 'arp:layer:0')).toBe(true);
  });

  it('mapeia controles dos efeitos reais do patch', () => {
    const layout = buildPatchLayout({
      slug: 'rhodes-test',
      title: 'Rhodes',
      tempo: 100,
      setName: 'Teclas elétricas',
      patchName: 'Rhodes Classic',
      layers: [layer({ nativeInstrument: 'tines' })],
      layerId: 'rhodes:layer:0',
      layerInserts: [insert({ slot: 1, name: 'Preseter Chorus', path: 'C:/plugins/calfnxt/calfNXTChorus.vst3' })],
    });

    const chorus = layout.elements.filter(
      (element) => element.paramOwner === 'rhodes:layer:0' && element.paramSlot === 1
    );
    expect(chorus.length).toBeGreaterThan(0);
    expect(chorus.every((element) => element.parameterId)).toBe(true);
  });

  it('cai no layout genérico quando não há instrumento reconhecido', () => {
    const layout = buildPatchLayout({
      slug: 'generic-test',
      title: 'Genérico',
      tempo: 120,
      setName: 'Outros',
      patchName: 'Genérico',
      layers: [],
    });
    const types = layout.elements.map((element) => element.type);
    expect(types).toContain('keyboard');
    expect(types).toContain('midi-activity');
    expect(types).not.toContain('drawbar');
    const keyboard = layout.elements.find((element) => element.type === 'keyboard');
    expect(keyboard).toMatchObject({ keyboardLow: 24, keyboardHigh: 84 });
  });

  it('não repete ids de elementos', () => {
    const layout = buildPatchLayout({
      slug: 'ids-test',
      title: 'Órgão',
      tempo: 100,
      setName: 'Órgãos',
      patchName: 'Órgão',
      layers: [layer({ nativeInstrument: 'organ' })],
      layerId: 'x:layer:0',
      layerInserts: [insert(), insert({ slot: 1 })],
    });
    const ids = layout.elements.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não sobrepõe os controles extras', () => {
    const layout = buildPatchLayout({
      slug: 'overlap-test',
      title: 'Órgão',
      tempo: 100,
      setName: 'Órgãos',
      patchName: 'Órgão',
      layers: [layer({ nativeInstrument: 'organ' })],
      layerId: 'x:layer:0',
      layerInserts: [insert(), insert({ slot: 1 })],
    });
    const boxes = layout.elements.filter((element) => element.type !== 'keyboard');
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width
          && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${a.id} sobrepõe ${b.id}`).toBe(false);
      }
    }
  });
});

describe('buildPresetLayout', () => {
  function preset (overrides: Partial<Preset> = {}): Preset {
    return {
      id: 'preset_1',
      name: 'Rhodes Classic',
      icon: 'epiano',
      notes: 'Rhodes',
      setId: 'set_1',
      setOrder: 0,
      programNumber: 0,
      midiChannel: 0,
      plugins: [{
        pluginId: 'preseter.tines',
        layerId: 'rhodes:layer:0',
        name: 'Preseter Tines',
        path: 'preseter.tines',
        role: 'instrument',
        minNote: 0,
        maxNote: 127,
        mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
        inserts: [{
          slot: 0,
          pluginId: 'calf-chorus',
          name: 'calfNXT Chorus',
          path: 'C:/plugins/calfnxt/calfNXTChorus.vst3',
          bypass: false,
        }],
      }],
      vstStates: {},
      layout: { elements: [], background: null, tempo: 92 },
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    };
  }

  it('regera o layout de um patch salvo sem tocar nos plugins', () => {
    const source = preset();
    const layout = buildPresetLayout(source, { setName: 'Teclas elétricas' });

    expect(source.plugins?.[0]?.inserts).toHaveLength(1);
    const tines = layout.elements.filter(
      (element) => element.paramOwner === 'rhodes:layer:0' && element.paramSlot === undefined
    );
    expect(tines.map((element) => element.parameterId)).toEqual(['1', '2', '3', '4', '6', '7']);
    expect(layout.elements.find((element) => element.type === 'keyboard'))
      .toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });
    expect(layout.tempo).toBe(92);
  });

  it('reconhece o sampler salvo e aplica os controles reais', () => {
    const layout = buildPresetLayout(preset({
      name: 'Concert Grand',
      notes: 'Piano',
      plugins: [{
        pluginId: 'preseter.sampler',
        layerId: 'grand:layer:0',
        name: 'Preseter Sampler',
        path: 'preseter.sampler',
        role: 'instrument',
        sourceKind: 'sampler',
        minNote: 0,
        maxNote: 127,
        mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
      }],
    }), { setName: 'Pianos & Keys' });

    expect(layout.elements.find((element) => element.type === 'keyboard'))
      .toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });
    expect(layout.elements.some(
      (element) => element.paramOwner === 'grand:layer:0' && element.parameterId === '4'
    )).toBe(true);
  });
});
