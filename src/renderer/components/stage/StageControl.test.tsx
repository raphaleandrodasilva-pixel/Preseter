import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiElement } from '@shared/types';
import { StageControl } from './StageControl';
import { createElement } from '../../../test/fixtures';

function renderControl(
  overrides: Partial<UiElement> = {},
  extra: Partial<React.ComponentProps<typeof StageControl>> = {}
): {
  container: HTMLElement;
  onMidiMessage: ReturnType<typeof vi.fn>;
  onSetVstParameter: ReturnType<typeof vi.fn>;
} {
  const onMidiMessage = vi.fn();
  const onSetVstParameter = vi.fn();
  const { container } = render(
    <StageControl
      element={createElement({ minValue: 0, maxValue: 1, value: 0.5, ...overrides })}
      channel={0}
      onMidiMessage={onMidiMessage}
      onSetVstParameter={onSetVstParameter}
      {...extra}
    />
  );
  return { container, onMidiMessage, onSetVstParameter };
}

function rect(): DOMRect {
  return {
    top: 0,
    left: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('StageControl value controls', () => {
  it('drags a knob, maps the normalized value and resets on double click', () => {
    const { onMidiMessage, onSetVstParameter } = renderControl(
      {
        type: 'knob',
        label: 'Cutoff',
        pluginPath: 'C:/p.vst3',
        parameterId: 'cutoff',
        mappingMin: 0,
        mappingMax: 100,
        midiCommand: { type: 'cc', channel: 2, controllerNumber: 74 },
      },
      { resetValue: 0.25 }
    );

    const knob = screen.getByTitle(/arrastar para girar/);
    fireEvent.pointerDown(knob, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 25, pointerId: 1, buttons: 1 });

    expect(onSetVstParameter).toHaveBeenLastCalledWith('C:/p.vst3', 'cutoff', 100);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0xb2, 74, 127]);

    fireEvent.doubleClick(knob);
    expect(onSetVstParameter).toHaveBeenLastCalledWith('C:/p.vst3', 'cutoff', 25);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0xb2, 74, 32]);
  });

  it('maps fader and slider tracks using their rectangle', () => {
    const fader = renderControl({
      type: 'fader',
      label: 'Level',
      pluginPath: 'C:/p.vst3',
      parameterId: 'level',
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 7 },
    });
    const faderTrack = fader.container.querySelector('[title*="arrastar"]')!;
    faderTrack.getBoundingClientRect = rect;
    fireEvent.pointerDown(faderTrack, { clientY: 20, pointerId: 1 });
    expect(fader.onMidiMessage).toHaveBeenLastCalledWith([0xb0, 7, 102]);

    const slider = renderControl({
      type: 'slider',
      label: 'Pan',
      pluginPath: 'C:/p.vst3',
      parameterId: 'pan',
      midiCommand: { type: 'cc', channel: 1, controllerNumber: 10 },
    });
    const sliderTrack = slider.container.querySelector('[title*="arrastar"]')!;
    sliderTrack.getBoundingClientRect = rect;
    fireEvent.pointerDown(sliderTrack, { clientX: 25, pointerId: 1 });
    expect(slider.onMidiMessage).toHaveBeenLastCalledWith([0xb1, 10, 32]);
  });

  it('clamps values and sends no MIDI without a CC binding', () => {
    const { onMidiMessage } = renderControl({ type: 'fader', label: 'Fader' });
    const track = screen.getByTitle(/arrastar.*duplo clique/);
    track.getBoundingClientRect = rect;
    fireEvent.pointerDown(track, { clientY: -50, pointerId: 1 });
    expect(onMidiMessage).not.toHaveBeenCalled();
  });
});

describe('StageControl buttons', () => {
  it('sends note on for a button and schedules note off for momentary controls', () => {
    vi.useFakeTimers();
    const { onMidiMessage } = renderControl({
      type: 'button',
      label: 'Hit',
      isMomentary: true,
      velocity: 80,
      noteNumber: 62,
      midiCommand: { type: 'note', channel: 3 },
    });
    fireEvent.click(screen.getByTitle('Hit'));
    expect(onMidiMessage).toHaveBeenCalledWith([0x93, 62, 80]);
    vi.advanceTimersByTime(120);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0x83, 62, 0]);
  });

  it('sends program change for a pad bound to PC', () => {
    const { onMidiMessage } = renderControl({
      type: 'pad',
      label: 'Patch',
      midiCommand: { type: 'pc', channel: 1, programNumber: 12 },
    });
    fireEvent.click(screen.getByTitle('Patch'));
    expect(onMidiMessage).toHaveBeenCalledWith([0xc1, 12]);
  });

  it('toggles between min and max and activates its MIDI binding', () => {
    const { onMidiMessage } = renderControl({
      type: 'toggle',
      label: 'On',
      isMomentary: false,
      value: 0,
      midiCommand: { type: 'note', channel: 0 },
      noteNumber: 64,
    });
    const toggle = screen.getByTitle('On');
    fireEvent.click(toggle);
    expect(onMidiMessage).toHaveBeenCalledWith([0x90, 64, 100]);
    fireEvent.click(toggle);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0x90, 64, 100]);
  });

  it('presses a momentary pedal and sends min on release', () => {
    const { onMidiMessage } = renderControl({
      type: 'pedal',
      label: 'Sustain',
      isMomentary: true,
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 64 },
    });
    const pedal = screen.getByTitle('Sustain');
    fireEvent.pointerDown(pedal);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0xb0, 64, 127]);
    fireEvent.pointerUp(pedal);
    expect(onMidiMessage).toHaveBeenLastCalledWith([0xb0, 64, 0]);
  });
});

describe('StageControl static faces', () => {
  it('renders labels, meters and activity indicators', () => {
    const label = renderControl({ type: 'label', label: 'Welcome' });
    expect(label.container).toHaveTextContent('Welcome');

    const meter = renderControl({ type: 'meter-vertical', label: 'Level', value: 0.7 });
    expect(meter.container).toHaveTextContent('Level');

    const activity = renderControl({ type: 'midi-activity', label: 'MIDI' });
    expect(activity.container).toHaveTextContent('MIDI');
  });

  it('renders a non-momentary pedal and updates it by drag', () => {
    const { onMidiMessage } = renderControl({
      type: 'pedal',
      label: 'Expression',
      isMomentary: false,
      midiCommand: { type: 'cc', channel: 0, controllerNumber: 11 },
    });
    const pedal = screen.getByTitle(/arraste para cima/);
    pedal.getBoundingClientRect = rect;
    fireEvent.pointerDown(pedal, { clientY: 25, pointerId: 1 });
    expect(onMidiMessage).toHaveBeenLastCalledWith([0xb0, 11, 95]);
  });

  it('wires playback buttons to their callbacks', () => {
    const onLoadPlayback = vi.fn();
    const onPlayPlayback = vi.fn();
    const onStopPlayback = vi.fn();
    renderControl(
      { type: 'playback', label: 'Playback' },
      {
        playbackState: null,
        onLoadPlayback,
        onPlayPlayback,
        onStopPlayback,
      }
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    expect(onLoadPlayback).toHaveBeenCalled();
    expect(onPlayPlayback).toHaveBeenCalled();
    expect(onStopPlayback).toHaveBeenCalled();
  });
});
