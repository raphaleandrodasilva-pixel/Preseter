import React, { useState, useRef, useEffect } from 'react';
import { UiElement } from '@shared/types';

interface UiPedalProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const PedalControl: React.FC<UiPedalProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [value, setValue] = useState<number>(element.minValue || 0);
  const [pressing, setPressing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePress = () => {
    setPressing(true);
    setValue(element.maxValue || 1);
  };

  const handleRelease = () => {
    setPressing(false);
    setValue(element.minValue || 0);
  };

  useEffect(() => {
    onUpdate({ ...element, ...{ value } });
    if (onControlChange) onControlChange(value);

    if (element.midiCommand && value > 0) {
      const { type, channel, controllerNumber, min, max } = element.midiCommand;
      if (type === 'cc' && controllerNumber !== undefined) {
        const midiValue = Math.floor(
          (min !== undefined ? min : 0) +
          value * ((max !== undefined ? max : 127) - (min !== undefined ? min : 0))
        );
        onMidiSend?.([0xb0 | channel, controllerNumber, midiValue]);
      }
    }
  }, [value, element, onUpdate, onControlChange, onMidiSend]);

  return (
    <div
      ref={containerRef}
      className="ui-element absolute"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: 10,
      }}
    >
      <div className="relative h-full flex flex-col items-center">
        <div
          className="hw-squarebtn relative w-full cursor-pointer touch-none"
          style={{
            height: '80%',
            borderRadius: '6px 6px 10px 10px',
            borderColor: pressing ? '#2DFF6A' : '#2E2E34',
            background: pressing ? 'rgba(45,255,106,0.25)' : 'linear-gradient(to bottom, #26262B, #131316)',
            boxShadow: pressing ? '0 0 10px rgba(45,255,106,0.45)' : undefined,
          }}
          onMouseDown={handlePress}
          onMouseUp={handleRelease}
          onMouseLeave={handleRelease}
          onTouchStart={handlePress}
          onTouchEnd={handleRelease}
        >
          <div
            className="absolute bottom-0 left-0 right-0 transition-all"
            style={{
              height: pressing ? '100%' : '0%',
              backgroundColor: '#2DFF6A',
              opacity: pressing ? 0.35 : 0,
              borderRadius: '0 0 8px 8px',
            }}
          />

          <div
            className="absolute top-1 right-1 w-2 h-2 rounded-full transition-all"
            style={{
              backgroundColor: pressing ? '#2DFF6A' : '#2E2E34',
              boxShadow: pressing ? '0 0 8px #2DFF6A' : 'none',
            }}
          />
        </div>
        {element.label && (
          <div className="hw-label mt-1 text-center">{element.label}</div>
        )}
        <div className="mt-0.5 flex justify-center">
          <span className="hw-badge" style={{ fontSize: 10 }}>{value.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
