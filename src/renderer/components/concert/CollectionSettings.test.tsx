import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionItemStatus } from '@shared/collection';
import { AppProvider } from '../../context/AppContext';
import { CollectionSettings } from './CollectionSettings';
import { createConcertState } from '../../../test/fixtures';

function item(overrides: Partial<CollectionItemStatus> = {}): CollectionItemStatus {
  return {
    id: 'sforzando',
    name: 'Sforzando (Plogue)',
    description: 'Player SFZ/SF2',
    group: 'plugin',
    kind: 'vst3-zip',
    approxBytes: 16000000,
    license: 'GPL-3.0',
    defaultSelected: true,
    status: 'missing',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
});

describe('CollectionSettings', () => {
  it('lists the catalog and downloads the default selection', async () => {
    vi.mocked(window.electronAPI.collectionStatus).mockResolvedValue([
      item(),
      item({
        id: 'musescore-general',
        name: 'MuseScore_General.sf2',
        description: 'SoundFont GM',
        group: 'library',
        kind: 'soundfont',
        approxBytes: 216000000,
        license: 'MIT',
        status: 'missing',
      }),
    ]);
    vi.mocked(window.electronAPI.collectionDownload).mockResolvedValue({
      ok: true,
      statuses: [
        item({ status: 'installed' }),
        item({
          id: 'musescore-general',
          name: 'MuseScore_General.sf2',
          description: 'SoundFont GM',
          group: 'library',
          kind: 'soundfont',
          approxBytes: 216000000,
          license: 'MIT',
          status: 'installed',
        }),
      ],
      summary: {
        total: 2,
        downloaded: 2,
        installed: 2,
        skipped: 0,
        failed: 0,
        cancelled: 0,
        manual: 0,
      },
    });

    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    expect(await screen.findByText('Sforzando (Plogue)')).toBeInTheDocument();
    expect(screen.getByText('MuseScore_General.sf2')).toBeInTheDocument();

    const download = await screen.findByRole('button', { name: /Baixar selecionados/ });
    fireEvent.click(download);

    await waitFor(() => expect(window.electronAPI.collectionDownload).toHaveBeenCalled());
    const ids = vi.mocked(window.electronAPI.collectionDownload).mock.calls[0][0];
    expect(ids).toEqual(expect.arrayContaining(['sforzando', 'musescore-general']));
  });

  it('mostra a barra geral enquanto o download está em andamento', async () => {
    vi.mocked(window.electronAPI.collectionStatus).mockResolvedValue([item()]);
    let finish: ((value: Awaited<ReturnType<typeof window.electronAPI.collectionDownload>>) => void) | null = null;
    vi.mocked(window.electronAPI.collectionDownload).mockImplementation(
      () => new Promise((resolve) => { finish = resolve; })
    );

    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Baixar selecionados/ }));
    expect(await screen.findByTestId('collection-overall-progress')).toBeInTheDocument();
    expect(screen.getByText(/Preparando/)).toBeInTheDocument();

    await act(async () => {
      finish?.({
        ok: true,
        statuses: [item({ status: 'installed' })],
        summary: { total: 1, downloaded: 1, installed: 1, skipped: 0, failed: 0, cancelled: 0, manual: 0 },
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('collection-overall-progress')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(/Download concluído: 1 baixado/).length).toBeGreaterThan(0);
  });

  it('força o download dos itens já instalados', async () => {
    vi.mocked(window.electronAPI.collectionStatus).mockResolvedValue([item({ status: 'installed' })]);
    vi.mocked(window.electronAPI.collectionDownload).mockResolvedValue({
      ok: true,
      statuses: [item({ status: 'installed' })],
      summary: { total: 1, downloaded: 1, installed: 1, skipped: 0, failed: 0, cancelled: 0, manual: 0 },
    });

    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    fireEvent.click(await screen.findByLabelText('Selecionar Sforzando (Plogue)'));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Baixar novamente/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Baixar novamente/ }));
    await waitFor(() => {
      expect(window.electronAPI.collectionDownload).toHaveBeenCalledWith(
        expect.arrayContaining(['sforzando']),
        true
      );
    });
  });
});
