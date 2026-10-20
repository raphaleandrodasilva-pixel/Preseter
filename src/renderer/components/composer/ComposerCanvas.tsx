import React, { useRef } from 'react';
import type { PlaybackState, UiElement } from '@shared/types';
import { StageControl } from '../stage/StageControl';
import { KeyboardControl } from '../stage/KeyboardControl';
import type { KeyboardZone } from '../stage/KeyboardControl';
import { ActivityFace, ButtonFace, DrawbarFace, FaderFace, KnobFace, LabelFace, MeterFace, PadFace, PedalFace, PlaybackFace, SliderFace, ToggleFace } from '../stage/faces';
import { DRAG_MIME } from './ControlPalette';
import { snap8 } from './elementFactory';

interface ComposerCanvasProps {
  elements: UiElement[];
  selectedId: string | null;
  armed: boolean;
  locked: boolean;
  /** No Edit o controle pode ser selecionado, mas não arrastado/redimensionado. */
  movable?: boolean;
  /** No Edit, o teclado continua tocando; os demais controles só selecionam. */
  previewKeyboard?: boolean;
  /** Zoom aplicado pelo workspace para caber todos os controles. */
  scale?: number;
  /** Tamanho lógico do canvas (antes do zoom). */
  canvasWidth?: number;
  canvasHeight?: number;
  /** Avisa quando um controle começa/termina de ser arrastado ou redimensionado. */
  onInteractionChange?: (active: boolean) => void;
  interactivePreview: boolean;
  channel: number;
  onCanvasClick: (x: number, y: number) => void;
  onDropKey: (key: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
  keyboardZones?: KeyboardZone[];
  selectedZoneId?: string | null;
  onZoneClick?: (id: string) => void;
  playbackState?: PlaybackState | null;
  onLoadPlayback?: () => void;
  onPlayPlayback?: () => void;
  onStopPlayback?: () => void;
}

function PreviewShape({ element, playbackState }: { element: UiElement; playbackState?: PlaybackState | null }) {
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
    case 'drawbar':
      return <DrawbarFace label={element.label} value={value} max={max} />;
    case 'playback':
      return <PlaybackFace state={playbackState} />;
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
          lowerColor={element.keyboardLowerColor ?? '#0A84FF'}
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
  movable: boolean;
  scale: number;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onInteractionChange?: (active: boolean) => void;
  playbackState?: PlaybackState | null;
}

const CanvasElement: React.FC<CanvasElementProps> = ({
  element,
  selected,
  locked,
  movable,
  scale,
  onSelect,
  onMove,
  onResize,
  onInteractionChange,
  playbackState,
}) => {
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizing = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null);
  const safeScale = Math.max(0.01, scale);

