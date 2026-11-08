import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PresetPluginAssignment } from '@shared/types';
import { ChannelStrips } from './ChannelStrips';
import { createBus, createEngineMixState, createPluginInfo, createPreset } from '../../../test/fixtures';

const assignment: PresetPluginAssignment = {
  pluginId: 'plugin-1',
  layerId: 'layer-1',
  name: 'Piano',
  path: 'C:/plugins/piano.vst3',
  role: 'instrument',
  minNote: 0,
  maxNote: 127,
  patchSendDb: 0,
};

function renderStrips(overrides: Partial<React.ComponentProps<typeof ChannelStrips>> = {}) {
  const props: React.ComponentProps<typeof ChannelStrips> = {
    preset: createPreset({ plugins: [assignment] }),
    editable: true,
    scannedPlugins: [],
    loadedPlugins: [createPluginInfo({ id: 'plugin-1', layerId: 'layer-1', name: 'Piano' })],
    mixState: createEngineMixState(),
    masterSettings: createBus(),
    concertStrips: [],
    setStrips: [],
    setName: null,
    setOverrides: undefined,
    availableOutputPairs: 1,
    onRequestScan: vi.fn(async () => []),
    onAdd: vi.fn(async () => true),
    onAddSplit: vi.fn(async () => true),
    onLearnSplitNote: vi.fn(() => () => undefined),
    onRemove: vi.fn(async () => undefined),
    onCopy: vi.fn(async () => true),
    onReplace: vi.fn(async () => true),
    onAddInsert: vi.fn(async () => true),
    onRemoveInsert: vi.fn(async () => undefined),
    onToggleInsertBypass: vi.fn(async () => undefined),
    onOpenInsertEditor: vi.fn(),
    onSetSend: vi.fn(),
    onSetLayerPatchSend: vi.fn(),
    onSetArp: vi.fn(),
    onSetLayerOutput: vi.fn(),
    onSetBusMix: vi.fn(),
    onAddBusInsert: vi.fn(async () => true),
    onRemoveBusInsert: vi.fn(async () => undefined),
    onToggleBusInsertBypass: vi.fn(async () => undefined),
    onOpenBusInsertEditor: vi.fn(),
    onAddStrip: vi.fn(async () => true),
    onRemoveStrip: vi.fn(async () => undefined),
    onRenameStrip: vi.fn(),
    onSetStripValue: vi.fn(),
    onSetStripInserts: vi.fn(async () => true),
    onRevertStripAttribute: vi.fn(),
    onSetParameter: vi.fn(),
    onSetLayerMix: vi.fn(),
    onSetMasterMix: vi.fn(),
    ...overrides,
  };
  render(<ChannelStrips {...props} />);
  return props;
}

describe('ChannelStrips — send do layer para o bus do patch', () => {
  it('shows the layer patch send and applies changes', () => {
    const props = renderStrips();

    expect(screen.queryByText(/Insert:/)).not.toBeInTheDocument();

    const send = screen.getByLabelText('Send de Piano para o Master do Patch') as HTMLInputElement;
    expect(send.value).toBe('0');

    fireEvent.change(send, { target: { value: '-12' } });
    expect(props.onSetLayerPatchSend).toHaveBeenCalledWith('layer-1', -12);
  });

  it('keeps the master strip on the patch bus', () => {
    const props = renderStrips();
    expect(screen.getByText('Master do Patch')).toBeInTheDocument();

    const volume = screen.getByLabelText('Volume de Master do Patch') as HTMLInputElement;
    fireEvent.change(volume, { target: { value: '-3' } });
    expect(props.onSetBusMix).toHaveBeenCalledWith('patch', { volumeDb: -3 });
  });
});

