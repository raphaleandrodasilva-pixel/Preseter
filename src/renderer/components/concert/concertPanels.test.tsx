import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudioInputState, ConcertTemplateSummary } from '@shared/types';
import { ModeToolbar } from './ModeToolbar';
import { TemplatePicker } from './TemplatePicker';
import { TunerModal } from './TunerModal';

const templates: ConcertTemplateSummary[] = [
  { id: 'empty', name: 'Empty', description: 'Start from scratch' },
  { id: 'band', name: 'Band', description: 'Keys and pads' },
];

const midiTemplate: ConcertTemplateSummary = {
  id: 'midi-externo',
  name: 'MIDI externo',
  description: 'Cria um patch com timbre MIDI externo',
};

function toolbarProps() {
  return {
    mode: 'edit' as const,
    onModeChange: vi.fn(),
    concertName: 'My Concert',
    onConcertNameChange: vi.fn(),
    tempo: 120,
    onTempoChange: vi.fn(),
    programNumber: 3,
    presetCount: 7,
    currentPresetName: 'Piano',
    midiLastMessage: '90 3C 64',
    isMetronomeOn: false,
    onToggleMetronome: vi.fn(),
    onOpenConcertSettings: vi.fn(),
    onPanic: vi.fn(),
    onOpenSettings: vi.fn(),
  };
}

describe('ModeToolbar', () => {
  it('switches modes and edits concert metadata', () => {
    const props = toolbarProps();
    render(<ModeToolbar {...props} />);
    expect(screen.getByText('004')).toBeInTheDocument();
    expect(screen.getByText('Piano')).toBeInTheDocument();
    expect(screen.getByText('7 patch(es)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Layout'));
    fireEvent.click(screen.getByText('Perform'));
    expect(props.onModeChange).toHaveBeenNthCalledWith(1, 'layout');
    expect(props.onModeChange).toHaveBeenNthCalledWith(2, 'perform');

    fireEvent.change(screen.getByTitle('Nome do concert'), {
      target: { value: 'Renamed' },
    });
    expect(props.onConcertNameChange).toHaveBeenCalledWith('Renamed');

    const tempo = screen.getByLabelText('Tempo');
    fireEvent.change(tempo, { target: { value: '140' } });
    fireEvent.blur(tempo);
    expect(props.onTempoChange).toHaveBeenCalledWith(140);

    fireEvent.change(tempo, { target: { value: '10' } });
    fireEvent.blur(tempo);
    expect(props.onTempoChange).toHaveBeenLastCalledWith(20);
    fireEvent.change(tempo, { target: { value: '999' } });
    fireEvent.blur(tempo);
    expect(props.onTempoChange).toHaveBeenLastCalledWith(300);
    const callsBeforeEmpty = props.onTempoChange.mock.calls.length;
    fireEvent.change(tempo, { target: { value: '' } });
    fireEvent.blur(tempo);
    expect(props.onTempoChange).toHaveBeenCalledTimes(callsBeforeEmpty);
  });

  it('opens settings, toggles metronome and panics', () => {
    const props = toolbarProps();
    render(<ModeToolbar {...props} />);
    fireEvent.click(screen.getByTitle('Configurações'));
    fireEvent.click(screen.getByTitle(/Metrônomo/));
    fireEvent.click(screen.getByTitle(/Ajustes do metrônomo/));
    fireEvent.click(screen.getByTitle(/Panic/));
    expect(props.onOpenSettings).toHaveBeenCalledWith('general');
    expect(props.onToggleMetronome).toHaveBeenCalled();
    expect(props.onOpenConcertSettings).toHaveBeenCalled();
    expect(props.onPanic).toHaveBeenCalled();
  });
});

