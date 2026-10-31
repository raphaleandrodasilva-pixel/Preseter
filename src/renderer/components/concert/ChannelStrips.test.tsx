import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    fireEvent.click(within(aux1).getAllByText('＋ vazio')[0]);
    expect(screen.getByText('Reverb')).toBeInTheDocument();
  });

  it('opens the Aux tab when a send knob is selected', () => {
    renderStrips({ auxBuses, focusedSendAux: 2 });
    expect(screen.getByRole('button', { name: 'Aux 1–4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bus-strip-aux2')).toBeInTheDocument();
  });
});
