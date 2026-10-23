import { describe, expect, it } from 'vitest';
import type { ConcertMapping, LayoutConfig, Preset } from './types';
import {
  extractMappings,
  materializeLayout,
  migrateConcertLayout,
  resolveMappingsForPatch,
  withoutLayoutGeometry,
} from './concert-layout';
import { createElement, createLayout, createPreset, createSet } from '../test/fixtures';

function mapping(overrides: Partial<ConcertMapping> = {}): ConcertMapping {
  return {
    id: 'mapping-1',
    source: { type: 'cc', channel: 0, controllerNumber: 7 },
    elementId: 'element-1',
    ...overrides,
  };
}

describe('extractMappings', () => {
  it('copies only patch-owned fields from elements with at least one mapping', () => {
    const layout = createLayout({
      elements: [
        createElement({
          id: 'a',
          midiCommand: { type: 'cc', channel: 1, controllerNumber: 11 },
          pluginId: 'p',
          pluginPath: 'C:/p.vst3',
          parameterId: 'cutoff',
          noteNumber: 60,
          velocity: 100,
          mappingMin: 0.1,
          mappingMax: 0.9,
          respondToHardwareMove: 'pickup',
          midiPort: 'port',
          midiThru: true,
        }),
        createElement({ id: 'b', label: 'No mapping' }),
      ],
    });

    expect(extractMappings(layout)).toEqual({
      a: {
        midiCommand: { type: 'cc', channel: 1, controllerNumber: 11 },
        pluginId: 'p',
        pluginPath: 'C:/p.vst3',
        parameterId: 'cutoff',
        noteNumber: 60,
        velocity: 100,
        mappingMin: 0.1,
        mappingMax: 0.9,
        respondToHardwareMove: 'pickup',
        midiPort: 'port',
        midiThru: true,
      },
    });
  });

  it('handles null layouts', () => {
    expect(extractMappings(null)).toEqual({});
    expect(extractMappings(undefined)).toEqual({});
  });
});

describe('resolveMappingsForPatch', () => {
  const set = createSet({ id: 'set-1' });
  const patch = createPreset({
    id: 'patch-1',
    plugins: [
      { pluginId: 'plugin-1', name: 'Plugin', path: 'C:/plugin.vst3', role: 'instrument' },
    ],
    mappings: {
      'element-patch': { midiCommand: { type: 'cc', channel: 0, controllerNumber: 60 } },
    },
  });

  it('resolves concert, matching set, matching patch and patch-local mappings in order', () => {
    const result = resolveMappingsForPatch(
      [
        mapping({ id: 'concert', elementId: 'element-1', pluginId: 'plugin-1' }),
        mapping({ id: 'set', elementId: 'element-2', setId: 'set-1', mappingMin: 0.2 }),
        mapping({ id: 'other-set', elementId: 'element-3', setId: 'set-2' }),
        mapping({ id: 'patch', elementId: 'element-4', patchId: 'patch-1', mappingMax: 0.8 }),
        mapping({ id: 'other-patch', elementId: 'element-5', patchId: 'patch-2' }),
        mapping({ id: 'action', elementId: 'element-6', action: 'panic' }),
      ],
      set,
      patch
    );

    expect(Object.keys(result).sort()).toEqual(
      ['element-1', 'element-2', 'element-4', 'element-patch'].sort()
    );
    expect(result['element-1']).toMatchObject({
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 7 },
      pluginId: 'plugin-1',
      pluginPath: 'C:/plugin.vst3',
    });
    expect(result['element-2']).toMatchObject({ mappingMin: 0.2 });
    expect(result['element-4']).toMatchObject({ mappingMax: 0.8 });
    expect(result['element-4'].pluginPath).toBeUndefined();
    expect(result['element-patch'].midiCommand).toEqual({
      type: 'cc',
      channel: 0,
      controllerNumber: 60,
    });
  });

  it('ignores mappings without an element or with a mismatched scope', () => {
    const result = resolveMappingsForPatch(
      [
        mapping({ id: 'no-element', elementId: undefined }),
        mapping({ id: 'set-no-set', setId: 'unknown' }),
        mapping({ id: 'patch-no-patch', patchId: 'unknown' }),
      ],
      null,
      null
    );
    expect(result).toEqual({});
  });

  it('uses the explicit plugin path before the patch assignment path', () => {
    const result = resolveMappingsForPatch(
      [mapping({ pluginPath: 'C:/explicit.vst3' })],
      null,
      patch
    );
    expect(result['element-1'].pluginPath).toBe('C:/explicit.vst3');
  });
});

