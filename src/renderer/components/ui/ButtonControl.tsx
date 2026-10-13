import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UiElement } from '@shared/types';

interface UiButtonProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const ButtonControl: React.FC<UiButtonProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);

  const handlePress = (e?: React.SyntheticEvent) => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    e?.preventDefault();
    const newValue = element.midiCommand ? 1 : (element.maxValue || 1);
    onUpdate({ ...element, ...{ value: newValue } });

    if (element.midiCommand) {
      const { type, channel, controllerNumber } = element.midiCommand;
      if (type === 'cc' && controllerNumber !== undefined) {
        onMidiSend?.([0xb0 | channel, controllerNumber, 127]);
      }
      if (type === 'note' && element.noteNumber !== undefined) {
        onMidiSend?.([0x90 | channel, element.noteNumber, 127]);
      }
    }

    setPressed(true);
  };

  const handleRelease = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setPressed(false);
    if (!element.isMomentary) return;

    const newValue = element.midiCommand ? 0 : (element.minValue || 0);
    onUpdate({ ...element, ...{ value: newValue } });

    if (element.midiCommand) {
      const { type, channel, controllerNumber } = element.midiCommand;
      if (type === 'cc' && controllerNumber !== undefined) {
        onMidiSend?.([0xb0 | channel, controllerNumber, 0]);
      }
      if (type === 'note' && element.noteNumber !== undefined) {
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
        className={`hw-squarebtn hw-button-face relative h-full w-full text-base font-semibold transition-all duration-150 ${
          pressed ? 'on scale-95' : ''
        }`}
        style={{
          color: pressed ? '#fff' : '#EDEDEF',
          borderColor: pressed ? '#2DFF6A' : '#2E2E34',
        }}
      >
        {element.label}
      </button>
    </div>
  );
};

interface UiFaderProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onControlChange?: (value: number) => void;
  onMidiSend?: (message: number[]) => void;
}

export const FaderControl: React.FC<UiFaderProps> = ({ element, onUpdate, onControlChange, onMidiSend }) => {
  const [value, setValue] = useState<number>(element.minValue ?? 0);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  const handleDrag = useCallback((clientY: number) => {
    if (!containerRef.current || !dragging) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const newValue = 1 - Math.max(0, Math.min(1, y / rect.height));
    const scaledValue = element.minValue + newValue * (element.maxValue - element.minValue);
    setValue(scaledValue);
  }, [dragging, element]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      handleDrag(e.clientY);
    }
  }, [dragging, handleDrag]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', () => setDragging(false));
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [dragging, handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    handleDrag(e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
    handleDrag(e.touches[0].clientY);
  };

  useEffect(() => {
    if (value !== (element.minValue ?? 0) || true) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
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
      });
    }
  }, [value, element, onUpdate, onControlChange, onMidiSend]);

  const valueRatio = element.maxValue - element.minValue;
  const percentValue = ((value - element.minValue) / valueRatio) * 100;

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
      <div className="relative h-full flex flex-col justify-between">
        <div className="hw-badge mx-auto" style={{ fontSize: 10 }}>{element.maxValue.toFixed(2)}</div>
        <div
          className="relative w-full rounded-lg cursor-row-resize touch-none"
          style={{
            height: 'calc(100% - 32px)',
            backgroundColor: '#131316',
            border: '1px solid #2E2E34',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div
            className="absolute w-full rounded transition-all"
            style={{
              bottom: 0,
              height: `${percentValue}%`,
              backgroundColor: '#2DFF6A',
            }}
          />
          <div
            className="absolute rounded transition-all"
            style={{
              bottom: `${percentValue}%`,
              left: '50%',
              transform: 'translateX(-50%) translateY(-50%)',
              width: '80%',
              height: '20px',
              backgroundColor: '#F2F2F2',
              border: '1px solid #2E2E34',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            }}
          />
        </div>
        <div className="hw-badge mx-auto" style={{ fontSize: 10 }}>{element.minValue.toFixed(2)}</div>
      </div>
      {element.label && (
        <div className="hw-label absolute -bottom-6 left-1/2 -translate-x-1/2 text-center">
          {element.label}
        </div>
      )}
    </div>
  );
};
