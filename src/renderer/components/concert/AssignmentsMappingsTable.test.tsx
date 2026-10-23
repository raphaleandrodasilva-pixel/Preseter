import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConcertMapping } from '@shared/types';
import { AssignmentsMappingsTable } from './AssignmentsMappingsTable';
import {
  createElement,
  createLayout,
  createPluginInfo,
  createPreset,
  createSet,
} from '../../../test/fixtures';

function setup(overrides: Partial<React.ComponentProps<typeof AssignmentsMappingsTable>> = {}) {
  const currentPatch = createPreset({
    id: 'preset-1',
    name: 'Patch 1',
    plugins: [
      {
        pluginId: 'plugin-1',
        layerId: 'layer-1',
        name: 'Piano',
        path: 'C:/piano.vst3',
        role: 'instrument',
      },
    ],
  });
  const currentSet = createSet({ id: 'set-1', name: 'Set 1' });
  const onChange = vi.fn();
  const onClose = vi.fn();
  const props = {
    mappings: [],
    presets: [currentPatch],
    sets: [currentSet],
    currentPatch,
    currentSet,
    layout: createLayout({ elements: [createElement({ id: 'knob', label: 'Cutoff', type: 'knob' })] }),
    scannedPlugins: [
      createPluginInfo({
        path: 'C:/piano.vst3',
        name: 'Piano',
        parameters: [
          { id: 'cutoff', name: 'Cutoff', label: 'Cutoff', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepCount: 100 },
        ],
      }),
    ],
    onChange,
    onClose,
    ...overrides,
  };
  const result = render(<AssignmentsMappingsTable {...props} />);
  return { ...result, props, onChange, onClose, currentPatch, currentSet };
}

function select(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AssignmentsMappingsTable', () => {
  it('renders existing mappings at every level and target type', () => {
    const mappings: ConcertMapping[] = [
      {
        id: 'm1',
        source: { type: 'cc', channel: 0, controllerNumber: 20 },
        elementId: 'knob',
      },
      {
        id: 'm2',
        source: { type: 'note', channel: 1, controllerNumber: 60 },
        setId: 'set-1',
      },
      {
        id: 'm3',
        source: { type: 'pc', channel: 2, programNumber: 5 },
        patchId: 'preset-1',
      },
      {
        id: 'm4',
        source: { type: 'pitch', channel: 0 },
        action: 'panic',
      },
      {
        id: 'm5',
        source: { type: 'aftertouch', channel: 0 },
        parameterId: 'cutoff',
      },
    ];
    const { onChange } = setup({ mappings });

    expect(screen.getByText('Assignments & Mappings')).toBeInTheDocument();
    expect(screen.getByText('CC 20 · canal 1')).toBeInTheDocument();
    expect(screen.getByText('Controle: Cutoff')).toBeInTheDocument();
    expect(screen.getByText('Nota 60 · canal 2')).toBeInTheDocument();
    expect(screen.getByText('Set: Set 1')).toBeInTheDocument();
    expect(screen.getByText('PC 5 · canal 3')).toBeInTheDocument();
    expect(screen.getByText('Patch: Patch 1')).toBeInTheDocument();
    expect(screen.getByText('Pitch Bend · canal 1')).toBeInTheDocument();
    expect(screen.getByText('Panic')).toBeInTheDocument();
    expect(screen.getByText('Aftertouch · canal 1')).toBeInTheDocument();
    expect(screen.getByText('Parâmetro: cutoff')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Remover')[0]);
    expect(onChange).toHaveBeenCalledWith([mappings[1], mappings[2], mappings[3], mappings[4]]);
  });

  it('adds element, set and patch mappings with MIDI CC', () => {
    const { onChange, currentPatch, currentSet } = setup();
    expect(screen.getByText(/Nenhum mapping ainda/)).toBeInTheDocument();
    expect(screen.getByText('Adicionar')).toBeDisabled();

    select('Nível', 'set');
    select('Controle', 'knob');
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        setId: currentSet.id,
        elementId: 'knob',
        source: { type: 'cc', channel: 0, controllerNumber: 1 },
      }),
    ]);

    select('Nível', 'patch');
    select('Tipo', 'note');
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: '16' } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '64' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        patchId: currentPatch.id,
        elementId: 'knob',
        source: { type: 'note', channel: 15, controllerNumber: 64 },
      }),
    ]);
  });

  it('adds program change, pitch and aftertouch sources', () => {
    const { onChange } = setup();
    select('Controle', 'knob');
    select('Tipo', 'pc');
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source: { type: 'pc', channel: 0, programNumber: 127 },
      }),
    ]);

    select('Tipo', 'pitch');
    expect(screen.getByLabelText('Número')).toBeDisabled();
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ source: { type: 'pitch', channel: 0 } }),
    ]);

    select('Tipo', 'aftertouch');
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ source: { type: 'aftertouch', channel: 0 } }),
    ]);
  });

  it('adds plugin parameter and action targets', () => {
    const { onChange } = setup();
    select('Destino', 'parameter');
    select('Plugin', 'C:/piano.vst3');
    expect(screen.getByLabelText('Parâmetro')).toBeEnabled();
    select('Parâmetro', 'cutoff');
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        pluginPath: 'C:/piano.vst3',
        parameterId: 'cutoff',
      }),
    ]);

    select('Destino', 'action');
    select('Ação', 'tap-tempo');
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ action: 'tap-tempo' }),
    ]);
  });

  it('warns when the selected scope is unavailable', () => {
    setup({ currentSet: null });
    select('Nível', 'set');
    expect(
      screen.getByText(/Selecione um patch\/set na Patch List/)
    ).toBeInTheDocument();
  });

  it('closes the modal', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTitle('Fechar (Esc)'));
    expect(onClose).toHaveBeenCalled();
  });
});
