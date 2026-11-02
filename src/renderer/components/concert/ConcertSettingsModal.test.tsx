import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConcertSettingsModal } from './ConcertSettingsModal';
import { createConcertSettings } from '../../../test/fixtures';

function setup() {
  const onChange = vi.fn();
  const onTempoChange = vi.fn();
  const onClose = vi.fn();
  const settings = createConcertSettings();
  const result = render(
    <ConcertSettingsModal
      settings={settings}
      tempo={120}
      onChange={onChange}
      onTempoChange={onTempoChange}
      midiInputNames={['Keys']}
      onClose={onClose}
    />
  );
  return { ...result, onChange, onTempoChange, onClose, settings };
}

describe('ConcertSettingsModal', () => {
  it('abre na aba do metrônomo com compasso e volume editáveis', () => {
    const { onChange, onTempoChange, settings } = setup();

    expect(screen.getByText('Ajustes do concert')).toBeInTheDocument();
    expect(screen.getByText('4/4 · 120 BPM')).toBeInTheDocument();
    expect(screen.getByLabelText('Metrônomo ligado')).toBeInTheDocument();

    const bpm = screen.getByLabelText(/Tempo \(BPM\)/);
    fireEvent.change(bpm, { target: { value: '140' } });
    fireEvent.blur(bpm);
    expect(onTempoChange).toHaveBeenCalledWith(140);

    const numerator = screen.getByLabelText(/Compasso — numerador/);
    fireEvent.change(numerator, { target: { value: '6' } });
    fireEvent.blur(numerator);
    expect(onChange).toHaveBeenLastCalledWith({
      timeSignature: { ...settings.timeSignature, numerator: 6 },
    });

    fireEvent.change(screen.getByLabelText(/Compasso — denominador/), {
      target: { value: '8' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      timeSignature: { ...settings.timeSignature, denominator: 8 },
    });

    const volume = screen.getByLabelText(/Valor do volume/);
    fireEvent.change(volume, { target: { value: '-18' } });
    fireEvent.blur(volume);
    expect(onChange).toHaveBeenLastCalledWith({
      metronome: { ...settings.metronome, volumeDb: -18 },
    });
  });

  it('fecha com Esc', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
