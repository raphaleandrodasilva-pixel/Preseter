import { describe, expect, it } from 'vitest';
import type { ConcertStrip, Preset, StripAttribute, StripOverride } from './types';
import {
  clearOverride,
  effectiveSource,
  isMasked,
  maskedAttributes,
  replaceStrip,
  stripLevelViews,
  stripTargets,
  viewAt,
  withOverride,
  withStripValue,
} from './strip-levels';
import { createPreset } from '../test/fixtures';

function strip(overrides: Partial<ConcertStrip> = {}): ConcertStrip {
  return {
    id: 'strip-1',
    name: 'Strip',
    pluginId: 'plugin-1',
    path: 'C:/plugin.vst3',
    role: 'instrument',
    mix: { volumeDb: -6, pan: 0, muted: false, solo: false },
    ...overrides,
  };
}

function preset(overrides: Partial<Preset> = {}): Preset {
  return createPreset({
    id: 'patch-1',
    plugins: [
      {
        pluginId: 'patch-plugin',
        name: 'Patch layer',
        path: 'C:/patch.vst3',
        role: 'instrument',
      },
    ],
    ...overrides,
  });
}

describe('stripLevelViews', () => {
  it('resolves concert, set and patch views independently', () => {
    const concertStrips = [strip({ id: 'concert', mix: { volumeDb: -12, pan: 0, muted: false, solo: false } })];
    const setStrips = [strip({ id: 'set', mix: { volumeDb: -3, pan: 0.2, muted: false, solo: false } })];
    const views = stripLevelViews({
      concertStrips,
      setStrips,
      setOverrides: { concert: { volumeDb: -20 } },
      patch: preset({ plugins: [{ pluginId: 'p', name: 'P', path: 'p', role: 'instrument' }] }),
    });

    expect(views.concert.map((item) => item.id)).toEqual(['concert']);
    expect(views.concert[0].volumeDb).toBe(-12);
    expect(views.set.map((item) => item.id)).toEqual(['set', 'concert']);
    expect(views.set[1].volumeDb).toBe(-20);
    expect(views.patch.map((item) => item.id)).toEqual(['patch-1:layer:0', 'set', 'concert']);
    expect(views.patch[0].level).toBe('patch');
  });

  it('uses empty ids and no patch when optional inputs are absent', () => {
    const views = stripLevelViews({});
    expect(views.concert).toEqual([]);
    expect(views.set).toEqual([]);
    expect(views.patch).toEqual([]);
  });
});

describe('stripTargets', () => {
  it('allows overrides only at more specific levels', () => {
    expect(stripTargets('concert')).toEqual(['patch', 'set', 'concert']);
    expect(stripTargets('set')).toEqual(['patch', 'set']);
    expect(stripTargets('patch')).toEqual(['patch']);
  });
});

describe('viewAt', () => {
  it('finds the strip in the requested level', () => {
    const views = stripLevelViews({ concertStrips: [strip({ id: 'x' })] });
    expect(viewAt(views, 'concert', 'x')?.id).toBe('x');
    expect(viewAt(views, 'concert', 'missing')).toBeUndefined();
    expect(viewAt(views, 'patch', 'x')?.id).toBe('x');
  });
});

describe('masking', () => {
  const full = {
    ...strip({ id: 'x' }),
    level: 'concert' as const,
    volumeDb: -20,
    pan: 0,
    muted: false,
    solo: false,
    minNote: 0,
    maxNote: 127,
    velocityMin: 1,
    velocityMax: 127,
    output: 1,
    sends: [-60, -60, -60, -60],
    inserts: [],
    sources: { volumeDb: 'patch' as const, pan: 'set' as const, muted: 'concert' as const },
  };

  it('reports the effective source and masks only more specific levels', () => {
    expect(effectiveSource(full, 'volumeDb')).toBe('patch');
    expect(effectiveSource(undefined, 'volumeDb')).toBeUndefined();
    expect(isMasked(full, 'set', 'volumeDb')).toBe(true);
    expect(isMasked(full, 'concert', 'volumeDb')).toBe(true);
    expect(isMasked(full, 'patch', 'volumeDb')).toBe(false);
    expect(isMasked(full, 'concert', 'pan')).toBe(true);
    expect(isMasked(full, 'concert', 'muted')).toBe(false);
    expect(isMasked(full, 'set', 'muted')).toBe(false);
  });

  it('filters attributes by the requested order', () => {
    const attrs: StripAttribute[] = ['pan', 'volumeDb', 'muted'];
    expect(maskedAttributes(full, 'concert', attrs)).toEqual(['pan', 'volumeDb']);
    expect(maskedAttributes(undefined, 'concert', attrs)).toEqual([]);
  });
});

