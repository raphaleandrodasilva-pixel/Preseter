import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

function setup(value = -12, min = -60, max = 0) {
  const onCommit = vi.fn();
  render(
    <label>
      Volume
      <NumberField value={value} min={min} max={max} onCommit={onCommit} />
    </label>
  );
  return { input: screen.getByLabelText('Volume') as HTMLInputElement, onCommit };
}

describe('NumberField', () => {
  it('aceita sinal negativo e só aplica no blur', () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '-18' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(-18);
  });

  it('aplica o limite ao sair e restaura valor vazio', () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(0);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('0');
  });

  it('confirma com Enter', () => {
    const { input, onCommit } = setup(-12, 20, 300);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '140' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(140);
  });
});
