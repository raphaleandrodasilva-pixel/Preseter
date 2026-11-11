import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useComputerKeyboardMidi } from './useComputerKeyboardMidi';

function setup(enabled = true) {
  const onNoteOn = vi.fn();
  const onNoteOff = vi.fn();
  const result = renderHook(
    ({ active }: { active: boolean }) =>
      useComputerKeyboardMidi({ enabled: active, onNoteOn, onNoteOff }),
    { initialProps: { active: enabled } }
  );
  return { ...result, onNoteOn, onNoteOff };
}

describe('useComputerKeyboardMidi', () => {
  it('plays the Ableton layout and releases the note', () => {
    const { onNoteOn, onNoteOff } = setup();

    fireEvent.keyDown(window, { key: 'a' });
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);

    fireEvent.keyUp(window, { key: 'a' });
    expect(onNoteOff).toHaveBeenCalledWith(60);

    fireEvent.keyDown(window, { key: 'f' });
    expect(onNoteOn).toHaveBeenLastCalledWith(65, 100);
  });

  it('changes the octave with Z/X', () => {
    const { onNoteOn } = setup();

    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(onNoteOn).toHaveBeenLastCalledWith(72, 100);
    fireEvent.keyUp(window, { key: 'a' });

    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(onNoteOn).toHaveBeenLastCalledWith(60, 100);
  });

  it('reserves 0–9, V and M for shortcuts', () => {
    const { onNoteOn } = setup();

    for (const key of ['0', '1', '9', 'v', 'm']) {
      fireEvent.keyDown(window, { key });
    }
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it('releases held notes when the mode is disabled', () => {
    const { onNoteOff, rerender } = setup();

    fireEvent.keyDown(window, { key: 'a' });
    rerender({ active: false });
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('does nothing while a modal is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const { onNoteOn } = setup();

    fireEvent.keyDown(window, { key: 'a' });
    expect(onNoteOn).not.toHaveBeenCalled();
    dialog.remove();
  });

  it('still plays when only a hidden modal is mounted', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.display = 'none';
    document.body.appendChild(dialog);
    const { onNoteOn } = setup();

    fireEvent.keyDown(window, { key: 'a' });
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);
    dialog.remove();
  });
});
