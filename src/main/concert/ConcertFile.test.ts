import { describe, expect, it } from 'vitest';
import {
  buildConcertFile,
  createDefaultBus,
  createDefaultBuses,
  createDefaultConcertSettings,
  createEmptyConcert,
  createEmptyConcertFile,
  createEmptyLayout,
  migrateLegacyConcert,
  parseConcertFile,
  serializeConcertFile,
} from './ConcertFile';
import {
  CONCERT_FILE_FORMAT,
  CONCERT_FILE_VERSION,
  DEFAULT_TEMPO,
} from '../../shared/constants';
import { createElement, createLayout, createPreset, createSet } from '../../test/fixtures';

describe('default concert construction', () => {
  it('creates buses with the expected enabled flags', () => {
    expect(createDefaultBus()).toEqual({
      volumeDb: 0,
      pan: 0,
      muted: false,
      output: 1,
      inserts: [],
      enabled: true,
    });
    expect(createDefaultBus(false).enabled).toBe(false);
    const buses = createDefaultBuses();
    expect(buses.aux).toHaveLength(4);
    expect(buses.outputs).toHaveLength(4);
    expect(buses.aux.every((bus) => bus.enabled === false)).toBe(true);
    expect(buses.outputs.every((bus) => bus.enabled === true)).toBe(true);
    expect(buses.aux[0]).not.toBe(buses.aux[1]);
  });

  it('creates default settings', () => {
    expect(createDefaultConcertSettings()).toMatchObject({
      timeSignature: { numerator: 4, denominator: 4 },
      midi: {
        cc7ControlsVolume: true,
        cc10ControlsPan: true,
        sendUnassignedMidiToStrips: false,
        transpose: 0,
        programChange: { device: '', channel: null },
        sendUnusedProgramChangeToStrips: false,
      },
      channelStrips: { panLaw: -3, panLawCompensated: false },
      metronome: { enabled: false, volumeDb: -12, accentFirstBeat: true },
      notes: '',
    });
  });

  it('creates empty layouts and concerts with overridable name and tempo', () => {
    expect(createEmptyLayout()).toEqual({ elements: [], background: null, tempo: 120 });
    expect(createEmptyLayout(90).tempo).toBe(90);
    const concert = createEmptyConcert('Show', 88);
    expect(concert).toMatchObject({ name: 'Show', tempo: 88, strips: [] });
    expect(concert.id).toMatch(/^concert_/);
    expect(concert.createdAt).toBeGreaterThan(0);
    expect(concert.updatedAt).toBe(concert.createdAt);
  });

  it('creates a new concert file with a default keyboard layout', () => {
    const file = createEmptyConcertFile('Novo', 100);
    expect(file.format).toBe(CONCERT_FILE_FORMAT);
    expect(file.version).toBe(CONCERT_FILE_VERSION);
    expect(file.concert.name).toBe('Novo');
    expect(file.layout.tempo).toBe(100);
    expect(file.layout.elements.map((element) => element.type)).toEqual([
      'keyboard',
      'pedal',
      'pedal',
      'pedal',
    ]);
    expect(file.sets).toEqual([]);
    expect(file.patches).toEqual([]);
    expect(file.mappings).toEqual([]);
  });
});

describe('buildConcertFile and serialization', () => {
  it('stamps the format, version and current update time', () => {
    const concert = createEmptyConcert('Built');
    const sets = [createSet()];
    const patches = [createPreset()];
    const layout = createLayout();
    const mappings = [
      { id: 'm', source: { type: 'cc' as const, channel: 0, controllerNumber: 1 } },
    ];
    const file = buildConcertFile({ concert, sets, patches, layout, mappings });

    expect(file.format).toBe(CONCERT_FILE_FORMAT);
    expect(file.version).toBe(CONCERT_FILE_VERSION);
    expect(file.concert.name).toBe('Built');
    expect(file.concert.updatedAt).toBeGreaterThanOrEqual(concert.updatedAt);
    expect(file.sets).toBe(sets);
    expect(file.patches).toBe(patches);
    expect(file.layout).toBe(layout);
    expect(file.mappings).toBe(mappings);
  });

  it('serializes readable JSON with a trailing newline', () => {
    const file = createEmptyConcertFile();
    const text = serializeConcertFile(file);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "format"');
    expect(JSON.parse(text)).toEqual(file);
  });
});