describe('materializeLayout', () => {
  const base = createLayout({
    elements: [createElement({ id: 'x', label: 'X', midiCommand: undefined })],
    background: 'bg.png',
    tempo: 100,
  });

  it('applies resolved mappings and uses the patch tempo', () => {
    const patch = createPreset({
      layout: createLayout({ tempo: 140 }),
      mappings: {
        x: { midiCommand: { type: 'cc', channel: 0, controllerNumber: 1 }, pluginId: 'p' },
      },
    });
    const result = materializeLayout(base, patch);
    expect(result.elements[0]).toMatchObject({
      id: 'x',
      label: 'X',
      pluginId: 'p',
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 1 },
    });
    expect(result.tempo).toBe(140);
    expect(result.background).toBe('bg.png');
  });

  it('keeps concert tempo when there is no patch tempo and uses a fallback layout', () => {
    expect(materializeLayout(base, null).tempo).toBe(100);
    const fallback = materializeLayout(null, createPreset({ layout: createLayout({ tempo: 90 }) }));
    expect(fallback.tempo).toBe(90);
    expect(fallback.elements).toEqual([]);
    expect(fallback.background).toBeNull();
  });

  it('does not mutate the concert layout', () => {
    const patch = createPreset({
      mappings: { x: { pluginId: 'p' } },
    });
    materializeLayout(base, patch);
    expect(base.elements[0].pluginId).toBeUndefined();
  });
});

describe('withoutLayoutGeometry', () => {
  it('stores mappings and strips element geometry from the patch layout', () => {
    const preset = createPreset({
      layout: createLayout({
        elements: [createElement({ id: 'x', pluginId: 'p', label: 'Control' })],
        tempo: 77,
        background: 'bg',
      }),
    });
    const result = withoutLayoutGeometry(preset);
    expect(result.mappings).toEqual({ x: { pluginId: 'p' } });
    expect(result.layout).toEqual({ elements: [], background: null, tempo: 77 });
    expect(preset.layout.elements).toHaveLength(1);
  });
});

describe('migrateConcertLayout', () => {
  it('keeps an existing concert layout and extracts mappings from patches', () => {
    const layout = createLayout({
      elements: [createElement({ id: 'x' })],
      tempo: 105,
    });
    const patch = createPreset({
      layout: createLayout({ elements: [createElement({ id: 'p', pluginId: 'p' })] }),
    });
    const result = migrateConcertLayout(layout, [patch]);
    expect(result.layout.elements).toHaveLength(1);
    expect(result.layout.elements[0].id).toBe('x');
    expect(result.patches[0].mappings).toEqual({ p: { pluginId: 'p' } });
  });

  it('preserves existing patch mappings when a concert layout already exists', () => {
    const patch = createPreset({ mappings: { existing: { pluginId: 'old' } } });
    const result = migrateConcertLayout(createLayout({ elements: [createElement()] }), [patch]);
    expect(result.patches[0].mappings).toEqual({ existing: { pluginId: 'old' } });
  });

  it('migrates the old per-patch layout into the largest patch layout', () => {
    const small = createPreset({
      id: 'small',
      layout: createLayout({ elements: [createElement({ id: 'small' })], tempo: 111 }),
    });
    const large = createPreset({
      id: 'large',
      layout: createLayout({
        elements: [createElement({ id: 'large-1' }), createElement({ id: 'large-2', pluginId: 'p' })],
        tempo: 133,
      }),
    });

    const result = migrateConcertLayout(null, [small, large]);
    expect(result.layout.elements.map((element) => element.id)).toEqual(['large-1', 'large-2']);
    expect(result.layout.tempo).toBe(133);
    expect(result.patches.map((patch) => patch.layout.elements)).toEqual([[], []]);
    expect(result.patches[0].layout.tempo).toBe(111);
    expect(result.patches[1].layout.tempo).toBe(133);
    expect(result.patches[1].mappings).toEqual({ 'large-2': { pluginId: 'p' } });
  });

  it('creates an empty layout when there are no patches', () => {
    const result = migrateConcertLayout(undefined, []);
    expect(result.layout).toEqual({ elements: [], background: null, tempo: 120 });
    expect(result.patches).toEqual([]);
  });

  it('assigns legacy group ids while migrating', () => {
    const patch = createPreset({
      layout: createLayout({
        elements: [
          createElement({ id: 'd1', type: 'drawbar', x: 0, y: 0, width: 20 }),
          createElement({ id: 'd2', type: 'drawbar', x: 24, y: 0, width: 20 }),
        ],
      }),
    });
    const result = migrateConcertLayout(null, [patch]);
    expect(result.layout.elements[0].groupId).toBeTruthy();
    expect(result.layout.elements[0].groupId).toBe(result.layout.elements[1].groupId);
  });
});
