import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../context/AppContext';
import { CollectionSettings } from './CollectionSettings';
import { createConcertState } from '../../../test/fixtures';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
});

describe('CollectionSettings', () => {
  it('mostra tudo pronto e gera o concert sem listar plugins', async () => {
    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    expect(await screen.findByText('Tudo pronto.')).toBeInTheDocument();
    expect(screen.queryByText('Plugins (VST3)')).not.toBeInTheDocument();
    expect(screen.queryByText('Instalação manual')).not.toBeInTheDocument();
    expect(screen.queryByText('Bibliotecas de som')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar concert da Factory 40' }));
    await waitFor(() => expect(window.electronAPI.collectionGenerate).toHaveBeenCalled());
  });

  it('mostra só o que falta e baixa apenas as dependências pendentes', async () => {
    vi.mocked(window.electronAPI.collectionReadiness).mockResolvedValue({
      total: 40,
      ready: 36,
      blocked: 4,
      missing: ['MuseScore_General', 'Sonatina Symphonic Orchestra'],
      missingIds: ['musescore-general', 'sonatina'],
      skipped: ['04 Upright Piano', '13 Solo Violin'],
      readyToGenerate: false,
    });
    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    expect(await screen.findByText('MuseScore_General')).toBeInTheDocument();
    expect(screen.getByText('Sonatina Symphonic Orchestra')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar o que falta' }));
    await waitFor(() =>
      expect(window.electronAPI.collectionDownload).toHaveBeenCalledWith(
        ['musescore-general', 'sonatina'],
        true
      )
    );
  });

  it('mostra a barra geral durante o download', async () => {
    vi.mocked(window.electronAPI.collectionReadiness).mockResolvedValue({
      total: 40,
      ready: 38,
      blocked: 2,
      missing: ['Salamander Grand Piano'],
      missingIds: ['salamander'],
      skipped: ['01 Concert Grand'],
      readyToGenerate: false,
    });
    let finish: ((value: Awaited<ReturnType<typeof window.electronAPI.collectionDownload>>) => void) | null = null;
    vi.mocked(window.electronAPI.collectionDownload).mockImplementation(
      () => new Promise((resolve) => { finish = resolve; })
    );
    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Baixar o que falta' }));
    expect(await screen.findByTestId('collection-overall-progress')).toBeInTheDocument();
    expect(screen.getByText(/Preparando/)).toBeInTheDocument();

    await act(async () => {
      finish?.({
        ok: true,
        statuses: [],
        summary: { total: 1, downloaded: 1, installed: 1, skipped: 0, failed: 0, cancelled: 0, manual: 0 },
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('collection-overall-progress')).not.toBeInTheDocument();
    });
  });
});
