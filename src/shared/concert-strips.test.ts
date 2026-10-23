import { describe, expect, it } from 'vitest';
import type { ConcertStrip, PresetPluginAssignment, StripOverride } from './types';
import {
  DEFAULT_STRIP_MAX_NOTE,
  DEFAULT_STRIP_MAX_VELOCITY,
  DEFAULT_STRIP_MIN_NOTE,
  DEFAULT_STRIP_MIN_VELOCITY,
  DEFAULT_STRIP_OUTPUT,
  defaultSends,
  patchStripId,
  resolveStrips,
} from './concert-strips';
import { createInsert } from '../test/fixtures';

function strip(overrides: Partial<ConcertStrip> = {}): ConcertStrip {
  return {
    id: 'concert-strip',
    name: 'Concert Strip',
    pluginId: 'concert-plugin',
    path: 'C:/plugins/concert.vst3',
    role: 'instrument',
    ...overrides,
  };
}

function assignment(overrides: Partial<PresetPluginAssignment> = {}): PresetPluginAssignment {
  return {
    pluginId: 'patch-plugin',
    name: 'Patch Strip',
    path: 'C:/plugins/patch.vst3',
    role: 'instrument',
    ...overrides,
  };
}

describe('defaultSends', () => {
  it('returns four independent off sends', () => {
    const first = defaultSends();
    const second = defaultSends();
    expect(first).toEqual([-60, -60, -60, -60]);
    expect(first).not.toBe(second);
  });
});

describe('patchStripId', () => {
  it('uses a non-empty explicit layer id, trimmed', () => {
    expect(patchStripId('patch', assignment({ layerId: '  layer-x ' }), 3)).toBe('layer-x');
  });

  it('falls back to the patch and index when no layer id exists', () => {
    expect(patchStripId('patch-1', assignment(), 2)).toBe('patch-1:layer:2');
    expect(patchStripId('patch-1', assignment({ layerId: '   ' }), 4)).toBe('patch-1:layer:4');
  });
});

describe('resolveStrips', () => {
  it('orders patch strips first, then set, then concert and de-duplicates ids', () => {
    const result = resolveStrips({
      patchId: 'patch-1',
      patchStrips: [
        assignment({ name: 'A' }),
        assignment({ layerId: 'shared', name: 'B' }),
      ],
      setStrips: [strip({ id: 'shared', name: 'Set shared' }), strip({ id: 'set-only', name: 'Set only' })],
      concertStrips: [strip({ id: 'set-only', name: 'Concert duplicate' }), strip({ id: 'concert-only' })],
    });

    expect(result.map((item) => item.id)).toEqual([
      'patch-1:layer:0',
      'shared',
      'set-only',
      'concert-only',
    ]);
    expect(result.map((item) => item.level)).toEqual(['patch', 'patch', 'set', 'concert']);
    expect(result[2].name).toBe('Set only');
  });

  it('normalizes patch values and reports patch as the source', () => {
    const [result] = resolveStrips({
      patchId: 'p',
      patchStrips: [
        assignment({
          minNote: 200,
          maxNote: -10,
          velocityMin: 0,
          velocityMax: 999,
          output: 99,
          sends: [1, -100, undefined as unknown as number, 9],
          mix: { volumeDb: 20, pan: -9, muted: true, solo: true },
          inserts: [
            createInsert({ slot: 9, path: 'C:/a.vst3', name: '' }),
            createInsert({ slot: -3, path: '', name: 'invalid' }),
            createInsert({ slot: 1, path: 'C:/b.vst3', name: 'B', bypass: true }),
          ],
        }),
      ],
    });

    expect(result).toMatchObject({
      minNote: 0,
      maxNote: 127,
      velocityMin: 1,
      velocityMax: 127,
      output: 4,
      volumeDb: 6,
      pan: -1,
      muted: true,
      solo: true,
      sends: [1, -60, -60, 6],
    });
    expect(result.inserts).toEqual([
      expect.objectContaining({ slot: 1, name: 'B', bypass: true }),
      expect.objectContaining({
        slot: 3,
        name: 'Efeito',
        pluginId: 'insert-plugin',
        path: 'C:/a.vst3',
        bypass: false,
      }),
    ]);
    expect(result.sources.volumeDb).toBe('patch');
    expect(result.sources.inserts).toBe('patch');
    expect(Object.values(result.sources).every((level) => level === 'patch')).toBe(true);
  });

  it('uses defaults for an inherited strip without optional values', () => {
    const [result] = resolveStrips({ patchId: 'p', concertStrips: [strip()] });

    expect(result).toMatchObject({
      level: 'concert',
      volumeDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      minNote: DEFAULT_STRIP_MIN_NOTE,
      maxNote: DEFAULT_STRIP_MAX_NOTE,
      velocityMin: DEFAULT_STRIP_MIN_VELOCITY,
      velocityMax: DEFAULT_STRIP_MAX_VELOCITY,
      output: DEFAULT_STRIP_OUTPUT,
      sends: [-60, -60, -60, -60],
      inserts: [],
    });
    expect(result.name).toBe('Concert Strip');
  });

  it('falls back to a readable name and instrument role for inherited strips', () => {
    const [result] = resolveStrips({
      patchId: 'p',
      concertStrips: [strip({ name: '', role: 'bogus' as ConcertStrip['role'] })],
    });
    expect(result.name).toBe('Channel Strip');
    expect(result.role).toBe('instrument');
  });

  it('applies set and patch overrides to concert strips with patch winning', () => {
    const setOverrides: Record<string, StripOverride> = {
      'concert-strip': { volumeDb: -12, pan: 0.5, muted: true },
    };
    const patchOverrides: Record<string, StripOverride> = {
      'concert-strip': { volumeDb: 2, minNote: 40, maxNote: 20, output: 3 },
    };
    const [result] = resolveStrips({
      patchId: 'p',
      concertStrips: [strip()],
      setOverrides,
      patchOverrides,
    });

    expect(result.volumeDb).toBe(2);
    expect(result.pan).toBe(0.5);
    expect(result.muted).toBe(true);
    expect(result.minNote).toBe(40);
    expect(result.maxNote).toBe(40);
    expect(result.output).toBe(3);
    expect(result.sources.volumeDb).toBe('patch');
    expect(result.sources.pan).toBe('set');
    expect(result.sources.muted).toBe('set');
    expect(result.sources.minNote).toBe('patch');
    expect(result.sources.output).toBe('patch');
  });

  it('does not let a set override apply to a set-defined strip, but patch still can', () => {
    const [result] = resolveStrips({
      patchId: 'p',
      setStrips: [strip({ id: 'set-strip' })],
      setOverrides: { 'set-strip': { volumeDb: -20 } },
      patchOverrides: { 'set-strip': { pan: 0.25 } },
    });

    expect(result.volumeDb).toBe(0);
    expect(result.pan).toBe(0.25);
    expect(result.sources.volumeDb).toBe('set');
    expect(result.sources.pan).toBe('patch');
  });

  it('ignores overrides for unknown strips and invalid inherited entries', () => {
    const result = resolveStrips({
      patchId: 'p',
      concertStrips: [
        strip({ id: '' }),
        null as unknown as ConcertStrip,
        strip({ id: 'valid' }),
      ],
      patchOverrides: { missing: { volumeDb: -20 } },
    });
    expect(result.map((item) => item.id)).toEqual(['valid']);
  });
});
