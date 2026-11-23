import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryInspection } from '@shared/library/format';
import { AppProvider } from '../../context/AppContext';
import { createConcertState } from '../../../test/fixtures';
import { LibraryGeneratorModal } from './LibraryGeneratorModal';

const inspection = (patch: Partial<LibraryInspection> = {}): LibraryInspection => ({
  source: 'factory-40',
  id: 'factory-40',
  name: 'Factory 40',
  concerts: [{ id: 'factory-40', name: 'Factory 40', sets: 8, patches: 40, ready: 40 }],
  total: 40,
  ready: 40,
  skipped: [],
  missing: [],
  missingIds: [],
  ...patch,
});

const renderModal = (onClose = vi.fn()) => render(
  <AppProvider>
    <LibraryGeneratorModal onClose={onClose} />
  </AppProvider>
);

beforeEach(() => {
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
  vi.mocked(window.electronAPI.libraryList).mockResolvedValue({
    libraries: [{ id: 'factory-40', name: 'Factory 40', concerts: 1, patches: 40 }],
    defaultFolder: 'C:/Documentos/Preseter/Bibliotecas',
  });
  vi.mocked(window.electronAPI.libraryInspect).mockResolvedValue(inspection());
});

describe('LibraryGeneratorModal', () => {
  it('mostra a biblioteca pronta e gera os concerts', async () => {
    vi.mocked(window.electronAPI.libraryGenerate).mockResolvedValue({
      folder: 'C:/Documentos/Preseter/Bibliotecas/Factory 40',
      concerts: [{ id: 'factory-40', name: 'Factory 40', path: 'C:/x/Factory 40.pst', sets: 8, patches: 40 }],
      patches: 40,
      skipped: [],
      missing: [],
    });
    renderModal();

    expect(await screen.findByText('✓ Tudo pronto para gerar.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar' }));
    await waitFor(() => expect(window.electronAPI.libraryGenerate)
      .toHaveBeenCalledWith('factory-40', 'C:/Documentos/Preseter/Bibliotecas'));
    expect(await screen.findByRole('button', { name: 'Abrir Factory 40' })).toBeInTheDocument();
  });

  it('avisa o que falta e permite gerar só o disponível', async () => {
    vi.mocked(window.electronAPI.libraryInspect).mockResolvedValue(inspection({
      ready: 25,
      missing: ['Sonatina Symphonic Orchestra'],
      missingIds: ['sonatina'],
      skipped: ['x'],
    }));
    renderModal();

    expect(await screen.findByText(/Faltando: Sonatina/)).toBeInTheDocument();
    expect(screen.getByText('Sem isso, 15 timbres serão pulados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar o que falta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar 25 de 40' })).toBeEnabled();
  });

  it('mostra o erro de um arquivo inválido e não permite gerar', async () => {
    vi.mocked(window.electronAPI.libraryPickFile).mockRejectedValue(new Error('Biblioteca inválida:\nid: erro'));
    renderModal();
    await screen.findByText('✓ Tudo pronto para gerar.');

    fireEvent.click(screen.getByRole('button', { name: 'Escolher arquivo…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Biblioteca inválida');
    expect(screen.getByRole('button', { name: 'Gerar' })).toBeDisabled();
  });
});
