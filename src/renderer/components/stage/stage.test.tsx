import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UiElement } from '@shared/types';
import { StageHeader } from './StageHeader';
import { StageSidebar } from './StageSidebar';
import { StageSections } from './StageSections';
import { PedalBoard } from './PedalBoard';
import { createElement, createPreset } from '../../../test/fixtures';

describe('StageHeader', () => {
  it('shows the current preset and calls every action', () => {
    const preset = createPreset({
      programNumber: 11,
      midiChannel: 2,
      category: ' Pianos ',
      name: 'Grand',
      plugins: [
        { pluginId: 'p', name: 'Piano', path: 'C:/p.vst3', role: 'instrument' },
      ],
    });
    const onEditPreset = vi.fn();
    const onNewPreset = vi.fn();
    const onOpenMidi = vi.fn();
    const onOpenVst = vi.fn();
    const onOpenPresetManager = vi.fn();
    render(
      <StageHeader
        preset={preset}
        onEditPreset={onEditPreset}
        onNewPreset={onNewPreset}
        onOpenMidi={onOpenMidi}
        onOpenVst={onOpenVst}
        onOpenPresetManager={onOpenPresetManager}
      />
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Pianos')).toBeInTheDocument();
    expect(screen.getByText('Grand')).toBeInTheDocument();
    expect(screen.getByText(/Canal MIDI 3/)).toBeInTheDocument();
    expect(screen.getByText(/1 plugin/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Gerenciar'));
    fireEvent.click(screen.getByText('MIDI'));
    fireEvent.click(screen.getByText('VSTs'));
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('+ Preset'));
    expect(onOpenPresetManager).toHaveBeenCalled();
    expect(onOpenMidi).toHaveBeenCalled();
    expect(onOpenVst).toHaveBeenCalled();
    expect(onEditPreset).toHaveBeenCalledWith(preset);
    expect(onNewPreset).toHaveBeenCalled();
  });

  it('shows an empty state without an edit action', () => {
    render(
      <StageHeader
        preset={null}
        onEditPreset={vi.fn()}
        onNewPreset={vi.fn()}
        onOpenMidi={vi.fn()}
        onOpenVst={vi.fn()}
        onOpenPresetManager={vi.fn()}
      />
    );
    expect(screen.getByText('Nenhum patch selecionado')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByText('Escolha um patch na lista ao lado')).toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });
});

describe('StageSidebar', () => {
  it('groups and sorts presets by category and program', () => {
    const presets = [
      createPreset({ id: 'b', name: 'B', programNumber: 5, category: 'Beta' }),
      createPreset({ id: 'a2', name: 'A2', programNumber: 2, category: 'Alpha' }),
      createPreset({ id: 'a1', name: 'A1', programNumber: 1, category: 'Alpha' }),
      createPreset({ id: 'n', name: 'No category', programNumber: 3, category: '  ' }),
    ];
    const onSelectPreset = vi.fn();
    const onEditPreset = vi.fn();
    const onNewPreset = vi.fn();
    const { container } = render(
      <StageSidebar
        presets={presets}
        currentPresetId="a1"
        onSelectPreset={onSelectPreset}
        onEditPreset={onEditPreset}
        onNewPreset={onNewPreset}
      />
    );

    expect(screen.getByText('4 preset(s)')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    const categoryLabels = container.querySelectorAll('.stg-catlabel');
    expect([...categoryLabels].map((node) => node.textContent)).toEqual([
      'Alpha',
      'Beta',
      'Sem categoria',
    ]);
    const names = container.querySelectorAll('.stg-itemname');
    expect([...names].map((node) => node.textContent)).toEqual([
      'A1',
      'A2',
      'B',
      'No category',
    ]);
    expect(container.querySelector('.stg-item.active .stg-itemname')).toHaveTextContent('A1');

    fireEvent.click(screen.getByTitle('A2 (Programa 3)'));
    expect(onSelectPreset).toHaveBeenCalledWith(presets[1]);
    fireEvent.click(screen.getAllByTitle('Editar preset')[1]);
    expect(onEditPreset).toHaveBeenCalledWith(presets[1]);
    fireEvent.click(screen.getByTitle('Novo preset'));
    expect(onNewPreset).toHaveBeenCalled();
  });

  it('renders an empty library message', () => {
    render(
      <StageSidebar
        presets={[]}
        currentPresetId={null}
        onSelectPreset={vi.fn()}
        onEditPreset={vi.fn()}
        onNewPreset={vi.fn()}
      />
    );
    expect(screen.getByText(/biblioteca est/)).toBeInTheDocument();
    expect(screen.getByText('0 preset(s)')).toBeInTheDocument();
  });
});

describe('StageSections', () => {
  function sectionElement(id: string, section: UiElement['section']): UiElement {
    return createElement({ id, label: id, type: 'label', section });
  }

  it('renders known sections in fixed order and ignores unassigned elements', () => {
    const elements = [
      sectionElement('output', 'output'),
      sectionElement('tone', 'tone'),
      sectionElement('instrument', 'instrument'),
      sectionElement('effects', 'effects'),
      createElement({ id: 'unassigned', label: 'unassigned', type: 'label' }),
      sectionElement('unknown', 'unknown' as UiElement['section']),
    ];
    render(
      <StageSections
        elements={elements}
        channel={0}
        onMidiMessage={vi.fn()}
        onSetVstParameter={vi.fn()}
      />
    );

    const sections = screen.getAllByRole('region');
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual([
      'Instrument',
      'Effects',
      'Tone',
      'Output',
    ]);
    expect(screen.getByText('instrument')).toBeInTheDocument();
    expect(screen.queryByText('unassigned')).not.toBeInTheDocument();
    expect(screen.queryByText('unknown')).not.toBeInTheDocument();
  });

  it('renders nothing when no element has a section', () => {
    const { container } = render(
      <StageSections
        elements={[createElement({ type: 'label', label: 'free' })]}
        channel={0}
        onMidiMessage={vi.fn()}
        onSetVstParameter={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PedalBoard', () => {
  it('renders the pedal preview', () => {
    render(<PedalBoard />);
    expect(screen.getByTitle(/pedais/)).toBeInTheDocument();
    expect(screen.getByText('Sustain')).toBeInTheDocument();
    expect(screen.getByText('Expression')).toBeInTheDocument();
  });
});
