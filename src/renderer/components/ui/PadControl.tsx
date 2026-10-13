import React, { useRef, useState } from 'react';
import { UiElement } from '@shared/types';

interface UiPadProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const PadControl: React.FC<UiPadProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);

  const handlePress = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (pressedRef.current) return;

    pressedRef.current = true;
    setPressed(true);
    const velocity = element.velocity ?? 100;
    const newValue = 1;

    onUpdate({ ...element, ...{ value: newValue } });
    if (onControlChange) onControlChange(newValue);

    if (element.midiCommand && element.noteNumber !== undefined) {
      const { type, channel } = element.midiCommand;
      if (type === 'note') {
        onMidiSend?.([0x90 | channel, element.noteNumber, velocity]);
      }
    }
  };

  const handleRelease = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;

    setPressed(false);
    const newValue = 0;
    onUpdate({ ...element, ...{ value: newValue } });
    if (onControlChange) onControlChange(newValue);

    if (element.midiCommand && element.noteNumber !== undefined) {
      const { type, channel } = element.midiCommand;
      if (type === 'note') {
        onMidiSend?.([0x80 | channel, element.noteNumber, 0]);
      }
    }
  };

  return (
    <div
      className="ui-element absolute"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: 10,
      }}
    >
      <button
        type="button"
        onPointerDown={handlePress}
        onPointerUp={handleRelease}
        onPointerLeave={handleRelease}
        onPointerCancel={handleRelease}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) handlePress(e);
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') handleRelease();
        }}
        onBlur={handleRelease}
        className={`
          hw-squarebtn hw-pad-face relative flex h-full w-full items-center justify-center text-center font-semibold transition-all duration-100
          ${pressed ? 'on scale-95' : ''}
        `}
        style={{
          color: pressed ? '#fff' : '#EDEDEF',
          borderColor: pressed ? '#2DFF6A' : '#2E2E34',
          background: pressed ? 'rgba(45,255,106,0.30)' : undefined,
          boxShadow: pressed ? '0 0 12px rgba(45,255,106,0.45)' : undefined,
        }}
      >
        {element.label || (element.noteNumber ?? '').toString()}
      </button>
    </div>
  );
};
