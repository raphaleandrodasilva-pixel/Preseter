import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineParameter } from '@shared/engine-protocol';
import { AppProvider } from '../../context/AppContext';
import { ControlInspector } from './ControlInspector';
import {
  createBus,
  createConcertState,
  createElement,
  createInsert,
  createPreset,
} from '../../../test/fixtures';

function parameter(overrides: Partial<EngineParameter> = {}): EngineParameter {
  return {
    index: 2,
    id: '2',
    name: 'Mix',
    label: 'Mix',
    value: 0.5,
    defaultValue: 0.5,
    text: '50%',
    stepCount: 0,
    automatable: true,
    ...overrides,
  };
}

function renderInspector(
  element: ReturnType<typeof createElement>,
  onUpdate = vi.fn(),
  extra: Partial<React.ComponentProps<typeof ControlInspector>> = {}
) {
  const draft = createPreset({
    id: 'p1',
    master: {
      volumeDb: 0,
      pan: 0,
      muted: false,
      inserts: [createInsert({ slot: 0, name: 'Reverb', path: 'C:/reverb.vst3' })],
    },
  });
  render(
    <AppProvider>
      <ControlInspector
        mode="edit"
        element={element}
        draft={draft}
        scannedPlugins={[]}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onDuplicate={vi.fn()}
        onBringFront={vi.fn()}
        onSendBack={vi.fn()}
        auxBuses={[
          createBus({
            inserts: [createInsert({ slot: 1, name: 'Delay', path: 'C:/delay.vst3' })],
          }),
          createBus(),
          createBus(),
          createBus(),
        ]}
        {...extra}
      />
    </AppProvider>
  );
  return { draft, onUpdate };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
});

describe('ControlInspector — parâmetros de plugins', () => {
  it('lists Master, Aux and layer targets and maps one to the knob', async () => {
    const element = createElement({ id: 'k1', type: 'knob', label: 'Knob' });
    const { onUpdate } = renderInspector(
      element,
      vi.fn(),
      {
        draft: createPreset({
          id: 'p1',
          master: {
            volumeDb: 0,
            pan: 0,
            muted: false,
            inserts: [createInsert({ slot: 0, name: 'Reverb', path: 'C:/reverb.vst3' })],
          },
        }),
      }
    );

    const pluginSelect = await screen.findByLabelText('Plugin / efeito');
    expect(screen.getByRole('option', { name: 'Master do Patch — Reverb' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Aux 1 — Delay' })).toBeInTheDocument();

    fireEvent.change(pluginSelect, { target: { value: 'patch|0' } });
    expect(onUpdate).toHaveBeenCalledWith('k1', {
      paramOwner: 'patch',
      paramSlot: 0,
      pluginPath: 'C:/reverb.vst3',
      pluginId: undefined,
      parameterId: undefined,
    });
  });

  it('loads the parameters of the mapped insert and saves the parameter id', async () => {
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue([parameter()]);
    const element = createElement({
      id: 'k2',
      type: 'knob',
      label: 'Mix',
      paramOwner: 'patch',
      paramSlot: 0,
    });
    const onUpdate = vi.fn();
    renderInspector(element, onUpdate);

    await waitFor(() => expect(window.electronAPI.vstParams).toHaveBeenCalledWith('patch', 0));
    const parameterSelect = await screen.findByLabelText('Parâmetro');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mix' })).toBeInTheDocument());

    fireEvent.change(parameterSelect, { target: { value: '2' } });
    expect(onUpdate).toHaveBeenCalledWith('k2', { parameterId: '2' });
  });
});