describe('withOverride', () => {
  it('creates and merges immutable override maps', () => {
    const first = withOverride(undefined, 'strip-1', 'volumeDb', -3);
    expect(first).toEqual({ 'strip-1': { volumeDb: -3 } });
    const second = withOverride(first, 'strip-1', 'pan', 0.5);
    expect(second).toEqual({ 'strip-1': { volumeDb: -3, pan: 0.5 } });
    expect(first).toEqual({ 'strip-1': { volumeDb: -3 } });
    const other = withOverride(second, 'strip-2', 'muted', true);
    expect(other).toEqual({
      'strip-1': { volumeDb: -3, pan: 0.5 },
      'strip-2': { muted: true },
    });
  });
});

describe('clearOverride', () => {
  it('returns an empty object when there are no overrides', () => {
    expect(clearOverride(undefined, 'x', 'volumeDb')).toEqual({});
  });

  it('keeps unrelated attributes and removes empty strip entries', () => {
    const overrides: Record<string, StripOverride> = {
      x: { volumeDb: -3, pan: 0.5 },
      y: { muted: true },
    };
    expect(clearOverride(overrides, 'x', 'volumeDb')).toEqual({
      x: { pan: 0.5 },
      y: { muted: true },
    });
    expect(clearOverride(overrides, 'y', 'muted')).toEqual({ x: { volumeDb: -3, pan: 0.5 } });
    expect(clearOverride(overrides, 'x', 'solo')).toBe(overrides);
  });
});

describe('withStripValue', () => {
  it('writes mix attributes while preserving the rest of the mix', () => {
    const base = strip({ mix: { volumeDb: -6, pan: 0.1, muted: true, solo: true } });
    expect(withStripValue(base, 'volumeDb', -12).mix).toEqual({
      volumeDb: -12,
      pan: 0.1,
      muted: true,
      solo: true,
    });
    expect(withStripValue(base, 'pan', -0.5).mix?.pan).toBe(-0.5);
    expect(withStripValue(base, 'muted', false).mix?.muted).toBe(false);
    expect(withStripValue(base, 'solo', false).mix?.solo).toBe(false);
  });

  it('writes top-level strip attributes', () => {
    const base = strip();
    expect(withStripValue(base, 'minNote', 12).minNote).toBe(12);
    expect(withStripValue(base, 'maxNote', 100).maxNote).toBe(100);
    expect(withStripValue(base, 'velocityMin', 2).velocityMin).toBe(2);
    expect(withStripValue(base, 'velocityMax', 120).velocityMax).toBe(120);
    expect(withStripValue(base, 'output', 3).output).toBe(3);
    expect(withStripValue(base, 'sends', [1, 2, 3, 4]).sends).toEqual([1, 2, 3, 4]);
    const inserts = [{ slot: 0, pluginId: 'p', name: 'P', path: 'C:/p', bypass: false }];
    expect(withStripValue(base, 'inserts', inserts).inserts).toEqual(inserts);
    expect(withStripValue(base, 'inserts', inserts)).not.toBe(base);
  });

  it('returns the strip unchanged for an unknown attribute', () => {
    const base = strip();
    expect(withStripValue(base, 'unknown' as StripAttribute, 1)).toBe(base);
  });
});

describe('replaceStrip', () => {
  it('replaces by id and leaves unknown lists otherwise unchanged', () => {
    const a = strip({ id: 'a', name: 'A' });
    const b = strip({ id: 'b', name: 'B' });
    const next = { ...a, name: 'A2' };
    expect(replaceStrip([a, b], next)).toEqual([next, b]);
    expect(replaceStrip([a, b], { ...a, id: 'missing' })).toEqual([a, b]);
  });
});
