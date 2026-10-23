import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiElement } from '@shared/types';
import {
  ButtonControl,
  FaderControl,
  KnobControl,
  LabelControl,
  PadControl,
  PedalControl,
  SliderControl,
  ToggleControl,
} from '.';
import { ModalShell } from './ModalShell';
import { createElement } from '../../../test/fixtures';

function element(overrides: Partial<UiElement> = {}): UiElement {
  return createElement({
    minValue: 0,
    maxValue: 1,
    value: 0.5,
    ...overrides,
  });
}

function props(overrides: Partial<UiElement> = {}): {
  el: UiElement;
  onUpdate: ReturnType<typeof vi.fn>;
  onControlChange: ReturnType<typeof vi.fn>;
  onMidiSend: ReturnType<typeof vi.fn>;
} {
  return {
    el: element(overrides),
    onUpdate: vi.fn(),
    onControlChange: vi.fn(),
    onMidiSend: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ButtonControl', () => {
  it('sends CC press and release for a momentary button', () => {
    const { el, onUpdate, onMidiSend } = props({
      label: 'Press',
      isMomentary: true,
      midiCommand: { type: 'cc', channel: 2, controllerNumber: 20 },
    });
    render(<ButtonControl element={el} onUpdate={onUpdate} onMidiSend={onMidiSend} />);
    const button = screen.getByRole('button', { name: 'Press' });

    fireEvent.pointerDown(button);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ value: 1 }));
    expect(onMidiSend).toHaveBeenCalledWith([0xb2, 20, 127]);

    fireEvent.pointerUp(button);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(onMidiSend).toHaveBeenLastCalledWith([0xb2, 20, 0]);
  });

  it('sends note on/off for a note-bound momentary button', () => {
    const { el, onUpdate, onMidiSend } = props({
      label: 'Note',
      isMomentary: true,
      noteNumber: 64,
      midiCommand: { type: 'note', channel: 1 },
    });
    render(<ButtonControl element={el} onUpdate={onUpdate} onMidiSend={onMidiSend} />);
    const button = screen.getByRole('button', { name: 'Note' });

    fireEvent.pointerDown(button);
    expect(onMidiSend).toHaveBeenCalledWith([0x91, 64, 127]);
    fireEvent.pointerLeave(button);
    expect(onMidiSend).toHaveBeenLastCalledWith([0x81, 64, 0]);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('keeps a non-momentary button on and ignores duplicate presses', () => {
    const { el, onUpdate, onMidiSend } = props({
      label: 'Latch',
      isMomentary: false,
      maxValue: 1,
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 3 },
    });
    render(<ButtonControl element={el} onUpdate={onUpdate} onMidiSend={onMidiSend} />);
    const button = screen.getByRole('button', { name: 'Latch' });

    fireEvent.pointerDown(button);
    fireEvent.pointerDown(button);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onMidiSend).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(button);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onMidiSend).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard activation and release', () => {
    const { el, onUpdate } = props({
      label: 'Keys',
      isMomentary: true,
      minValue: 2,
      maxValue: 9,
    });
    render(<ButtonControl element={el} onUpdate={onUpdate} />);
    const button = screen.getByRole('button', { name: 'Keys' });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({ value: 9 }));
    expect(onUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ value: 2 }));
  });
});

describe('ToggleControl', () => {
  it('toggles value and sends CC', () => {
    const { el, onUpdate, onControlChange, onMidiSend } = props({
      label: 'Toggle',
      minValue: 0,
      maxValue: 1,
      midiCommand: { type: 'cc', channel: 1, controllerNumber: 30 },
    });
    render(
      <ToggleControl
        element={el}
        onUpdate={onUpdate}
        onControlChange={onControlChange}
        onMidiSend={onMidiSend}
      />
    );
    const checkbox = screen.getByRole('checkbox');

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    expect(onControlChange).toHaveBeenLastCalledWith(1);
    expect(onMidiSend).toHaveBeenLastCalledWith([0xb1, 30, 127]);

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(onMidiSend).toHaveBeenLastCalledWith([0xb1, 30, 0]);
  });
});

