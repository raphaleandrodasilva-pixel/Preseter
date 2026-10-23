import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceScreen } from './PerformanceScreen';
import { createElement, createLayout, createPreset } from '../../test/fixtures';

function renderScreen(
  currentPreset: ReturnType<typeof createPreset> | null,
  overrides: Partial<React.ComponentProps<typeof PerformanceScreen>> = {}
) {
  const props = {
    presets: currentPreset ? [currentPreset] : [],
    currentPreset,
    isLoading: false,
    onSelectPreset: vi.fn(),
    onEditPreset: vi.fn(),
    onNewPreset: vi.fn(),
    onOpenMidi: vi.fn(),
    onOpenVst: vi.fn(),
    onOpenPresetManager: vi.fn(),
    onMidiMessage: vi.fn(),
    onSetVstParameter: vi.fn(),
    ...overrides,
  };
  const result = render(<PerformanceScreen {...props} />);
  return { ...result, props };
}

describe('PerformanceScreen', () => {
  it('shows the empty stage and loading toast without a preset', () => {
    const { props } = renderScreen(null, { isLoading: true });
    expect(screen.getByText('Pronto para tocar?')).toBeInTheDocument();
    expect(screen.getByText('Carregando preset…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Montar primeiro preset'));
    expect(props.onNewPreset).toHaveBeenCalled();
  });

  it('renders sectioned and free controls plus plugin tags', () => {
    const preset = createPreset({
      name: 'Stage',
      midiChannel: 2,
      layout: createLayout({
        elements: [
          createElement({ id: 'free', type: 'label', label: 'Free control' }),
          createElement({
            id: 'section',
            type: 'label',
            label: 'Section control',
            section: 'instrument',
          }),
        ],
      }),
      plugins: [
        { pluginId: 'i', name: 'Piano', path: 'C:/p.vst3', role: 'instrument' },
        { pluginId: 'e', name: 'Reverb', path: 'C:/r.vst3', role: 'effect' },
      ],
    });
    renderScreen(preset);

    expect(screen.getByRole('heading', { name: 'Stage' })).toBeInTheDocument();
    expect(screen.getByText('Free control')).toBeInTheDocument();
    expect(screen.getByText('Section control')).toBeInTheDocument();
    expect(screen.getByText('Instrumento: Piano')).toBeInTheDocument();
    expect(screen.getByText('Efeito: Reverb')).toBeInTheDocument();
    expect(screen.getByText('canal 3')).toBeInTheDocument();
  });

  it('explains when all controls are sectioned', () => {
    const preset = createPreset({
      layout: createLayout({
        elements: [
          createElement({
            id: 'section',
            type: 'label',
            label: 'Section control',
            section: 'tone',
          }),
        ],
      }),
    });
    renderScreen(preset);
    expect(screen.getByText(/Todos os controles estão nas seções acima/)).toBeInTheDocument();
  });

  it('explains when the preset has no visual controls or plugins', () => {
    renderScreen(createPreset());
    expect(
      screen.getByText('Este preset ainda não tem controles visuais.')
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhum plugin associado.')).toBeInTheDocument();
  });
});
