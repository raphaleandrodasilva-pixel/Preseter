import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardControl } from './KeyboardControl';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('KeyboardControl', () => {
  it('renders a split keyboard, keys, wheels and octave controls', () => {
    render(<KeyboardControl />);
    expect(screen.getByText('Piano')).toBeInTheDocument();
    expect(screen.getByText('Strings')).toBeInTheDocument();
    expect(screen.getByTitle('C4 (60)')).toBeInTheDocument();
    expect(screen.getByTitle('Pitch')).toBeInTheDocument();
    expect(screen.getByTitle('Mod')).toBeInTheDocument();
    expect(screen.getByTitle('Oitava abaixo')).toBeInTheDocument();
    expect(screen.getByTitle('Oitava acima')).toBeInTheDocument();
    expect(screen.getByText('C2 – C6')).toBeInTheDocument();
  });

  it('presses and releases keys, including glide between notes', () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    render(<KeyboardControl onNoteOn={onNoteOn} onNoteOff={onNoteOff} />);
    const c4 = screen.getByTitle('C4 (60)');
    const d4 = screen.getByTitle('D4 (62)');

    fireEvent.pointerDown(c4, { pointerId: 1, buttons: 1 });
    expect(onNoteOn).toHaveBeenLastCalledWith(60, 100);
    expect(c4).toHaveClass('stg-keylit');

    fireEvent.pointerEnter(d4, { pointerId: 1, buttons: 1 });
    expect(onNoteOff).toHaveBeenCalledWith(60);
    expect(onNoteOn).toHaveBeenLastCalledWith(62, 100);

    fireEvent.pointerUp(d4, { pointerId: 1 });
    expect(onNoteOff).toHaveBeenLastCalledWith(62);
    expect(d4).not.toHaveClass('stg-keylit');
  });

  it('ignores pointer input when non-interactive', () => {
    const onNoteOn = vi.fn();
    render(<KeyboardControl interactive={false} onNoteOn={onNoteOn} />);
    fireEvent.pointerDown(screen.getByTitle('C4 (60)'), { pointerId: 1, buttons: 1 });
    expect(onNoteOn).not.toHaveBeenCalled();
    expect(screen.getByTitle('Oitava abaixo')).toBeDisabled();
  });

  it('lights notes supplied by external MIDI', () => {
    render(<KeyboardControl activeNotes={new Set([60, 61])} />);
    expect(screen.getByTitle('C4 (60)')).toHaveClass('stg-keylit');
    expect(screen.getByTitle('C#4 (61)')).toHaveClass('stg-blacklit');
  });

  it('bends pitch and moves modulation from wheel drags', () => {
    const onPitchBend = vi.fn();
    const onModulation = vi.fn();
    render(
      <KeyboardControl onPitchBend={onPitchBend} onModulation={onModulation} />
    );

    const pitch = screen.getByTitle('Pitch');
    fireEvent.pointerDown(pitch, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(pitch, { pointerId: 1, clientY: 40 });
    expect(onPitchBend).toHaveBeenLastCalledWith(1);
    fireEvent.pointerUp(pitch, { pointerId: 1 });
    expect(onPitchBend).toHaveBeenLastCalledWith(0);

    const mod = screen.getByTitle('Mod');
    fireEvent.pointerDown(mod, { pointerId: 2, clientY: 100 });
    fireEvent.pointerMove(mod, { pointerId: 2, clientY: 60 });
    expect(onModulation).toHaveBeenLastCalledWith(0.3333333333333333);
    fireEvent.pointerCancel(mod, { pointerId: 2 });
  });

  it('shifts octaves in both directions', () => {
    render(<KeyboardControl octaveShift />);
    fireEvent.click(screen.getByTitle('Oitava acima'));
    expect(screen.getByText('C3 – C7')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Oitava abaixo'));
    expect(screen.getByText('C2 – C6')).toBeInTheDocument();
  });

  it('renders clickable zones and selects one', () => {
    const onZoneClick = vi.fn();
    render(
      <KeyboardControl
        low={48}
        high={72}
        splitNote={null}
        selectedZoneId="lower"
        onZoneClick={onZoneClick}
        zones={[
          { id: 'lower', label: 'Piano', low: 48, high: 59, color: '#111111' },
          { id: 'upper', label: 'Strings', low: 60, high: 72, color: '#222222' },
        ]}
      />
    );

    const lower = screen.getByTitle('Piano · C3–B3');
    expect(lower.style.border).toContain('1px solid');
    fireEvent.click(lower);
    expect(onZoneClick).toHaveBeenCalledWith('lower');
    expect(screen.getByTitle('Strings · C4–C5')).toBeInTheDocument();
  });

  it('uses the compact foot label and hides the split bar', () => {
    render(<KeyboardControl compact foot="canal 4" splitNote={null} />);
    expect(screen.getByText('canal 4')).toBeInTheDocument();
    expect(screen.queryByText('Piano')).not.toBeInTheDocument();
  });
});
