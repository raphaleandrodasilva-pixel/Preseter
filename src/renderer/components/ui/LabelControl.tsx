import React from 'react';
import { UiElement } from '@shared/types';

interface UiLabelProps {
  element: UiElement;
  onUpdate: (el: UiElement) => void;
}

export const LabelControl: React.FC<UiLabelProps> = ({ element }) => {
  return (
    <div
      className="ui-element absolute flex items-center justify-center transition-all"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: 10,
      }}
    >
      <span
        className="hw-label break-words text-center"
        style={{
          color: element.color || '#EDEDEF',
          fontSize: `${Math.min(element.width / 8, element.height / 4)}px`,
        }}
      >
        {element.label}
      </span>
    </div>
  );
};
