import React from 'react';
import type { UiElement } from '@shared/types';
import { StageControl } from './StageControl';

interface StageSectionsProps {
  elements: UiElement[];
  channel: number;
  activeNotes?: Set<number>;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
}

const SECTIONS = [
  { id: 'instrument', title: 'Instrument' },
  { id: 'effects', title: 'Effects' },
  { id: 'tone', title: 'Tone' },
  { id: 'output', title: 'Output' },
] as const;

export const StageSections: React.FC<StageSectionsProps> = ({
  elements,
  channel,
  activeNotes,
  onMidiMessage,
  onSetVstParameter,
}) => {
  const bySection = new Map<string, UiElement[]>();
  for (const element of elements) {
    if (!element.section) continue;
    bySection.set(element.section, [...(bySection.get(element.section) ?? []), element]);
  }
  if (bySection.size === 0) return null;

  return (
    <div className="stg-sections">
      {SECTIONS.map(({ id, title }) => {
        const items = bySection.get(id);
        if (!items || items.length === 0) return null;
        return (
          <section key={id} className="stg-section" aria-label={title}>
            <div className="stg-sectiontitle">{title}</div>
            <div className="stg-sectiongrid">
              {items.map((element) => (
                <StageControl
                  key={element.id}
                  element={element}
                  channel={channel}
                  layoutMode="static"
                  activeNotes={activeNotes}
                  onMidiMessage={onMidiMessage}
                  onSetVstParameter={onSetVstParameter}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
