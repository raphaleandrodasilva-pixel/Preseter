import { describe, expect, it } from 'vitest';
import type { Preset } from './types';
import { firstPlayablePreset } from './concert-navigation';

function patch (id: string, programNumber: number, skipped = false): Preset {
  return {
    id,
    name: id,
    icon: 'piano',
    programNumber,
    setOrder: 0,
    midiChannel: 0,
    plugins: [],
    vstStates: {},
    layout: { elements: [], background: null, tempo: 120 },
    ...(skipped ? { skipped: true } : {}),
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('firstPlayablePreset', () => {
  it('escolhe o menor programa e ignora patches pulados', () => {
    const result = firstPlayablePreset([
      patch('terceiro', 3),
      patch('pulado', 1, true),
      patch('primeiro', 2),
    ]);
    expect(result?.id).toBe('primeiro');
  });

  it('usa o primeiro patch quando todos estão pulados', () => {
    const result = firstPlayablePreset([patch('b', 2, true), patch('a', 1, true)]);
    expect(result?.id).toBe('a');
  });

  it('devolve undefined para concert sem patches', () => {
    expect(firstPlayablePreset([])).toBeUndefined();
  });
});
