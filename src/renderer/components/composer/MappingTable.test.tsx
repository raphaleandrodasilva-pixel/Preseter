import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MappingTable, buildScannedParams } from './MappingTable';
import { createElement, createLayout, createPluginInfo, createPreset } from '../../../test/fixtures';

describe('MappingTable', () => {
  it('shows an empty state when the layout has no controls', () => {
    render(
      <MappingTable
        draft={createPreset()}
        scannedParams={[]}
        scannedPlugins={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/Nenhum controle no layout/)).toBeInTheDocument();
  });

  it('lists controls with MIDI, VST and section descriptions', () => {
    const draft = createPreset({
      midiChannel: 2,
      layout: createLayout({
        elements: [
          createElement({
            id: 'knob',
            label: 'Cutoff',
            type: 'knob',
            section: 'tone',
            midiCommand: { type: 'cc', channel: 0, controllerNumber: 74 },
            pluginPath: 'C:/p.vst3',
            parameterId: 'cutoff',
          }),
          createElement({
            id: 'button',
            label: 'Mute',
            type: 'button',
            midiCommand: { type: 'note', channel: 1 },
            noteNumber: 60,
          }),
        ],
      }),
    });
    const onSelect = vi.fn();
    const params = [{ path: 'C:/p.vst3', params: [{ id: 'cutoff', name: 'Cutoff' }] }];
    const { container } = render(
      <MappingTable
        draft={draft}
        scannedParams={params}
        scannedPlugins={[]}
        selectedId="knob"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('Cutoff')).toBeInTheDocument();
    expect(screen.getByText('tone')).toBeInTheDocument();
    expect(screen.getByText('livre')).toBeInTheDocument();
    expect(screen.getByText(/CC 74/)).toBeInTheDocument();
    expect(screen.getByText(/Nota C4 \(60\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cutoff/).length).toBeGreaterThan(0);

    const selectedRow = container.querySelector('tbody tr')!;
    expect(selectedRow.className).toContain('bg-amber-300/10');
    fireEvent.click(selectedRow);
    expect(onSelect).toHaveBeenCalledWith('knob');
  });

  it('extracts parameter summaries from scanned plugins', () => {
    const plugin = createPluginInfo({
      path: 'C:/plug.vst3',
      parameters: [
        { id: 'gain', name: 'Gain', label: 'Gain', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepCount: 100 },
        { id: 'tone', name: 'Tone', label: 'Tone', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepCount: 100 },
      ],
    });
    expect(buildScannedParams([plugin])).toEqual([
      {
        path: 'C:/plug.vst3',
        params: [
          { id: 'gain', name: 'Gain' },
          { id: 'tone', name: 'Tone' },
        ],
      },
    ]);
  });
});
