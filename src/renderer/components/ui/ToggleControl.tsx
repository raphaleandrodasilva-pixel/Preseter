import React, { useState } from 'react';
import { UiElement } from '@shared/types';

interface UiToggleProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const ToggleControl: React.FC<UiToggleProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [active, setActive] = useState<boolean>(false);

  const toggle = () => {
    const newActive = !active;
    const newValue = newActive ? (element.maxValue || 1) : (element.minValue || 0);
    setActive(newActive);
    onUpdate({ ...element, ...{ value: newValue } });
    if (onControlChange) onControlChange(newValue);

    // MIDI Note On/Off ou CC
    if (element.midiCommand) {
      const { type, channel, controllerNumber } = element.midiCommand;
      if (type === 'cc' && controllerNumber !== undefined) {
        onMidiSend?.([0xb0 | channel, controllerNumber, newActive ? 127 : 0]);
      }
      if (type === 'note' && element.noteNumber !== undefined) {
        onMidiSend?.([newActive ? 0x90 : 0x80 | channel, element.noteNumber, newActive ? 127 : 0]);
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
      <label className="relative inline-flex h-full w-full flex-col items-center justify-center gap-1 cursor-pointer touch-none">
        <input
          type="checkbox"
          className="sr-only"
          checked={active}
          onChange={toggle}
        />
        <div
          className="relative inline-block h-8 w-14 rounded-full transition-all duration-300"
          style={{
            backgroundColor: active ? 'rgba(45,255,106,0.35)' : '#131316',
            border: active ? '1px solid #2DFF6A' : '1px solid #2E2E34',
            boxShadow: active ? '0 0 10px rgba(45,255,106,0.45)' : 'inset 0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className={`absolute top-1 h-6 w-6 rounded-full shadow transition-transform duration-300 ${
              active ? 'translate-x-6' : 'translate-x-1'
            }`}
            style={{ backgroundColor: '#F2F2F2' }}
          />
        </div>
        {element.label && (
          <span className="hw-label" style={{ color: active ? '#EDEDEF' : '#9A9AA0' }}>
            {element.label}
          </span>
        )}
      </label>
    </div>
  );
};
