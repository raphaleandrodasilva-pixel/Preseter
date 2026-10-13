import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UiElement } from '@shared/types';

interface UiKnobProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const KnobControl: React.FC<UiKnobProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [value, setValue] = useState<number>(element.minValue + (element.maxValue - element.minValue) * 0.5);
  const [dragging, setDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
    setStartY(e.touches[0].clientY);
    setStartValue(value);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const delta = startY - clientY;
      const sensitivity = (element.maxValue - element.minValue) / 100;
      const newValue = Math.max(
        element.minValue,
        Math.min(element.maxValue, startValue + delta * sensitivity)
      );
      setValue(newValue);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragging, startY, startValue, element]);

  useEffect(() => {
    onUpdate({ ...element, ...{ value } });
    if (onControlChange) onControlChange(value);

    if (element.midiCommand) {
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

  // Calculate rotation angle based on value
  const angle =
    ((value - element.minValue) / (element.maxValue - element.minValue)) * 270 - 135;
  const norm = (value - element.minValue) / Math.max(element.maxValue - element.minValue, Number.EPSILON);
  const percent = `${Math.round(norm * 100)}%`;

  return (
    <div
      ref={ref}
      className="ui-element absolute"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: 10,
      }}
    >
      <div className="relative h-full flex flex-col items-center justify-center gap-1">
        {element.label && (
          <div className="hw-label text-center" style={{ fontSize: 9 }}>{element.label}</div>
        )}
        <div
          className="relative"
          style={{ width: 84, height: 84 }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {Array.from({ length: 11 }).map((_, i) => {
            const tickAngle = -135 + (i * 270) / 10;
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: 'calc(50% - 1px)',
                  top: 'calc(50% - 1px)',
                  width: 2,
                  height: i % 5 === 0 ? 6 : 4,
                  background: '#3A3A41',
                  transform: `rotate(${tickAngle}deg) translateY(-38px)`,
                  transformOrigin: '50% 50%',
                }}
              />
            );
          })}
          <div
            className={`relative rounded-full flex items-center justify-center transition-all ${
              dragging ? 'scale-110 brightness-125' : ''
            }`}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 56,
              height: 56,
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle at 35% 30%, #2A2A2F, #101013 70%)',
              border: '2px solid #3A3A41',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="absolute"
              style={{
                width: '50%',
                height: '50%',
                transform: `rotate(${angle}deg)`,
              }}
            >
              <div
                className="absolute top-0 left-1/2 rounded-full"
                style={{
                  width: 3,
                  height: 14,
                  transform: 'translateX(-50%)',
                  backgroundColor: '#2DFF6A',
                  boxShadow: '0 0 8px rgba(45,255,106,0.8)',
                }}
              />
            </div>
            <div className="absolute w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#101013' }} />
          </div>
        </div>
        <span className="hw-badge" title={value.toFixed(2)}>{percent}</span>
      </div>
    </div>
  );
};