describe('ChannelStrips — arpejador', () => {
  it('abre o arpejador do layer e liga/desliga via modal', () => {
    const props = renderStrips();

    fireEvent.click(screen.getByRole('button', { name: /ARP off/ }));
    const dialog = screen.getByRole('dialog', { name: 'Arpejador — Piano' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Arp desligado' }));
    expect(props.onSetArp).toHaveBeenCalledWith(
      'layer-1',
      expect.objectContaining({ enabled: true, mode: 'up', rate: '1/16', octaves: 1 })
    );
  });

  it('mostra modo e rate do arpejador ativo no botão do layer', () => {
    renderStrips({
      preset: createPreset({
        plugins: [
          {
            ...assignment,
            arp: { enabled: true, mode: 'updown', rate: '1/8', octaves: 1, gate: 50, swing: 0, hold: false },
          },
        ],
      }),
    });

    expect(screen.getByRole('button', { name: /ARP · 1\/8 · ↕/ })).toBeInTheDocument();
  });
});

describe('ChannelStrips — presets do timbre', () => {
  const basePreset = {
    pluginId: 'plugin-1',
    pluginName: 'Piano',
    pluginPath: 'C:/plugins/piano.vst3',
    category: 'Piano',
    createdAt: 1,
    updatedAt: 1,
  };

  it('lista programas, snapshots e .vstpreset do plugin e aplica o escolhido', async () => {
    vi.mocked(window.electronAPI.vstPresetsList).mockResolvedValueOnce({
      presets: [
        { ...basePreset, id: 'program:1', name: 'Grand', source: 'program', programIndex: 0 },
        { ...basePreset, id: 'snapshot:1', name: 'Meu som', source: 'snapshot' },
        { ...basePreset, id: 'vstpreset:1', name: 'Arquivo', source: 'vstpreset', filePath: 'C:/a.vstpreset' },
        {
          ...basePreset,
          id: 'program:other',
          name: 'Outro plugin',
          source: 'program',
          pluginId: 'other',
          pluginName: 'Other',
        },
      ],
      status: { scanning: false, scanned: 1, total: 1 },
    });

    renderStrips();
    const select = (await screen.findByLabelText('Preset de Piano')) as HTMLSelectElement;

    expect(within(select).getByRole('option', { name: 'Grand' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Meu som' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Arquivo' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Outro plugin' })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'program:1' } });
    await waitFor(() =>
      expect(window.electronAPI.vstPresetApply).toHaveBeenCalledWith('program:1', 'layer-1')
    );
  });

  it('salva o som atual como preset com o nome informado', async () => {
    vi.mocked(window.electronAPI.vstPresetSaveSnapshot).mockResolvedValueOnce({
      ...basePreset,
      id: 'snapshot:new',
      name: 'Meu som',
      source: 'snapshot',
    });

    renderStrips();
    fireEvent.click(await screen.findByRole('button', { name: /Salvar/ }));

    const dialog = screen.getByRole('dialog', { name: 'Salvar preset de Piano' });
    const name = within(dialog).getByLabelText('Nome do preset') as HTMLInputElement;
    expect(name.value).toBe('Patch 1 · Piano');

    fireEvent.change(name, { target: { value: 'Meu som' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(window.electronAPI.vstPresetSaveSnapshot).toHaveBeenCalledWith({
        layerId: 'layer-1',
        name: 'Meu som',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('ChannelStrips — aba Aux', () => {
  const auxBuses = Array.from({ length: 4 }, () => createBus());

  it('lists Aux 1–4 and opens the effect picker in an Aux slot', () => {
    renderStrips({
      auxBuses,
      scannedPlugins: [
        createPluginInfo({ id: 'reverb', name: 'Reverb', path: 'C:/plugins/reverb.vst3', isInstrument: false }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aux 1–4' }));
    expect(screen.getByTestId('bus-strip-aux1')).toBeInTheDocument();
    expect(screen.getByTestId('bus-strip-aux4')).toBeInTheDocument();

    const aux1 = screen.getByTestId('bus-strip-aux1');
    fireEvent.click(within(aux1).getByText('＋ Adicionar efeito'));
    expect(screen.getByText('Reverb')).toBeInTheDocument();
  });

  it('opens the Aux tab when a send knob is selected', () => {
    renderStrips({ auxBuses, focusedSendAux: 2 });
    expect(screen.getByRole('button', { name: 'Aux 1–4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bus-strip-aux2')).toBeInTheDocument();
  });
});
