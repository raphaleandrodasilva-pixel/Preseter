import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionItemStatus } from '@shared/collection';
import type { StoreItemView, StoreSnapshot } from '@shared/store';
import { AppProvider } from '../../context/AppContext';
import { StoreSettings } from './StoreSettings';
import { createConcertState } from '../../../test/fixtures';

const variant = {
  os: 'windows' as const,
  arch: ['x64' as const],
  format: 'VST3' as const,
  kind: 'vst3-zip' as const,
  url: 'https://github.com/example/plugin.zip',
  fileName: 'plugin.zip',
  approxBytes: 12_000_000,
  vst3Patterns: ['Plugin.vst3'],
};

function storeItem(overrides: Partial<StoreItemView> = {}): StoreItemView {
  return {
    id: 'alfa',
    type: 'plugin',
    name: 'Plugin Alfa 1.0',
    category: 'Sintetizadores',
    author: 'Autor Alfa',
    description: 'Sintetizador de teste.',
    version: '1.0',
    tier: 'verified',
    source: 'github',
    license: 'GPL-3.0',
    licenseKind: 'open-source',
    licenseUrl: 'https://github.com/example/license',
    page: 'https://github.com/example/plugin',
    tags: ['pads', 'leads'],
    essential: true,
    defaultSelected: true,
    thumbnail: { kind: 'generated' },
    variants: [variant],
    variant,
    compatible: true,
    format: 'VST3',
    approxBytes: 12_000_000,
    availablePlatforms: ['windows', 'linux'],
    availableFormats: ['VST3'],
    status: 'missing',
    ...overrides,
  };
}

function snapshot(items: StoreItemView[] = [storeItem()]): StoreSnapshot {
  return {
    catalogVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'remote',
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    platform: 'windows',
    arch: 'x64',
    items,
    installedCount: items.filter((item) => item.status === 'installed').length,
    missingCount: items.filter((item) => item.status === 'missing').length,
    totalCount: items.filter((item) => item.compatible).length,
    installedBytes: 0,
  };
}

function status(value: CollectionItemStatus['status'] = 'missing'): CollectionItemStatus {
  return {
    id: 'alfa',
    name: 'Plugin Alfa 1.0',
    description: 'Sintetizador de teste.',
    group: 'plugin',
    kind: 'vst3-zip',
    approxBytes: 12_000_000,
    license: 'GPL-3.0',
    defaultSelected: true,
    status: value,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
});

describe('StoreSettings', () => {
  it('lists the catalog and filters by category and search', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(
      snapshot([
        storeItem(),
        storeItem({
          id: 'beta',
          name: 'Piano Beta',
          category: 'Pianos',
          author: 'Autor Beta',
          description: 'Piano de teste.',
          type: 'library',
          format: 'SF2',
          variant: { ...variant, format: 'SF2', kind: 'soundfont' },
          availableFormats: ['SF2'],
        }),
      ])
    );
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Plugin Alfa 1.0')).not.toHaveLength(0);
    expect(screen.getAllByText('Piano Beta')).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Pianos/ }));
    await waitFor(() => {
      expect(screen.queryAllByText('Plugin Alfa 1.0')).toHaveLength(0);
    });
    expect(screen.getAllByText('Piano Beta')).not.toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Buscar na loja'), {
      target: { value: 'inexistente' },
    });
    expect(await screen.findByText('Nenhum item combina com os filtros.')).toBeInTheDocument();
  });

  it('downloads an item and shows progress/cancel controls', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(snapshot());
    vi.mocked(window.electronAPI.storeDownload).mockResolvedValue({
      ok: true,
      statuses: [status('installed')],
      summary: {
        total: 1,
        downloaded: 1,
        installed: 1,
        skipped: 0,
        failed: 0,
        cancelled: 0,
        manual: 0,
      },
    });
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Plugin Alfa 1.0')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Baixar e instalar/ }));

    await waitFor(() => {
      expect(window.electronAPI.storeDownload).toHaveBeenCalledWith(['alfa'], false);
    });
    expect(await screen.findByText('Download concluído.')).toBeInTheDocument();
  });

  it('updates the remote catalog and reflects the new snapshot', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(snapshot());
    const updated = snapshot([storeItem({ name: 'Plugin Alfa 2.0' })]);
    vi.mocked(window.electronAPI.storeCheckUpdates).mockResolvedValue({
      ok: true,
      updated: true,
      source: 'remote',
      checkedAt: '2026-02-01T00:00:00.000Z',
      snapshot: updated,
      resolvedLinks: 2,
      brokenLinks: 0,
    });
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Plugin Alfa 1.0')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar catálogo' }));

    expect(await screen.findAllByText('Plugin Alfa 2.0')).not.toHaveLength(0);
    expect(window.electronAPI.storeCheckUpdates).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Catálogo atualizado.')).toBeInTheDocument();
  });

  it('opens Factory 40 with the collection downloader', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(snapshot());
    vi.mocked(window.electronAPI.collectionStatus).mockResolvedValue([]);
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Plugin Alfa 1.0')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Factory 40' }));

    expect(await screen.findByText('Factory 40 · 40 timbres')).toBeInTheDocument();
    expect(await screen.findAllByText('Factory 40')).not.toHaveLength(0);
  });

  it('shows the license warning and filters by provider', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(
      snapshot([
        storeItem({
          id: 'archive-bank',
          name: 'Banco do Archive',
          source: 'archive',
          license: 'Free use (Archive.org)',
          licenseKind: 'unknown',
          tier: 'indexed',
        }),
        storeItem({
          id: 'polyphone-piano',
          name: 'Piano do Polyphone',
          source: 'polyphone',
          license: 'Give credit (Polyphone)',
          licenseKind: 'free',
          variant: {
            ...variant,
            kind: 'manual',
            url: undefined,
            page: 'https://www.polyphone.io/en/soundfonts/pianos/741-yamaha-s90-es-natural-grand',
            requiresAccount: true,
            manualReason: 'O Polyphone exige login para baixar.',
          },
        }),
      ])
    );
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Banco do Archive')).not.toHaveLength(0);
    expect(screen.getByText('Licença não conferida.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por provedor'), {
      target: { value: 'polyphone' },
    });
    expect(await screen.findAllByText('Piano do Polyphone')).not.toHaveLength(0);
    expect(screen.queryAllByText('Banco do Archive')).toHaveLength(0);
    expect(screen.getByText(/É necessária uma conta gratuita/)).toBeInTheDocument();
  });

  it('hides incompatible items until requested', async () => {
    vi.mocked(window.electronAPI.storeList).mockResolvedValue(
      snapshot([
        storeItem(),
        storeItem({
          id: 'mac-only',
          name: 'Plugin Mac',
          compatible: false,
          variant: null,
          availablePlatforms: ['mac'],
          status: 'unsupported',
        }),
      ])
    );
    render(
      <AppProvider>
        <StoreSettings />
      </AppProvider>
    );

    expect(await screen.findAllByText('Plugin Alfa 1.0')).not.toHaveLength(0);
    expect(screen.queryAllByText('Plugin Mac')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Mostrar itens de outros sistemas'));
    expect(await screen.findAllByText('Plugin Mac')).not.toHaveLength(0);
  });
});
