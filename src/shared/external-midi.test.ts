import { describe, expect, it } from 'vitest';
import type { ExternalMidiConfig, ExternalMidiControl } from './external-midi';
import {
  DEFAULT_PROGRAM_DELAY_MS,
  MIDI_MAX_14BIT,
  buildCcMessages,
  buildControlMessages,
  buildExternalMidiLiveMessages,
  buildExternalMidiLoadSteps,
  buildNrpnMessages,
  buildProgramMessages,
  buildRpnMessages,
  buildSysexMessages,
  externalMidiControlRange,
  normalizeExternalMidiConfig,
} from './external-midi';

function control(overrides: Partial<ExternalMidiControl> = {}): ExternalMidiControl {
  return {
    id: 'cutoff',
    name: 'Cutoff',
    message: { type: 'cc', cc: 74 },
    ...overrides,
  };
}

function config(overrides: Partial<ExternalMidiConfig> = {}): ExternalMidiConfig {
  return {
    portName: 'MOTIF-RACK',
    channel: 0,
    ...overrides,
  };
}

describe('buildProgramMessages', () => {
  it('sends bank MSB, bank LSB and program change in order', () => {
    expect(buildProgramMessages({ bankMsb: 63, bankLsb: 0, pc: 12 }, 0)).toEqual([
      [0xb0, 0, 63],
      [0xb0, 32, 0],
      [0xc0, 12],
    ]);
  });

  it('uses the requested channel (0-based internally)', () => {
    expect(buildProgramMessages({ pc: 5 }, 1)).toEqual([[0xc1, 5]]);
  });

  it('omits bank messages that were not configured', () => {
    expect(buildProgramMessages({ pc: 7 }, 3)).toEqual([[0xc3, 7]]);
  });
});

describe('buildCcMessages', () => {
  it('builds a 7-bit control change', () => {
    expect(buildCcMessages(74, 80, 0)).toEqual([[0xb0, 74, 80]]);
  });

  it('clamps the channel', () => {
    expect(buildCcMessages(74, 80, 99)).toEqual([[0xbf, 74, 80]]);
    expect(buildCcMessages(74, 80, -3)).toEqual([[0xb0, 74, 80]]);
  });

  it('builds a 14-bit control change with CC and CC+32', () => {
    expect(buildCcMessages(74, 4660, 0, 14)).toEqual([
      [0xb0, 74, 36],
      [0xb0, 106, 52],
    ]);
  });

  it('rejects 14-bit controllers above 95', () => {
    expect(() => buildCcMessages(96, 0, 0, 14)).toThrow(/95/);
  });
});

describe('buildNrpnMessages and buildRpnMessages', () => {
  it('sends NRPN selection and a 7-bit value', () => {
    expect(buildNrpnMessages(1, 0, 100, 0)).toEqual([
      [0xb0, 99, 1],
      [0xb0, 98, 0],
      [0xb0, 6, 100],
    ]);
  });

  it('sends NRPN selection and a 14-bit value', () => {
    expect(buildNrpnMessages(1, 0, 4660, 0, 14)).toEqual([
      [0xb0, 99, 1],
      [0xb0, 98, 0],
      [0xb0, 6, 36],
      [0xb0, 38, 52],
    ]);
  });

  it('sends RPN selection and a value', () => {
    expect(buildRpnMessages(0, 0, 64, 0)).toEqual([
      [0xb0, 101, 0],
      [0xb0, 100, 0],
      [0xb0, 6, 64],
    ]);
  });
});

describe('buildSysexMessages', () => {
  it('replaces a 1-byte value in the template', () => {
    const template = [0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0xf7];
    expect(buildSysexMessages(template, 4, 1, 80)).toEqual([
      [0xf0, 0x43, 0x10, 0x4c, 80, 0x00, 0xf7],
    ]);
  });

  it('replaces a 2-byte value MSB first', () => {
    const template = [0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0xf7];
    expect(buildSysexMessages(template, 4, 2, 4660)).toEqual([
      [0xf0, 0x43, 0x10, 0x4c, 36, 52, 0xf7],
    ]);
  });

  it('requires F0 at the start and F7 at the end', () => {
    expect(() => buildSysexMessages([0x43, 0x00, 0xf7], 1, 1, 0)).toThrow(/F0/);
    expect(() => buildSysexMessages([0xf0, 0x00, 0x43], 1, 1, 0)).toThrow(/F7/);
  });

  it('rejects a value that does not fit the template', () => {
    expect(() => buildSysexMessages([0xf0, 0x00, 0xf7], 2, 1, 0)).toThrow(/cabe/);
  });
});

describe('control range and live messages', () => {
  it('maps the UI range to the MIDI range', () => {
    const cutoff = control({ min: 0, max: 100, default: 50 });
    expect(externalMidiControlRange(cutoff)).toMatchObject({
      min: 0,
      max: 100,
      default: 50,
      messageMax: 127,
    });
    expect(buildControlMessages(cutoff, 25, 0)).toEqual([[0xb0, 74, 32]]);
  });

  it('inverts the range when requested', () => {
    const cutoff = control({ min: 0, max: 100, default: 50, invert: true });
    expect(buildControlMessages(cutoff, 25, 0)).toEqual([[0xb0, 74, 95]]);
  });

  it('uses the message maximum as the default range', () => {
    expect(externalMidiControlRange(control())).toMatchObject({
      min: 0,
      max: 127,
      default: 0,
      messageMax: 127,
    });
    expect(
      externalMidiControlRange(control({ message: { type: 'cc', cc: 74, bits: 14 } }))
    ).toMatchObject({ max: MIDI_MAX_14BIT, messageMax: MIDI_MAX_14BIT });
    expect(
      externalMidiControlRange(
        control({ message: { type: 'sysex', template: [0xf0, 0, 0xf7], valueOffset: 1 } })
      )
    ).toMatchObject({ max: 127, messageMax: 127 });
  });

  it('sends only the requested control live', () => {
    const cfg = config({
      controls: [
        control({ id: 'cutoff', message: { type: 'cc', cc: 74 } }),
        control({ id: 'resonance', message: { type: 'cc', cc: 71 } }),
      ],
    });
    expect(buildExternalMidiLiveMessages(cfg, 'cutoff', 90)).toEqual([[0xb0, 74, 90]]);
  });

  it('returns nothing for missing, disabled or muted controls', () => {
    const cfg = config({ controls: [control({ sendOnChange: false })] });
    expect(buildExternalMidiLiveMessages(undefined, 'cutoff', 90)).toEqual([]);
    expect(buildExternalMidiLiveMessages(cfg, 'missing', 90)).toEqual([]);
    expect(buildExternalMidiLiveMessages(cfg, 'cutoff', 90)).toEqual([]);
  });
});

