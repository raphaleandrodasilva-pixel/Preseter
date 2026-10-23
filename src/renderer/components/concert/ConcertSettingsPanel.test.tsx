import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConcertSettingsPanel } from './ConcertSettingsPanel';
import { createConcertSettings } from '../../../test/fixtures';

function setup(overrides: Partial<ReturnType<typeof createConcertSettings>> = {}) {
  const onChange = vi.fn();
  const onTempoChange = vi.fn();
  const settings = createConcertSettings(overrides);
  const result = render(
    <ConcertSettingsPanel
      settings={settings}
      tempo={120}
      onChange={onChange}
      onTempoChange={onTempoChange}
      midiInputNames={['Keys']}
    />
  );
  return { ...result, onChange, onTempoChange, settings };
}

describe('ConcertSettingsPanel', () => {
  it('edits MIDI routing, transpose and program-change source', () => {
    const { onChange, settings } = setup();
    expect(screen.getByText('Concert Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('CC7 controla o volume dos channel strips'));
    expect(onChange).toHaveBeenCalledWith({
      midi: { ...settings.midi, cc7ControlsVolume: false },
    });

    fireEvent.click(screen.getByLabelText('CC10 controla o pan dos channel strips'));
    expect(onChange).toHaveBeenCalledWith({
      midi: { ...settings.midi, cc10ControlsPan: false },
    });

    fireEvent.click(
      screen.getByLabelText('Enviar MIDI não atribuído a todos os channel strips')
    );
    fireEvent.click(
      screen.getByLabelText('Enviar Program Change não usado aos channel strips')
    );

    fireEvent.change(screen.getByLabelText(/Transpose do concert/), {
      target: { value: '40' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      midi: { ...settings.midi, transpose: 24 },
    });
    fireEvent.change(screen.getByLabelText(/Transpose do concert/), {
      target: { value: '-40' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      midi: { ...settings.midi, transpose: -24 },
    });

    const device = screen.getByLabelText(/Origem do Program Change — dispositivo/);
    fireEvent.change(device, { target: { value: 'Keys' } });
    expect(onChange).toHaveBeenLastCalledWith({
      midi: {
        ...settings.midi,
        programChange: { ...settings.midi.programChange, device: 'Keys' },
      },
    });

    const channel = screen.getByLabelText(/Origem do Program Change — canal/);
    fireEvent.change(channel, { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({
      midi: {
        ...settings.midi,
        programChange: { ...settings.midi.programChange, channel: 3 },
      },
    });
    fireEvent.change(channel, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({
      midi: {
        ...settings.midi,
        programChange: { ...settings.midi.programChange, channel: null },
      },
    });
  });

  it('shows an unknown saved device as an option', () => {
    setup({
      midi: {
        ...createConcertSettings().midi,
        programChange: { device: 'Removed Keyboard', channel: null },
      },
    });
    const device = screen.getByLabelText(/Origem do Program Change — dispositivo/);
    expect(device).toHaveValue('Removed Keyboard');
    expect(device).toHaveDisplayValue('Removed Keyboard');
  });

  it('edits timing, tuning, pan law, metronome and notes', () => {
    const { onChange, onTempoChange, settings } = setup();
    fireEvent.click(screen.getByText('Timing'));
    fireEvent.change(screen.getByLabelText(/Tempo \(BPM\)/), {
      target: { value: '140' },
    });
    expect(onTempoChange).toHaveBeenCalledWith(140);
    fireEvent.change(screen.getByLabelText(/Tempo \(BPM\)/), {
      target: { value: '5' },
    });
    expect(onTempoChange).toHaveBeenLastCalledWith(20);
    fireEvent.change(screen.getByLabelText(/Compasso — numerador/), {
      target: { value: '40' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      timeSignature: { ...settings.timeSignature, numerator: 32 },
    });
    fireEvent.change(screen.getByLabelText(/Compasso — denominador/), {
      target: { value: '8' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      timeSignature: { ...settings.timeSignature, denominator: 8 },
    });
    expect(screen.getByText(/♩ = 120/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tuning'));
    expect(screen.getByText(/afinação mestre do concert/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Channel Strips'));
    fireEvent.change(screen.getByLabelText('Pan law'), {
      target: { value: '-6c' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      channelStrips: { panLaw: -6, panLawCompensated: true },
    });

    fireEvent.click(screen.getByText('Metrônomo'));
    fireEvent.click(screen.getByLabelText('Metrônomo ligado'));
    expect(onChange).toHaveBeenLastCalledWith({
      metronome: { ...settings.metronome, enabled: true },
    });
    fireEvent.change(screen.getByLabelText(/Volume do clique/), {
      target: { value: '10' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      metronome: { ...settings.metronome, volumeDb: 0 },
    });
    fireEvent.change(screen.getByLabelText(/Volume do clique/), {
      target: { value: '-99' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      metronome: { ...settings.metronome, volumeDb: -60 },
    });
    fireEvent.click(
      screen.getByLabelText('Acentuar o primeiro tempo do compasso')
    );

    fireEvent.click(screen.getByText('Notes'));
    fireEvent.change(screen.getByPlaceholderText(/Anotações do concert/), {
      target: { value: 'Set list' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ notes: 'Set list' });
  });
});
