import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  CONCERT_FILE_EXTENSION,
  CONCERT_FILE_FORMAT,
  CONCERT_FILE_VERSION,
  DEFAULT_MIDI_CHANNEL,
  DEFAULT_PRESET_COUNT,
  DEFAULT_TEMPO,
  DEFAULT_TIME_SIGNATURE,
  MidiStatus,
  createMidiMessage,
  validateProgramNumber,
} from './constants';
import { VST_PRESET_CATEGORIES } from './vst-presets';

describe('shared constants', () => {
  it('exposes stable application defaults', () => {
    expect(APP_NAME).toBe('Preseter');
    expect(DEFAULT_PRESET_COUNT).toBe(128);
    expect(DEFAULT_MIDI_CHANNEL).toBe(0);
    expect(DEFAULT_TEMPO).toBe(120);
    expect(DEFAULT_TIME_SIGNATURE).toEqual({ numerator: 4, denominator: 4 });
    expect(CONCERT_FILE_FORMAT).toBe('preseter.concert');
    expect(CONCERT_FILE_VERSION).toBe(2);
    expect(CONCERT_FILE_EXTENSION).toBe('.preseter');
  });

  it('lists the MainStage preset categories in order', () => {
    expect(VST_PRESET_CATEGORIES[0]).toBe('Favoritos');
    expect(VST_PRESET_CATEGORIES[1]).toBe('Recentes');
    expect(VST_PRESET_CATEGORIES).toContain('Synth Pad');
    expect(VST_PRESET_CATEGORIES.at(-1)).toBe('Outros');
  });
});

describe('createMidiMessage', () => {
  it('combines status and channel and omits data2 when absent', () => {
    expect(createMidiMessage(MidiStatus.NoteOn, 0, 60, 100)).toEqual([0x90, 60, 100]);
    expect(createMidiMessage(MidiStatus.ProgramChange, 3, 12)).toEqual([0xc3, 12]);
    expect(createMidiMessage(MidiStatus.PitchBend, 15, 0, 127)).toEqual([0xef, 0, 127]);
  });

  it('does not clamp channel or data values here', () => {
    expect(createMidiMessage(MidiStatus.ControlChange, 1, 300, 400)).toEqual([
      0xb1,
      300,
      400,
    ]);
  });
});

describe('validateProgramNumber', () => {
  it('clamps to 0..127 and floors fractions', () => {
    expect(validateProgramNumber(-1)).toBe(0);
    expect(validateProgramNumber(0)).toBe(0);
    expect(validateProgramNumber(12.9)).toBe(12);
    expect(validateProgramNumber(127)).toBe(127);
    expect(validateProgramNumber(128)).toBe(127);
  });
});
