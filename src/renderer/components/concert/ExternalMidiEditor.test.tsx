import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExternalMidiEditor } from './ExternalMidiEditor';
import type { ExternalMidiConfig } from '@shared/external-midi';

afterEach(cleanup);

function renderEditor(initialConfig: ExternalMidiConfig | null = null, initialName = 'Motif') {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ExternalMidiEditor
      title="Timbre MIDI externo"
      initialName={initialName}
      initialConfig={initialConfig}
      ports={['MOTIF-RACK', 'CASIO USB-MIDI']}
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
}

describe('ExternalMidiEditor', () => {
  it('creates a timbre with a CC control', () => {
    const { onSave } = renderEditor();
    fireEvent.click(screen.getByText('+ Adicionar controle'));
    fireEvent.click(screen.getByText('Salvar timbre'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [name, config] = onSave.mock.calls[0];
    expect(name).toBe('Motif');
    expect(config.portName).toBe('MOTIF-RACK');
    expect(config.controls).toHaveLength(1);
    expect(config.controls[0].message).toMatchObject({ type: 'cc', cc: 74, bits: 7 });
  });

  it('edits an existing program and control', () => {
    const { onSave } = renderEditor(
      {
        portName: 'MOTIF-RACK',
        channel: 1,
        program: { bankMsb: 63, bankLsb: 0, pc: 12 },
        controls: [
          {
            id: 'cutoff',
            name: 'Cutoff',
            min: 0,
            max: 127,
            default: 80,
            message: { type: 'cc', cc: 74 },
          },
        ],
        values: { cutoff: 80 },
      },
      'Motif Part 1'
    );

    fireEvent.change(screen.getByDisplayValue('Motif Part 1'), {
      target: { value: 'Motif Piano' },
    });
    fireEvent.click(screen.getByText('Salvar timbre'));

    expect(onSave).toHaveBeenCalledWith(
      'Motif Piano',
      expect.objectContaining({
        portName: 'MOTIF-RACK',
        channel: 1,
        program: { bankMsb: 63, bankLsb: 0, pc: 12 },
        controls: [expect.objectContaining({ id: 'cutoff', name: 'Cutoff' })],
      })
    );
  });

  it('shows an error for an invalid 14-bit CC', () => {
    const { onSave } = renderEditor({
      portName: 'MOTIF-RACK',
      channel: 0,
      controls: [
        {
          id: 'bad',
          name: 'Bad',
          message: { type: 'cc', cc: 100, bits: 14 },
        },
      ],
    });

    fireEvent.click(screen.getByText('Salvar timbre'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/95/)).toBeInTheDocument();
  });
});
