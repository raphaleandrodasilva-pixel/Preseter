import React, { useMemo } from 'react';
import type { Preset } from '@shared/types';

interface StageSidebarProps {
  presets: Preset[];
  currentPresetId: string | null;
  onSelectPreset: (preset: Preset) => void;
  onEditPreset: (preset: Preset) => void;
  onNewPreset: () => void;
}

export const StageSidebar: React.FC<StageSidebarProps> = ({
  presets,
  currentPresetId,
  onSelectPreset,
  onEditPreset,
  onNewPreset,
}) => {
  const categories = useMemo(() => {
    const grouped = new Map<string, Preset[]>();
    for (const preset of presets) {
      const category = preset.category?.trim() || 'Sem categoria';
      grouped.set(category, [...(grouped.get(category) ?? []), preset]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [presets]);

  return (
    <aside className="stg-sidebar">
      <div className="stg-sidehead">
        <div className="stg-sidetitle">Instrument List</div>
        <div className="stg-sidecount">{presets.length} preset(s)</div>
      </div>
      <div className="stg-sidelist">
        {presets.length === 0 && (
          <div className="stg-sideempty">
            Sua biblioteca está vazia.
            <br />
            Crie seu primeiro preset para começar.
          </div>
        )}
        {categories.map(([category, entries]) => (
          <section key={category}>
            <div className="stg-catlabel" title={category}>{category}</div>
            {entries
              .slice()
              .sort((a, b) => a.programNumber - b.programNumber)
              .map((preset) => {
                const active = preset.id === currentPresetId;
                return (
                  <div key={preset.id} className={`stg-item${active ? ' active' : ''}`}>
                    <button
                      className="stg-itemmain"
                      onClick={() => onSelectPreset(preset)}
                      title={`${preset.name} (Programa ${preset.programNumber + 1})`}
                    >
                      <span className="stg-itemname">{preset.name}</span>
                    </button>
                    <button
                      className="stg-itemedit"
                      onClick={() => onEditPreset(preset)}
                      title="Editar preset"
                    >
                      Editar
                    </button>
                  </div>
                );
              })}
          </section>
        ))}
      </div>
      <div className="stg-sidefoot">
        <span>Set</span>
        <span>Patch</span>
        <span style={{ marginLeft: 'auto' }} />
        <button className="stg-footbtn" onClick={onNewPreset} title="Novo preset">+</button>
      </div>
    </aside>
  );
};