describe('parseConcertFile', () => {
  it('parses a minimal valid file and fills defaults', () => {
    const parsed = parseConcertFile(
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: { name: '  Concerto  ' },
      })
    );

    expect(parsed.concert.name).toBe('Concerto');
    expect(parsed.concert.tempo).toBe(DEFAULT_TEMPO);
    expect(parsed.concert.id).toMatch(/^concert_/);
    expect(parsed.sets).toEqual([]);
    expect(parsed.patches).toEqual([]);
    expect(parsed.layout).toEqual({ elements: [], background: null, tempo: 120 });
    expect(parsed.mappings).toEqual([]);
    expect(parsed.concert.settings).toEqual(createDefaultConcertSettings());
  });

  it('accepts version 1 and normalizes optional collections', () => {
    const parsed = parseConcertFile(
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 1,
        concert: { id: 'c1', name: 'Old', tempo: 0, settings: null },
        sets: [createSet()],
        patches: [createPreset()],
        layout: { elements: [createElement(), null, 5], background: 3, tempo: -1 },
        mappings: [{ id: 'm', source: { type: 'cc', channel: 0, controllerNumber: 1 } }],
      })
    );

    expect(parsed.version).toBe(1);
    expect(parsed.concert.tempo).toBe(120);
    expect(parsed.concert.settings).toEqual(createDefaultConcertSettings());
    expect(parsed.layout.elements).toHaveLength(1);
    expect(parsed.layout.background).toBeNull();
    expect(parsed.layout.tempo).toBe(120);
  });

  it('normalizes settings and buses, clamping invalid values', () => {
    const parsed = parseConcertFile(
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: {
          name: 'Settings',
          settings: {
            timeSignature: { numerator: 0, denominator: 8 },
            midi: {
              cc7ControlsVolume: false,
              transpose: 2.7,
              programChange: { device: 'Device', channel: 99 },
            },
            channelStrips: { panLaw: -99, panLawCompensated: true },
            metronome: { enabled: true, volumeDb: -18, accentFirstBeat: false },
            buses: {
              aux: [{ volumeDb: 999, pan: 9, muted: true, output: 99, inserts: [{}], enabled: true }],
              outputs: [],
            },
            notes: 'Notas',
          },
        },
      })
    );

    const settings = parsed.concert.settings;
    expect(settings.timeSignature).toEqual({ numerator: 4, denominator: 8 });
    expect(settings.midi.cc7ControlsVolume).toBe(false);
    expect(settings.midi.transpose).toBe(3);
    expect(settings.midi.programChange).toEqual({ device: 'Device', channel: null });
    expect(settings.channelStrips).toEqual({ panLaw: -3, panLawCompensated: true });
    expect(settings.metronome).toEqual({ enabled: true, volumeDb: -18, accentFirstBeat: false });
    expect(settings.notes).toBe('Notas');
    expect(settings.buses.aux[0]).toMatchObject({
      volumeDb: 0,
      pan: 1,
      muted: true,
      output: 4,
      inserts: [{}],
      enabled: true,
    });
    expect(settings.buses.outputs).toHaveLength(4);
    expect(settings.buses.outputs[0].enabled).toBe(true);
  });

  it('migrates the old per-patch layout format', () => {
    const parsed = parseConcertFile(
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 1,
        concert: { name: 'Legacy' },
        patches: [
          createPreset({
            id: 'p1',
            layout: createLayout({
              elements: [createElement({ id: 'x', pluginId: 'plugin' })],
              tempo: 90,
            }),
          }),
        ],
      })
    );

    expect(parsed.layout.elements.map((element) => element.id)).toEqual(['x']);
    expect(parsed.layout.tempo).toBe(90);
    expect(parsed.patches[0].mappings).toEqual({ x: { pluginId: 'plugin' } });
    expect(parsed.patches[0].layout).toEqual({ elements: [], background: null, tempo: 90 });
  });

  it('discards concert and set strips as documented', () => {
    const parsed = parseConcertFile(
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: {
          name: 'Strips',
          strips: [{ id: 'c', name: 'Concert', pluginId: 'p', path: 'p', role: 'instrument' }],
        },
        sets: [
          createSet({
            strips: [{ id: 's', name: 'Set', pluginId: 'p', path: 'p', role: 'instrument' }],
            stripOverrides: { c: { volumeDb: -12 } },
          }),
        ],
      })
    );

    expect(parsed.concert.strips).toEqual([]);
    expect(parsed.sets[0].strips).toEqual([]);
    expect(parsed.sets[0].stripOverrides).toEqual({});
  });

  it.each([
    ['invalid JSON', '{', /JSON/],
    ['a JSON primitive', '42', /objeto/],
    ['a non-concert format', JSON.stringify({ format: 'other', version: 1 }), /concert/],
    ['a missing version', JSON.stringify({ format: CONCERT_FILE_FORMAT }), /vers/],
    ['a fractional version', JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 1.5 }), /vers/],
    ['a zero version', JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 0 }), /vers/],
    [
      'a future version',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: CONCERT_FILE_VERSION + 1 }),
      /vers.*nova/,
    ],
    [
      'a missing concert',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2 }),
      /concert/,
    ],
    [
      'a blank concert name',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2, concert: { name: '  ' } }),
      /nome/,
    ],
    [
      'invalid sets',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2, concert: { name: 'x' }, sets: 'no' }),
      '"sets"',
    ],
    [
      'invalid patches',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2, concert: { name: 'x' }, patches: [1] }),
      '"patches"',
    ],
    [
      'invalid mappings',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2, concert: { name: 'x' }, mappings: [null] }),
      '"mappings"',
    ],
    [
      'invalid layout',
      JSON.stringify({ format: CONCERT_FILE_FORMAT, version: 2, concert: { name: 'x' }, layout: 3 }),
      'layout',
    ],
    [
      'invalid set strips',
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: { name: 'x' },
        sets: [{ id: 's', name: 'S', order: 0, strips: [1] }],
      }),
      'sets[].strips',
    ],
    [
      'invalid strip overrides',
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: { name: 'x' },
        sets: [{ id: 's', name: 'S', order: 0, stripOverrides: { a: 1 } }],
      }),
      'channel strip',
    ],
    [
      'a non-object strip overrides map',
      JSON.stringify({
        format: CONCERT_FILE_FORMAT,
        version: 2,
        concert: { name: 'x' },
        sets: [{ id: 's', name: 'S', order: 0, stripOverrides: [] }],
      }),
      'stripOverrides',
    ],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseConcertFile(text as string)).toThrow(message as RegExp);
  });
});

