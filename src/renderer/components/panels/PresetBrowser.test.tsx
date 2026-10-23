import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresetBrowser } from './PresetBrowser';
import { createPreset } from '../../../test/fixtures';

function props(overrides: Partial<React.ComponentProps<typeof PresetBrowser>> = {}) {
  const presets = [
    createPreset({ id: 'b', name: 'Beta', programNumber: 20, midiChannel: 1 }),
    createPreset({ id: 'a', name: 'Alpha', programNumber: 3, midiChannel: 0 }),
  ];
  return {
    isOpen: true,
    onToggle: vi.fn(),
    presets,
    currentPresetId: 'a',
    currentProgram: 3,
    onLoadPreset: vi.fn(async () => true),
    onDeletePreset: vi.fn(async () => true),
    onCreatePreset: vi.fn(() => createPreset({ id: 'new', name: 'New' })),
    onSavePreset: vi.fn(async () => true),
    onProgramChange: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PresetBrowser', () => {
  it('renders a launch button when closed', () => {
    const p = props({ isOpen: false });
    render(<PresetBrowser {...p} />);
    fireEvent.click(screen.getByTitle('Painel de Presets'));
    expect(p.onToggle).toHaveBeenCalled();
    expect(screen.queryByText('Novo Preset')).not.toBeInTheDocument();
  });

  it('sorts presets, highlights the current one and quick-loads', async () => {
    const p = props();
    const { container } = render(<PresetBrowser {...p} />);
    expect(screen.getByText('Presets Salvos (2)')).toBeInTheDocument();
    const names = [...container.querySelectorAll('.truncate .text-sm')].map(
      (node) => node.textContent
    );
    expect(names).toEqual(['Alpha', 'Beta']);
    expect(screen.getByText('PRG 003 • Ch 0')).toBeInTheDocument();
    expect(screen.getByText('003')).toBeInTheDocument();
    expect(container.querySelector('.ring-blue-500')).toHaveTextContent('Alpha');

    fireEvent.click(screen.getByText('Beta'));
    await waitFor(() => expect(p.onLoadPreset).toHaveBeenCalledWith('b'));
    expect(p.onProgramChange).toHaveBeenCalledWith(20, 1);
  });

  it('loads and deletes from row actions without quick-loading', async () => {
    const p = props();
    const { container } = render(<PresetBrowser {...p} />);
    const beta = screen.getByText('Beta').closest('div.p-2')!;
    const [load, remove] = beta.querySelectorAll('button');

    fireEvent.click(load);
    await waitFor(() => expect(p.onLoadPreset).toHaveBeenCalledWith('b'));
    expect(p.onProgramChange).not.toHaveBeenCalled();

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(remove);
    expect(confirm).toHaveBeenCalledWith('Deletar "Beta"?');
    expect(p.onDeletePreset).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(remove);
    await waitFor(() => expect(p.onDeletePreset).toHaveBeenCalledWith('b'));
    expect(container).toBeInTheDocument();
  });

  it('creates a preset from the form and clears it', async () => {
    const p = props();
    render(<PresetBrowser {...p} />);
    const create = screen.getByText('Criar e Salvar');
    expect(create).toBeDisabled();

    const name = screen.getByPlaceholderText('Nome do preset');
    fireEvent.change(name, { target: { value: '  Lead  ' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
    expect(create).toBeEnabled();
    fireEvent.click(create);

    expect(p.onCreatePreset).toHaveBeenCalledWith('  Lead  ', 12);
    expect(p.onSavePreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new' })
    );
    expect(name).toHaveValue('');
    expect(screen.getByRole('spinbutton')).toHaveValue(0);
  });

  it('creates with Enter and ignores Enter without a name', () => {
    const p = props();
    render(<PresetBrowser {...p} />);
    const name = screen.getByPlaceholderText('Nome do preset');
    fireEvent.keyPress(name, { key: 'Enter' });
    expect(p.onCreatePreset).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'Pad' } });
    fireEvent.keyPress(name, { key: 'Enter', charCode: 13 });
    expect(p.onCreatePreset).toHaveBeenCalledWith('Pad', 0);
  });

  it('shows an empty library and closes the panel', () => {
    const p = props({ presets: [] });
    render(<PresetBrowser {...p} />);
    expect(screen.getByText('Nenhum preset salvo')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Fechar painel'));
    expect(p.onToggle).toHaveBeenCalled();
  });
});
