import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PatchLibraryModal } from './PatchLibraryModal';
import { createPreset, createSet } from '../../../test/fixtures';

function setup(overrides: Partial<React.ComponentProps<typeof PatchLibraryModal>> = {}) {
  const presets = [
    createPreset({ id: 'b', name: 'Beta', programNumber: 20, category: 'Pad', setId: 'set-1' }),
    createPreset({ id: 'a', name: 'Alpha', programNumber: 2, icon: '🎸' }),
  ];
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <PatchLibraryModal
      presets={presets}
      sets={[createSet({ id: 'set-1', name: 'Set One' })]}
      currentPresetId="a"
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />
  );
  return { ...result, presets, onSelect, onClose };
}

describe('PatchLibraryModal', () => {
  it('lists patches sorted with set, category and icon metadata', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Patch Library' })).toBeInTheDocument();
    expect(screen.getByText('2 patch(es)')).toBeInTheDocument();
    expect(screen.getByText('003')).toBeInTheDocument();
    expect(screen.getByText('021')).toBeInTheDocument();
    expect(screen.getByText('🎸')).toBeInTheDocument();
    expect(screen.getByText('📁 Set One')).toBeInTheDocument();
    expect(screen.getByText('Pad')).toBeInTheDocument();
    expect(screen.getByText('Sem set')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar patch/)).toHaveFocus();
  });

  it('filters by name, set, category and program number', () => {
    setup();
    const input = screen.getByPlaceholderText(/Buscar patch/);

    fireEvent.change(input, { target: { value: 'set one' } });
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'pad' } });
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '3' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'nothing here' } });
    expect(screen.getByText('Nenhum patch encontrado.')).toBeInTheDocument();
  });

  it('selects a patch and closes, or chooses the first result with Enter', () => {
    const { presets, onSelect, onClose } = setup();
    fireEvent.click(screen.getByText('Alpha'));
    expect(onSelect).toHaveBeenCalledWith(presets[1]);
    expect(onClose).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText(/Buscar patch/);
    fireEvent.change(input, { target: { value: 'Beta' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(presets[0]);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('closes from the modal shell and ignores Enter without results', () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Buscar patch/), {
      target: { value: 'missing' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/Buscar patch/), { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Fechar (Esc)'));
    expect(onClose).toHaveBeenCalled();
  });
});