describe('migrateLegacyConcert', () => {
  it('turns loose presets and sets into a concert file', () => {
    const preset = createPreset({
      id: 'p1',
      layout: createLayout({ elements: [createElement({ id: 'x', pluginId: 'p' })] }),
    });
    const set = createSet({
      strips: [{ id: 's', name: 'S', pluginId: 'p', path: 'p', role: 'instrument' }],
      stripOverrides: { s: { volumeDb: -3 } },
    });
    const file = migrateLegacyConcert({
      presets: [preset],
      sets: [set],
      concertName: '  Legado  ',
      tempo: 77,
    });

    expect(file.format).toBe(CONCERT_FILE_FORMAT);
    expect(file.version).toBe(CONCERT_FILE_VERSION);
    expect(file.concert.name).toBe('Legado');
    expect(file.concert.tempo).toBe(77);
    expect(file.sets[0].strips).toEqual([]);
    expect(file.sets[0].stripOverrides).toEqual({});
    expect(file.layout.elements[0].id).toBe('x');
    expect(file.patches[0].mappings).toEqual({ x: { pluginId: 'p' } });
  });

  it('uses a default name and tempo for empty input', () => {
    const file = migrateLegacyConcert({ presets: [] });
    expect(file.concert.name).toBe('Meu Concert');
    expect(file.concert.tempo).toBe(120);
    expect(file.layout).toEqual({ elements: [], background: null, tempo: 120 });
  });
});
