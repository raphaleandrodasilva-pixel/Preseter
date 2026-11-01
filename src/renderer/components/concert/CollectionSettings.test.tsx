import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionItemStatus } from '@shared/collection';
import { AppProvider } from '../../context/AppContext';
import { CollectionSettings } from './CollectionSettings';
import { createConcertState } from '../../../test/fixtures';

function item(overrides: Partial<CollectionItemStatus> = {}): CollectionItemStatus {
  return {
    id: 'juicysfplugin',
    name: 'juicysfplugin 3.1.0',
    description: 'Player SF2',
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
    vi.mocked(window.electronAPI.collectionDownload).mockResolvedValue([
      item({ status: 'installed' }),
    ]);

    render(
      <AppProvider>
        <CollectionSettings />
      </AppProvider>
    );

    expect(await screen.findByText('juicysfplugin 3.1.0')).toBeInTheDocument();
    expect(screen.getByText('MuseScore_General.sf2')).toBeInTheDocument();

    const download = await screen.findByRole('button', { name: /Baixar selecionados/ });
    fireEvent.click(download);

    await waitFor(() => expect(window.electronAPI.collectionDownload).toHaveBeenCalled());
    const ids = vi.mocked(window.electronAPI.collectionDownload).mock.calls[0][0];
    expect(ids).toEqual(expect.arrayContaining(['juicysfplugin', 'musescore-general']));
  });
});