  return (
    <div
      onPointerDown={(event) => {
        if (locked) return;
        if ((event.target as HTMLElement).closest('input,button,[data-resize]')) return;
        onSelect(element.id);
        if (!movable) return;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startY: event.clientY, originX: element.x, originY: element.y };
        onInteractionChange?.(true);
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        onMove(
          element.id,
          snap8(Math.max(0, d.originX + (event.clientX - d.startX) / safeScale)),
          snap8(Math.max(0, d.originY + (event.clientY - d.startY) / safeScale))
        );
      }}
      onPointerUp={() => {
        const wasDragging = drag.current !== null;
        drag.current = null;
        if (wasDragging) onInteractionChange?.(false);
      }}
      onPointerCancel={() => {
        const wasInteracting = drag.current !== null || resizing.current !== null;
        drag.current = null;
        resizing.current = null;
        if (wasInteracting) onInteractionChange?.(false);
      }}
      className={`absolute flex select-none flex-col items-center justify-center rounded-lg border px-2 py-1 text-center shadow-lg ${
        movable ? 'cursor-move' : 'cursor-pointer'
      } ${selected ? 'ring-2' : ''} ${element.type === 'label' ? 'border-transparent bg-transparent' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        color: element.color,
        background: element.type === 'label' ? 'transparent' : '#2C2C2E',
        borderColor: element.type === 'label' ? 'transparent' : '#3A3A3C',
        ...(selected ? { boxShadow: '0 0 0 2px #0A84FF' } : {}),
      }}
    >
      <PreviewShape element={element} playbackState={playbackState} />
      {selected && !locked && movable && (
        <span
          data-resize
          title="Redimensionar"
          onPointerDown={(event) => {
            event.stopPropagation();
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            resizing.current = { startX: event.clientX, startY: event.clientY, originW: element.width, originH: element.height };
            onInteractionChange?.(true);
          }}
          onPointerMove={(event) => {
            const r = resizing.current;
            if (!r) return;
            const minW = element.type === 'keyboard' ? 560 : 40;
            const minH = element.type === 'keyboard' ? 180 : 28;
            onResize(
              element.id,
              snap8(Math.max(minW, r.originW + (event.clientX - r.startX) / safeScale)),
              snap8(Math.max(minH, r.originH + (event.clientY - r.startY) / safeScale))
            );
          }}
          onPointerUp={() => {
            resizing.current = null;
            onInteractionChange?.(false);
          }}
          onPointerCancel={() => {
            resizing.current = null;
            onInteractionChange?.(false);
          }}
          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-[#3A3A3C] bg-[#0A84FF]"
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
  movable = true,
  previewKeyboard = false,
  scale = 1,
  canvasWidth,
  canvasHeight,
  onInteractionChange,
  interactivePreview,
  channel,
  onCanvasClick,
  onDropKey,
  onSelect,
  onMove,
  onResize,
  onMidiMessage,
  onSetVstParameter,
  keyboardZones,
  selectedZoneId,
  onZoneClick,
  playbackState,
  onLoadPlayback,
  onPlayPlayback,
  onStopPlayback,
}) => {
  const safeScale = Math.max(0.01, scale);
  const coordsOf = (clientX: number, clientY: number, currentTarget: HTMLDivElement) => {
    const rect = currentTarget.getBoundingClientRect();
    return { x: (clientX - rect.left) / safeScale, y: (clientY - rect.top) / safeScale };
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
       className={`relative min-w-[680px] min-h-[520px] overflow-hidden rounded-lg border border-[#303032] bg-[#242426] ${
        armed && !locked ? 'cursor-crosshair' : ''
      }`}
       style={{
         width: canvasWidth,
         height: canvasHeight,
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
              keyboardZones={keyboardZones}
              selectedZoneId={selectedZoneId}
              onZoneClick={onZoneClick}
              playbackState={playbackState}
              onLoadPlayback={onLoadPlayback}
              onPlayPlayback={onPlayPlayback}
              onStopPlayback={onStopPlayback}
            />
          ))
        : elements.map((element) =>
            previewKeyboard && element.type === 'keyboard' ? (
              <React.Fragment key={element.id}>
                <StageControl
                  element={element}
                  channel={channel}
                  layoutMode="absolute"
                  onMidiMessage={onMidiMessage}
                  onSetVstParameter={onSetVstParameter}
                  keyboardZones={keyboardZones}
                  selectedZoneId={selectedZoneId}
                  onZoneClick={onZoneClick}
                  playbackState={playbackState}
                  onLoadPlayback={onLoadPlayback}
                  onPlayPlayback={onPlayPlayback}
                  onStopPlayback={onStopPlayback}
                />
                {element.id === selectedId && (
                  <div
                    className="pointer-events-none absolute rounded-lg"
                    style={{
                      left: element.x,
                      top: element.y,
                      width: Math.max(element.width, 560),
                      height: element.height,
                      boxShadow: '0 0 0 2px #0A84FF',
                    }}
                  />
                )}
                <button
                  type="button"
                  className="absolute z-10 rounded px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{
                    left: element.x + Math.max(element.width, 560) - 78,
                    top: element.y + 6,
                    background: '#0A84FF',
                    color: '#FFFFFF',
                  }}
                  onClick={() => onSelect(element.id)}
                  title="Selecionar o teclado para mapear"
                >
                  Selecionar
                </button>
              </React.Fragment>
            ) : (
              <CanvasElement
                key={element.id}
                element={element}
                selected={element.id === selectedId}
                locked={locked}
                movable={movable}
                scale={scale}
                onSelect={onSelect}
                onMove={onMove}
                onResize={onResize}
                onInteractionChange={onInteractionChange}
                playbackState={playbackState}
              />
            )
          )}
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