describe('buildExternalMidiLoadSteps', () => {
  it('returns no steps without an external timbre', () => {
    expect(buildExternalMidiLoadSteps(undefined)).toEqual([]);
    expect(buildExternalMidiLoadSteps(null)).toEqual([]);
    expect(buildExternalMidiLoadSteps(config({ enabled: false }))).toEqual([]);
    expect(buildExternalMidiLoadSteps(config({ portName: '   ' }))).toEqual([]);
  });

  it('orders reset, program, fixed messages and controls', () => {
    const cfg = config({
      program: { bankMsb: 63, bankLsb: 0, pc: 12 },
      resetMessages: [[0xb0, 121, 0]],
      loadMessages: [[0xb0, 7, 100]],
      controls: [
        control({ id: 'cutoff', message: { type: 'cc', cc: 74 }, default: 80 }),
        control({ id: 'resonance', message: { type: 'cc', cc: 71 }, default: 20 }),
      ],
    });

    const steps = buildExternalMidiLoadSteps(cfg);

    expect(steps.map((step) => step.bytes)).toEqual([
      [0xb0, 121, 0],
      [0xb0, 0, 63],
      [0xb0, 32, 0],
      [0xc0, 12],
      [0xb0, 7, 100],
      [0xb0, 74, 80],
      [0xb0, 71, 20],
    ]);
    expect(steps[3].delayMs).toBe(DEFAULT_PROGRAM_DELAY_MS);
    expect(steps[2].delayMs).toBeUndefined();
  });

  it('uses saved values before control defaults', () => {
    const cfg = config({
      controls: [control({ default: 20 })],
      values: { cutoff: 90 },
    });
    expect(buildExternalMidiLoadSteps(cfg)).toEqual([{ bytes: [0xb0, 74, 90] }]);
    expect(buildExternalMidiLoadSteps(cfg, { cutoff: 10 })).toEqual([{ bytes: [0xb0, 74, 10] }]);
  });

  it('skips controls with sendOnLoad false', () => {
    const cfg = config({
      controls: [control({ sendOnLoad: false, default: 80 })],
    });
    expect(buildExternalMidiLoadSteps(cfg)).toEqual([]);
  });

  it('does not delay when there is no Program Change', () => {
    const steps = buildExternalMidiLoadSteps(config({ program: { bankMsb: 1 } }));
    expect(steps).toEqual([{ bytes: [0xb0, 0, 1] }]);
    expect(steps[0].delayMs).toBeUndefined();
  });
});

describe('normalizeExternalMidiConfig', () => {
  it('returns undefined for absent or invalid configs', () => {
    expect(normalizeExternalMidiConfig(undefined)).toBeUndefined();
    expect(normalizeExternalMidiConfig(null)).toBeUndefined();
    expect(normalizeExternalMidiConfig({})).toBeUndefined();
    expect(normalizeExternalMidiConfig({ portName: '' })).toBeUndefined();
  });

  it('keeps a patch with only plugin fields unchanged', () => {
    expect(
      normalizeExternalMidiConfig({ pluginId: 'x', name: 'Piano', path: 'C:/x.dll' })
    ).toBeUndefined();
  });

  it('normalizes channel, program, controls, values and messages', () => {
    const normalized = normalizeExternalMidiConfig({
      portName: '  MOTIF-RACK  ',
      channel: 99,
      program: { bankMsb: 63, pc: 12 },
      controls: [
        {
          id: 'cutoff',
          name: '  Cutoff  ',
          message: { type: 'cc', cc: 74 },
          min: 0,
          max: 100,
          default: 200,
        },
        { id: 'broken', message: { type: 'cc' } },
      ],
      values: { cutoff: 50, broken: 10 },
      loadMessages: [[0xb0, 7, 100], [999]],
      resetMessages: [[0xb0, 121, 0]],
    });

    expect(normalized).toEqual({
      portName: 'MOTIF-RACK',
      channel: 15,
      program: { bankMsb: 63, pc: 12 },
      controls: [
        {
          id: 'cutoff',
          name: 'Cutoff',
          min: 0,
          max: 100,
          default: 100,
          message: { type: 'cc', cc: 74, bits: 7 },
        },
      ],
      values: { cutoff: 50 },
      loadMessages: [[0xb0, 7, 100]],
      resetMessages: [[0xb0, 121, 0]],
    });
  });

  it('preserves an explicitly disabled timbre', () => {
    expect(normalizeExternalMidiConfig({ portName: 'Dev', enabled: false, channel: 0 })).toEqual({
      portName: 'Dev',
      channel: 0,
      enabled: false,
    });
  });
});
