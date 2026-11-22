import { describe, expect, it } from 'vitest';
import type { Preset, PresetSet } from './types';
import { findShortcutConflict, reservedShortcutReason } from './shortcut-conflicts';

function patch (id: string, name: string, shortcut?: string): Preset {
  return {
    id,
    name,
    icon: 'piano',
    ...(shortcut ? { shortcut } : {}),
    setOrder: 0,
    programNumber: 0,
    midiChannel: 0,
    plugins: [],
    vstStates: {},
    layout: { elements: [], background: null, tempo: 120 },
    createdAt: 0,
    updatedAt: 0,
  };
}

function set (id: string, name: string, shortcut?: string): PresetSet {
  return {
    id,
    name,
    order: 0,
    ...(shortcut ? { shortcut } : {}),
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('reservedShortcutReason', () => {
  it('reserva as teclas globais do Perform e do app', () => {
    expect(reservedShortcutReason('Space')).toContain('panic');
    expect(reservedShortcutReason('Ctrl+Space')).toContain('panic');
    expect(reservedShortcutReason('F')).toContain('busca');
    expect(reservedShortcutReason('Ctrl+W')).toContain('fechar');
    expect(reservedShortcutReason('A')).toBeNull();
    expect(reservedShortcutReason('Shift+A')).toBeNull();
  });
});

describe('findShortcutConflict', () => {
  const presets = [patch('p1', 'Concert Grand', 'A'), patch('p2', 'Rhodes', 'B')];
  const sets = [set('s1', 'Música 1', '1'), set('s2', 'Música 2', '2')];

  it('encontra conflito com outro patch', () => {
    expect(findShortcutConflict('A', { presets, sets })).toMatchObject({
      kind: 'patch',
      target: 'Concert Grand',
    });
  });

  it('encontra conflito com outro grupo', () => {
    expect(findShortcutConflict('2', { presets, sets })).toMatchObject({
      kind: 'set',
      target: 'Música 2',
    });
  });

  it('ignora o próprio patch/set ao editar', () => {
    expect(findShortcutConflict('A', { patchId: 'p1', presets, sets })).toBeNull();
    expect(findShortcutConflict('1', { setId: 's1', presets, sets })).toBeNull();
  });

  it('avisa quando o atalho é reservado pelo app', () => {
    expect(findShortcutConflict('F', { presets, sets })).toMatchObject({
      kind: 'reserved',
    });
  });

  it('devolve null para atalho livre', () => {
    expect(findShortcutConflict('Shift+F5', { presets, sets })).toBeNull();
  });
});
