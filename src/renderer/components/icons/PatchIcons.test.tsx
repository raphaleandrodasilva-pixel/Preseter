import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PatchIcon } from './PatchIcons';

describe('PatchIcon', () => {
  it('renderiza IDs novos como SVG de linha', () => {
    const { container } = render(<PatchIcon icon="piano" title="Piano" />);
    const span = container.querySelector('[data-patch-icon="piano"]');
    expect(span).toBeInTheDocument();
    expect(span?.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Piano' })).toBeInTheDocument();
  });

  it('mantém emojis antigos como texto', () => {
    render(<PatchIcon icon="🎸" />);
    expect(screen.getByText('🎸')).toBeInTheDocument();
  });

  it('usa genérico quando o ícone está vazio', () => {
    const { container } = render(<PatchIcon />);
    expect(container.querySelector('[data-patch-icon="generic"]')).toBeInTheDocument();
  });

  it('não desenha nada para "none"', () => {
    const { container } = render(<PatchIcon icon="none" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
