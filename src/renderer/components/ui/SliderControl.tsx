import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UiElement } from '@shared/types';

interface UiSliderProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const SliderControl: React.FC<UiSliderProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [value, setValue] = useState<number>(element.minValue || 0);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const pos = element.orientation === 'vertical'
      ? 1 - (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    const newValue = element.minValue + Math.max(0, Math.min(1, pos)) * (element.maxValue - element.minValue);
    setValue(newValue);
  }, [dragging, element.orientation, element.minValue, element.maxValue]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragging || !containerRef.current || !e.touches[0]) return;

    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const pos = element.orientation === 'vertical'
      ? 1 - (touch.clientY - rect.top) / rect.height
      : (touch.clientX - rect.left) / rect.width;
    const newValue = element.minValue + Math.max(0, Math.min(1, pos)) * (element.maxValue - element.minValue);
    setValue(newValue);
  }, [dragging, element.orientation, element.minValue, element.maxValue]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', () => setDragging(false));
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', () => setDragging(false));
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', () => setDragging(false));
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', () => setDragging(false));
    };
  }, [dragging, handleMouseMove, handleTouchMove]);

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

  const percentValue = ((value - (element.minValue || 0)) / ((element.maxValue || 1) - (element.minValue || 0))) * 100;

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
      <div className="relative h-full flex flex-col">
        <div className="hw-label mb-1 text-center">
          {element.label}
        </div>
        <div
          className={`relative flex-1 rounded-lg cursor-${element.orientation === 'vertical' ? 'ns-resize' : 'ew-resize'}`}
          style={{
            backgroundColor: '#1F1F21',
            border: '1px solid #3A3A3C',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <div
            className="absolute rounded transition-all"
            style={{
              backgroundColor: '#0A84FF',
              ...(element.orientation === 'vertical'
                ? {
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${percentValue}%`,
                  }
                : {
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${percentValue}%`,
                  }),
            }}
          />
          <div
            className="absolute rounded"
            style={{
              width: element.orientation === 'vertical' ? '100%' : '8px',
              height: element.orientation === 'vertical' ? '20px' : '100%',
              backgroundColor: '#F2F2F2',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5), 0 0 8px rgba(10,132,255,0.35)',
              border: '1px solid #3A3A3C',
              ...(element.orientation === 'vertical'
                ? { bottom: `${percentValue}%`, left: 0, transform: 'translateY(-50%)' }
                : { left: `${percentValue}%`, top: 0, transform: 'translateX(-50%)' }),
            }}
          />
        </div>
        <div className="mt-1 flex justify-center">
          <span className="hw-badge" style={{ fontSize: 10 }}>{value.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