describe('TemplatePicker', () => {
  it('lists templates and picks one', () => {
    const onPick = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        externalMidiEnabled={false}
        onEnableExternalMidi={vi.fn(async () => true)}
        onPick={onPick}
        onOpenFile={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Escolha um template' })).toBeInTheDocument();
    expect(screen.getByText('2 template(s)')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('Band')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Band'));
    expect(onPick).toHaveBeenCalledWith('band');
  });

  it('opens an existing .preseter file from the template page', () => {
    const onOpenFile = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        externalMidiEnabled={false}
        onEnableExternalMidi={vi.fn(async () => true)}
        onPick={vi.fn()}
        onOpenFile={onOpenFile}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Abrir arquivo…'));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('cancels from the footer, close button and Escape', () => {
    const onCancel = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        externalMidiEnabled={false}
        onEnableExternalMidi={vi.fn(async () => true)}
        onPick={vi.fn()}
        onOpenFile={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(screen.getByTitle('Fechar (Esc)'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('asks before enabling MIDI external and then picks the template', async () => {
    const onPick = vi.fn();
    const onEnableExternalMidi = vi.fn(async () => true);
    render(
      <TemplatePicker
        templates={[...templates, midiTemplate]}
        externalMidiEnabled={false}
        onEnableExternalMidi={onEnableExternalMidi}
        onPick={onPick}
        onOpenFile={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('MIDI externo'));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('Comandar um dispositivo MIDI externo?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ligar e continuar'));
    await waitFor(() => expect(onEnableExternalMidi).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith('midi-externo'));
  });

  it('does not pick when enabling MIDI external fails', async () => {
    const onPick = vi.fn();
    render(
      <TemplatePicker
        templates={[...templates, midiTemplate]}
        externalMidiEnabled={false}
        onEnableExternalMidi={vi.fn(async () => false)}
        onPick={onPick}
        onOpenFile={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('MIDI externo'));
    fireEvent.click(screen.getByText('Ligar e continuar'));
    await waitFor(() => expect(screen.getByText(/Não foi possível ligar/)).toBeInTheDocument());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('picks MIDI external directly when the feature is enabled', () => {
    const onPick = vi.fn();
    render(
      <TemplatePicker
        templates={[...templates, midiTemplate]}
        externalMidiEnabled
        onEnableExternalMidi={vi.fn(async () => true)}
        onPick={onPick}
        onOpenFile={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('MIDI externo'));
    expect(onPick).toHaveBeenCalledWith('midi-externo');
  });
});

describe('TunerModal', () => {
  function audioState(overrides: Partial<AudioInputState> = {}): AudioInputState {
    return {
      enabled: true,
      pitchHz: 440,
      ...overrides,
    } as AudioInputState;
  }

  it('shows the nearest note and tuning error', () => {
    render(<TunerModal state={audioState()} referenceHz={442} onClose={vi.fn()} />);
    expect(screen.getByText('Entrada ativa')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/440\.0 Hz/)).toBeInTheDocument();
    expect(screen.getByText(/-8 cents/)).toBeInTheDocument();
    expect(screen.getByText(/A4 = 442 Hz/)).toBeInTheDocument();
  });

  it('handles an inactive or missing input state', () => {
    const { rerender } = render(
      <TunerModal state={audioState({ enabled: false, pitchHz: 0 })} referenceHz={440} onClose={vi.fn()} />
    );
    expect(screen.getByText('Entrada inativa')).toBeInTheDocument();
    expect(screen.getByText('Ative o strip de entrada de áudio no patch')).toBeInTheDocument();
    expect(screen.getAllByText('Toque uma nota para afinar').length).toBeGreaterThan(0);

    rerender(<TunerModal state={null} referenceHz={440} onClose={vi.fn()} />);
    expect(screen.getByText('Entrada inativa')).toBeInTheDocument();
  });

  it('closes through the modal shell', () => {
    const onClose = vi.fn();
    render(<TunerModal state={null} referenceHz={440} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Fechar (Esc)'));
    expect(onClose).toHaveBeenCalled();
  });
});
