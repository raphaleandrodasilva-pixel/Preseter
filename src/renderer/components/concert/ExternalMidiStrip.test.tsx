import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExternalMidiStrip } from './ExternalMidiStrip';
import type { PresetPluginAssignment } from '@shared/types';

afterEach(cleanup);

function assignment(values: Record<string, number> = { cutoff: 64 }): PresetPluginAssignment {
  return {
    pluginId: 'external-midi:1',
    layerId: 'layer_1',
    name: 'Motif Part 1',
    path: '',
    role: 'instrument',
    externalMidi: {
      portName: 'MOTIF-RACK',
      channel: 0,
      program: { bankMsb: 63, pc: 12 },
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
      values,
    },
  };
}

describe('ExternalMidiStrip', () => {
  it('sends the control live when the slider moves', () => {
    const onChange = vi.fn();
    const onSend = vi.fn();
    const { container } = render(
      <ExternalMidiStrip
        assignment={assignment()}
        editable
        enabled
        selected={false}
        onSelect={() => undefined}
        onRemove={() => undefined}
        onEdit={() => undefined}
        onChange={onChange}
        onSend={onSend}
      />
    );

    fireEvent.change(container.querySelector('input[type="range"]')!, {
      target: { value: '90' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ cutoff: 90 }),
      })
    );
    expect(onSend).toHaveBeenCalledWith('MOTIF-RACK', [0xb0, 74, 90]);
  });

  it('does not send when the feature is off', () => {
    const onSend = vi.fn();
    const { container } = render(
      <ExternalMidiStrip
        assignment={assignment()}
        editable
        enabled={false}
        selected={false}
        onSelect={() => undefined}
        onRemove={() => undefined}
        onEdit={() => undefined}
        onChange={() => undefined}
        onSend={onSend}
      />
    );

    fireEvent.change(container.querySelector('input[type="range"]')!, {
      target: { value: '90' },
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/MIDI externo desligado/)).toBeInTheDocument();
  });
});
