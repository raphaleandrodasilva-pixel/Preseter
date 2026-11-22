import { describe, expect, it } from 'vitest';
import type { Preset, PresetSet } from './types';
import { groupPatchesBySet } from './patch-groups';

function patch (id: string, name: string, setId: string | undefined, setOrder: number, program: number): Preset {
  return {
    id,
    name,
    icon: 'piano',
    ...(setId ? { setId } : {}),
    setOrder,
    programNumber: program,
    midiChannel: 0,
    plugins: [],
    vstStates: {},
    layout: { elements: [], background: null, tempo: 120 },
    createdAt: 0,
    updatedAt: 0,
  };
}

function set (id: string, name: string, order: number): PresetSet {
  return { id, name, order, expanded: true };
}

describe('groupPatchesBySet', () => {
  it('agrupa na ordem dos sets e dos patches', () => {
    const sets = [set('s2', 'Organs', 1), set('s1', 'Pianos & Keys', 0)];
    const groups = groupPatchesBySet([
      patch('p4', 'Hammond Jazz', 's2', 0, 8),
      patch('p2', 'Soft Grand', 's1', 1, 1),
      patch('p1', 'Concert Grand', 's1', 0, 0),
      patch('p3', 'Hammond Gospel', 's2', 1, 9),
    ], sets);

    expect(groups.map((group) => group.name)).toEqual(['Pianos & Keys', 'Organs']);
    expect(groups[0].patches.map((item) => item.name)).toEqual(['Concert Grand', 'Soft Grand']);
    expect(groups[1].patches.map((item) => item.name)).toEqual(['Hammond Jazz', 'Hammond Gospel']);
  });

  it('coloca patches sem set no fim, num grupo próprio', () => {
    const groups = groupPatchesBySet([
      patch('p2', 'Solto', undefined, 0, 1),
      patch('p1', 'Com set', 's1', 0, 0),
    ], [set('s1', 'Pianos', 0)]);

    expect(groups.map((group) => group.name)).toEqual(['Pianos', 'Sem set']);
    expect(groups[1].key).toBe('__none');
    expect(groups[1].patches.map((item) => item.name)).toEqual(['Solto']);
  });

  it('mantém só os patches filtrados nos grupos', () => {
    const sets = [set('s1', 'Pianos', 0), set('s2', 'Organs', 1)];
    const groups = groupPatchesBySet([
      patch('p1', 'Concert Grand', 's1', 0, 0),
      patch('p2', 'Hammond Jazz', 's2', 0, 1),
    ].filter((item) => item.name.includes('Grand')), sets);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Pianos');
    expect(groups[0].patches).toHaveLength(1);
  });
});
