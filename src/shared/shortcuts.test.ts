import { describe, expect, it } from 'vitest';
import { normalizeShortcut, shortcutFromKeyboardEvent } from './shortcuts';

describe('shortcutFromKeyboardEvent', () => {
  it('returns null for modifier-only and empty keys', () => {
    for (const key of ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead', '']) {
      expect(shortcutFromKeyboardEvent({ key })).toBeNull();
    }
  });

  it('formats plain keys, uppercase letters and space', () => {
    expect(shortcutFromKeyboardEvent({ key: 'F5' })).toBe('F5');
    expect(shortcutFromKeyboardEvent({ key: 'a' })).toBe('A');
    expect(shortcutFromKeyboardEvent({ key: ' ' })).toBe('Space');
    expect(shortcutFromKeyboardEvent({ key: 'ArrowLeft' })).toBe('ArrowLeft');
  });

  it('adds modifiers in a stable order', () => {
    expect(
      shortcutFromKeyboardEvent({
        key: '1',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        metaKey: true,
      })
    ).toBe('Ctrl+Alt+Shift+Meta+1');
    expect(shortcutFromKeyboardEvent({ key: 'a', shiftKey: true })).toBe('Shift+A');
    expect(shortcutFromKeyboardEvent({ key: 'x', ctrlKey: false })).toBe('X');
  });
});

describe('normalizeShortcut', () => {
  it('trims saved shortcuts and treats missing values as empty', () => {
    expect(normalizeShortcut('  Ctrl+A  ')).toBe('Ctrl+A');
    expect(normalizeShortcut(undefined)).toBe('');
    expect(normalizeShortcut('')).toBe('');
  });
});