describe('PadControl', () => {
  it('sends note on/off and control values while pressed', () => {
    const { el, onUpdate, onControlChange, onMidiSend } = props({
      label: 'Pad',
      noteNumber: 67,
      velocity: 90,
      midiCommand: { type: 'note', channel: 3 },
    });
    render(
      <PadControl
        element={el}
        onUpdate={onUpdate}
        onControlChange={onControlChange}
        onMidiSend={onMidiSend}
      />
    );
    const pad = screen.getByRole('button', { name: 'Pad' });

    fireEvent.pointerDown(pad);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ value: 1 }));
    expect(onControlChange).toHaveBeenCalledWith(1);
    expect(onMidiSend).toHaveBeenCalledWith([0x93, 67, 90]);

    fireEvent.pointerUp(pad);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(onMidiSend).toHaveBeenLastCalledWith([0x83, 67, 0]);
  });
});

describe('PedalControl', () => {
  it('maps press and release to the configured range', () => {
    const { el, onUpdate, onControlChange, onMidiSend } = props({
      label: 'Expression',
      minValue: 0,
      maxValue: 1,
      midiCommand: {
        type: 'cc',
        channel: 0,
        controllerNumber: 11,
        min: 10,
        max: 110,
      },
    });
    const { container } = render(
      <PedalControl
        element={el}
        onUpdate={onUpdate}
        onControlChange={onControlChange}
        onMidiSend={onMidiSend}
      />
    );
    const pad = container.querySelector('.cursor-pointer')!;

    fireEvent.mouseDown(pad);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    expect(onMidiSend).toHaveBeenLastCalledWith([0xb0, 11, 110]);

    fireEvent.mouseUp(pad);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(onControlChange).toHaveBeenLastCalledWith(0);
  });
});

describe('KnobControl', () => {
  it('updates by vertical drag and sends scaled CC', async () => {
    const { el, onUpdate, onControlChange, onMidiSend } = props({
      label: 'Cutoff',
      minValue: 0,
      maxValue: 1,
      midiCommand: {
        type: 'cc',
        channel: 2,
        controllerNumber: 74,
        min: 0,
        max: 127,
      },
    });
    const { container } = render(
      <KnobControl
        element={el}
        onUpdate={onUpdate}
        onControlChange={onControlChange}
        onMidiSend={onMidiSend}
      />
    );
    const body = container.querySelector('.relative.rounded-full')!.parentElement!;
    fireEvent.mouseDown(body, { clientY: 100 });
    fireEvent.mouseMove(window, { clientY: 75 });

    await waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0.75 }))
    );
    await waitFor(() => expect(onMidiSend).toHaveBeenLastCalledWith([0xb2, 74, 95]));
  });
});

describe('SliderControl', () => {
  it('clamps vertical drag to the configured range', async () => {
    const { el, onUpdate, onMidiSend } = props({
      label: 'Level',
      minValue: 0,
      maxValue: 1,
      orientation: 'vertical',
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 7 },
    });
    const { container } = render(
      <SliderControl element={el} onUpdate={onUpdate} onMidiSend={onMidiSend} />
    );
    const track = container.querySelector('.cursor-ns-resize')!;
    track.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.mouseDown(track);
    fireEvent.mouseMove(window, { clientY: -20 });
    await waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }))
    );
    await waitFor(() => expect(onMidiSend).toHaveBeenLastCalledWith([0xb0, 7, 127]));
  });
});

describe('FaderControl', () => {
  it('renders range badges and updates on drag', async () => {
    const { el, onUpdate, onControlChange } = props({
      label: 'Fader',
      minValue: 0,
      maxValue: 1,
    });
    const { container } = render(
      <FaderControl
        element={el}
        onUpdate={onUpdate}
        onControlChange={onControlChange}
      />
    );
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
    const track = container.querySelector('.cursor-row-resize')!;
    container.querySelector('.ui-element')!.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.mouseDown(track, { clientY: 20 });
    await act(async () => undefined);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 25 }));
    });
    await waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0.75 }))
    );
    await waitFor(() => expect(onControlChange).toHaveBeenLastCalledWith(0.75));
  });
});

describe('LabelControl and ModalShell', () => {
  it('renders labels with a scaled font and color', () => {
    const { el } = props({ label: 'Hello', width: 80, height: 40, color: '#ff0000' });
    render(<LabelControl element={el} onUpdate={vi.fn()} />);
    const label = screen.getByText('Hello');
    expect(label).toHaveStyle({ color: '#ff0000', fontSize: '10px' });
  });

  it('renders modal content, lcd, footer and closes from backdrop or button', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalShell
        title="Settings"
        lcd="LCD"
        footer={<span>Footer</span>}
        onClose={onClose}
      >
        <p>Body</p>
      </ModalShell>
    );
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('LCD')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Fechar (Esc)'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(container.firstChild!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
