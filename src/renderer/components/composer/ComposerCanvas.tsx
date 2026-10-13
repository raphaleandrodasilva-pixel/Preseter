import React, { useRef } from 'react';
import type { UiElement } from '@shared/types';
import { StageControl } from '../stage/StageControl';
import { KeyboardControl } from '../stage/KeyboardControl';
import { ActivityFace, ButtonFace, FaderFace, KnobFace, LabelFace, MeterFace, PadFace, PedalFace, SliderFace, ToggleFace } from '../stage/faces';
import { DRAG_MIME } from './ControlPalette';
import { snap8 } from './elementFactory';

interface ComposerCanvasProps {
  elements: UiElement[];
  selectedId: string | null;
  armed: boolean;
  locked: boolean;
  interactivePreview: boolean;
  channel: number;
  onCanvasClick: (x: number, y: number) => void;
  onDropKey: (key: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
}

function PreviewShape({ element }: { element: UiElement }) {
  const min = element.minValue ?? 0;
  const max = element.maxValue ?? 1;
  const value = element.value ?? 0.5;
  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, Number.EPSILON)));
  const isOn = value >= (min + max) / 2;

  switch (element.type) {
    case 'knob':
      return <KnobFace label={element.label} norm={norm} />;
    case 'fader':
      return <FaderFace label={element.label} norm={norm} />;
    case 'slider':
      return <SliderFace label={element.label} norm={norm} />;
    case 'pedal':
      return <PedalFace label={element.label} active={isOn} />;
    case 'toggle':
      return <ToggleFace label={element.label} on={isOn} />;
    case 'pad':
      return <PadFace label={element.label} />;
    case 'button':
      return <ButtonFace label={element.label} />;
    case 'meter-vertical':
      return <MeterFace label={element.label} norm={norm} horizontal={element.orientation === 'horizontal'} />;
    case 'midi-activity':
      return <ActivityFace label={element.label} />;
    case 'label':
      return <LabelFace label={element.label} />;
    case 'keyboard': {
      return (
        <KeyboardControl
          low={element.keyboardLow ?? 36}
          high={element.keyboardHigh ?? 84}
          splitNote={element.keyboardSplit ?? null}
          lowerLabel={element.keyboardLowerLabel ?? 'Lower'}
          upperLabel={element.keyboardUpperLabel ?? 'Upper'}
          lowerColor={element.keyboardLowerColor ?? '#2DFF6A'}
          upperColor={element.keyboardUpperColor ?? '#F2F2F2'}
          compact
          interactive={false}
          foot={element.label}
        />
      );
    }
    default:
      return <span className="hw-label">{element.label}</span>;
  }
}

interface CanvasElementProps {
  element: UiElement;
  selected: boolean;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
}

const CanvasElement: React.FC<CanvasElementProps> = ({ element, selected, locked, onSelect, onMove, onResize }) => {
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizing = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null);

  return (
    <div
      onPointerDown={(event) => {
        if (locked) return;
        if ((event.target as HTMLElement).closest('input,button,[data-resize]')) return;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startY: event.clientY, originX: element.x, originY: element.y };
        onSelect(element.id);
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        onMove(
          element.id,
          snap8(Math.max(0, d.originX + event.clientX - d.startX)),
          snap8(Math.max(0, d.originY + event.clientY - d.startY))
        );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
        resizing.current = null;
      }}
      className={`absolute flex cursor-move select-none flex-col items-center justify-center rounded-lg border px-2 py-1 text-center shadow-lg ${
        selected ? 'ring-2' : ''
      } ${element.type === 'label' ? 'border-transparent bg-transparent' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        color: element.color,
        background: element.type === 'label' ? 'transparent' : '#1C1C1F',
        borderColor: element.type === 'label' ? 'transparent' : '#2E2E34',
        ...(selected ? { boxShadow: '0 0 0 2px #2DFF6A' } : {}),
      }}
    >
      <PreviewShape element={element} />
      {selected && !locked && (
        <span
          data-resize
          title="Redimensionar"
          onPointerDown={(event) => {
            event.stopPropagation();
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            resizing.current = { startX: event.clientX, startY: event.clientY, originW: element.width, originH: element.height };
          }}
          onPointerMove={(event) => {
            const r = resizing.current;
            if (!r) return;
            const minW = element.type === 'keyboard' ? 560 : 40;
            const minH = element.type === 'keyboard' ? 180 : 28;
            onResize(
              element.id,
              snap8(Math.max(minW, r.originW + event.clientX - r.startX)),
              snap8(Math.max(minH, r.originH + event.clientY - r.startY))
            );
          }}
          onPointerUp={() => {
            resizing.current = null;
          }}
          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-[#2E2E34] bg-[#2DFF6A]"
        />
      )}
    </div>
  );
};

export const ComposerCanvas: React.FC<ComposerCanvasProps> = ({
  elements,
  selectedId,
  armed,
  locked,
  interactivePreview,
  channel,
  onCanvasClick,
  onDropKey,
  onSelect,
  onMove,
  onResize,
  onMidiMessage,
  onSetVstParameter,
}) => {
  const coordsOf = (clientX: number, clientY: number, currentTarget: HTMLDivElement) => {
    const rect = currentTarget.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  return (
    <div
      onClick={(event) => {
        if (locked || !armed || event.target !== event.currentTarget) return;
        const { x, y } = coordsOf(event.clientX, event.clientY, event.currentTarget);
        onCanvasClick(x, y);
      }}
      onDragOver={(event) => {
        if (!locked) event.preventDefault();
      }}
      onDrop={(event) => {
        if (locked) return;
        event.preventDefault();
        const key = event.dataTransfer.getData(DRAG_MIME);
        if (!key) return;
        const { x, y } = coordsOf(event.clientX, event.clientY, event.currentTarget);
        onDropKey(key, x, y);
      }}
      className={`relative min-h-[520px] min-w-[680px] overflow-hidden rounded-lg border border-[#26262B] bg-[#101013] ${
        armed && !locked ? 'cursor-crosshair' : ''
      }`}
      style={{
        backgroundImage:
          'linear-gradient(rgba(154,154,160,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(154,154,160,.06) 1px,transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      {interactivePreview
        ? elements.map((element) => (
            <StageControl
              key={element.id}
              element={element}
              channel={channel}
              layoutMode="absolute"
              onMidiMessage={onMidiMessage}
              onSetVstParameter={onSetVstParameter}
            />
          ))
        : elements.map((element) => (
            <CanvasElement
              key={element.id}
              element={element}
              selected={element.id === selectedId}
              locked={locked}
              onSelect={onSelect}
              onMove={onMove}
              onResize={onResize}
            />
          ))}
      {!locked && (
        <button
          className="absolute left-2 top-2 rounded bg-transparent px-2 py-1 text-[10px] text-[#9A9AA0] hover:text-[#F2F2F2]"
          onClick={() => onSelect(null)}
          title="Desselecionar"
        >
          ✕
        </button>
      )}
      {elements.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-[#9A9AA0]">
          {armed
            ? 'Clique para posicionar o controle — ou solte aqui o item arrastado da paleta.'
            : 'Arraste um controle da paleta para cá, ou clique nele e depois clique aqui.'}
        </div>
      )}
    </div>
  );
};
