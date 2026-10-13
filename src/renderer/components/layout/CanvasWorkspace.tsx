import React, { useRef, useEffect, useCallback } from 'react';
import {
  LayoutConfig,
  UiElement,
  VstPluginInfo,
  Preset,
} from '@shared/types';
import {
  ButtonControl,
  FaderControl,
  KnobControl,
  PedalControl,
  ToggleControl,
  SliderControl,
  PadControl,
  LabelControl,
} from '../ui';
import { UI_COLORS } from '@shared/constants';

interface CanvasWorkspaceProps {
  layout: LayoutConfig | null;
  editingElement: UiElement | null;
  onUpdateElement: (el: UiElement) => void;
  onRemoveElement: (id: string) => void;
  onSetEditing: (el: UiElement | null) => void;
  onCanvasClick: (e: React.MouseEvent) => void;
  onCanvasMouseUp: (e: React.MouseEvent) => void;
  draggingNewElement: { type: any; startX: number; startY: number } | null;
  canvasOffset: { x: number; y: number };
  loadedPlugins: VstPluginInfo[];
  onSetVstParameter: (pluginId: string, paramId: string, value: number) => void;
  currentPreset: Preset | null;
  onElementDrag: (el: UiElement) => void;
  onMidiSend: (message: number[]) => Promise<boolean>;
}

// Elemento de renderização individual (importado de App.tsx e separado)
const RenderElement: React.FC<{
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onSetEditing: (el: UiElement | null) => void;
  editingElement: UiElement | null;
  loadedPlugins: VstPluginInfo[];
  onSetVstParameter: (pluginId: string, paramId: string, value: number) => void;
  onMidiSend: (message: number[]) => void;
}> = ({ element, onUpdate, onSetEditing, editingElement, loadedPlugins, onSetVstParameter, onMidiSend }) => {
  // Conectar plugin/parametro se configurado
  const handleControlChange = useCallback(
    (value: number) => {
      if (element.pluginId && element.parameterId) {
        onSetVstParameter(element.pluginId, element.parameterId, value);
      }
    },
    [element, onSetVstParameter]
  );

  const handlers = {
    onUpdate,
    onControlChange: handleControlChange,
    onMidiSend,
  };

  let component: React.ReactNode = null;

  switch (element.type) {
    case 'button':
      component = <ButtonControl element={element} {...handlers} />;
      break;
    case 'fader':
      component = <FaderControl element={element} {...handlers} />;
      break;
    case 'knob':
      component = <KnobControl element={element} {...handlers} />;
      break;
    case 'pedal':
      component = <PedalControl element={element} {...handlers} />;
      break;
    case 'toggle':
      component = <ToggleControl element={element} {...handlers} />;
      break;
    case 'slider':
      component = <SliderControl element={element} {...handlers} />;
      break;
    case 'pad':
      component = <PadControl element={element} {...handlers} />;
      break;
    case 'label':
      component = <LabelControl element={element} onUpdate={onUpdate} />;
      break;
    default:
      return null;
  }

  return (
    <div
      className={`absolute transition-all ${
        editingElement?.id === element.id ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:ring-1 hover:ring-gray-600'
      }`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: 10,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSetEditing(element);
      }}
    >
      {component}

      {editingElement?.id === element.id && (
        <div
          className="absolute -top-6 right-0 z-20 flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onUpdate({ ...element, color: getNextColor(element.color) })}
            className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center"
            title="Trocar cor"
          >
            🎨
          </button>
          <button
            onClick={() => {
              onUpdate({ ...element, label: prompt('Novo label:', element.label) || element.label });
            }}
            className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center"
            title="Editar label"
          >
            ✏️
          </button>
        </div>
      )}
    </div>
  );
};

function getNextColor(current: string): string {
  const colors = Object.values(UI_COLORS);
  const idx = colors.indexOf(current);
  return colors[(idx + 1) % colors.length];
}

// Draggable canvas element
interface DraggableCanvasElementProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
  onClick: (e: React.MouseEvent) => void;
  onRelease: () => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  layout,
  editingElement,
  onUpdateElement,
  onRemoveElement,
  onSetEditing,
  onCanvasClick,
  onCanvasMouseUp,
  draggingNewElement,
  loadedPlugins,
  onSetVstParameter,
  currentPreset,
  onElementDrag,
  onMidiSend,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggedElement = useRef<{ id: string; offset: { x: number; y: number } } | null>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const activeDrag = draggedElement.current;
      if (!activeDrag || !layout) return;

      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - activeDrag.offset.x;
        const y = e.clientY - rect.top - activeDrag.offset.y;
        const dragged = layout.elements.find((el) => el.id === activeDrag.id);

        if (!dragged) return;

        onElementDrag({
          ...dragged,
          x: Math.max(0, x),
          y: Math.max(0, y),
        });
      }
    },
    [onElementDrag, layout]
  );

  const handleMouseUp = useCallback(() => {
    draggedElement.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, element: UiElement) => {
      e.stopPropagation();

      if (editingElement?.id !== element.id) {
        onSetEditing(element);
      }

      draggedElement.current = {
        id: element.id,
        offset: { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY },
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [editingElement, onSetEditing, handleMouseMove, handleMouseUp]
  );

  if (!layout) {
    return (
      <div
        ref={canvasRef}
        className="flex-1 bg-gradient-to-b from-gray-900 to-gray-950 relative overflow-hidden cursor-wait"
        onClick={onCanvasClick}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-gray-500">Carregue ou crie um preset para começar</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className={`
        flex-1 relative overflow-hidden
        ${editingElement ? 'cursor-grabbing' : 'cursor-default'}
        bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950
      `}
      onClick={onCanvasClick}
      onMouseUp={onCanvasMouseUp}
      style={{
        backgroundImage:
          layout.background ||
          'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)',
      }}
    >
      {/* Grid de fundo sutil */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '30px 30px',
        }}
      />

      {/* Renderizar elementos */}
      {layout.elements.map((element) => (
        <RenderElement
          key={element.id}
          element={element}
          onUpdate={onUpdateElement}
          onSetEditing={onSetEditing}
          editingElement={editingElement}
          loadedPlugins={loadedPlugins}
          onSetVstParameter={onSetVstParameter}
          onMidiSend={(message) => { void onMidiSend(message); }}
        />
      ))}

      {/* Overlay de instruções quando não há elementos */}
      {layout.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-600">
            Adicione elementos usando a toolbar ou carregue um preset
          </p>
        </div>
      )}

      {/* Mini-mapa / informações */}
      {currentPreset && (
        <div className="absolute bottom-4 right-4 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700">
          <div className="text-sm">
            <span className="text-gray-500">Preset:</span>
            <span className="text-white ml-1">{currentPreset.name}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Programa:</span>
            <span className="text-white ml-1">
              {currentPreset.programNumber.toString().padStart(3, '0')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
