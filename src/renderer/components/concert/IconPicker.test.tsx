import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconPicker } from './IconPicker';

describe('IconPicker', () => {
  it('abre a grade e escolhe um ícone SVG', () => {
    const onChange = vi.fn();
    render(<IconPicker value="piano" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Escolher ícone do patch' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar ícone' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ícone Bateria' }));
    expect(onChange).toHaveBeenCalledWith('drums');
    expect(screen.queryByRole('dialog', { name: 'Selecionar ícone' })).not.toBeInTheDocument();
  });

  it('permite nenhum e emoji personalizado', () => {
    const onChange = vi.fn();
    render(<IconPicker value="piano" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Escolher ícone do patch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nenhum' }));
    expect(onChange).toHaveBeenCalledWith('none');

    fireEvent.click(screen.getByRole('button', { name: 'Escolher ícone do patch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado…' }));
    fireEvent.change(screen.getByLabelText('Ícone personalizado'), { target: { value: '🎸' } });
    expect(onChange).toHaveBeenCalledWith('🎸');
  });

  it('fecha com Esc', () => {
    render(<IconPicker value="piano" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Escolher ícone do patch' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Selecionar ícone' })).not.toBeInTheDocument();
  });
});
