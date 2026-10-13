import React, { useState } from 'react';
import { Preset } from '@shared/types';

interface PresetBrowserProps {
  isOpen: boolean;
  onToggle: () => void;
  presets: Preset[];
  currentPresetId: string | null;
  currentProgram: number;
  onLoadPreset: (presetId: string) => Promise<boolean>;
  onDeletePreset: (presetId: string) => Promise<boolean>;
  onCreatePreset: (name: string, programNumber?: number) => Preset;
  onSavePreset: (preset: Preset) => Promise<boolean>;
  onProgramChange: (program: number, channel: number) => void;
}

export const PresetBrowser: React.FC<PresetBrowserProps> = ({
  isOpen,
  onToggle,
  presets,
  currentPresetId,
  currentProgram,
  onLoadPreset,
  onDeletePreset,
  onCreatePreset,
  onSavePreset,
  onProgramChange,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetProgram, setNewPresetProgram] = useState(0);

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return;
    const preset = onCreatePreset(newPresetName, newPresetProgram);
    onSavePreset(preset);
    setNewPresetName('');
    setNewPresetProgram(0);
  };

  const handleQuickLoad = async (preset: Preset) => {
    await onLoadPreset(preset.id);
    onProgramChange(preset.programNumber, preset.midiChannel);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-2 top-1/2 -translate-y-1/2 z-40 bg-green-600 hover:bg-green-500 text-white px-3 py-12 rounded-r-lg shadow-lg transition-all flex items-center gap-2"
        title="Painel de Presets"
      >
        📁 Presets
      </button>
    );
  }

  return (
    <div className="fixed left-0 top-14 bottom-0 w-72 bg-gray-900 border-r border-gray-800 z-40 flex flex-col shadow-2xl">
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <h3 className="font-semibold text-green-400">Presets</h3>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-200"
          title="Fechar painel"
        >
            ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* New preset form */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h4 className="text-xs text-gray-500 mb-2">Novo Preset</h4>
          <div className="space-y-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Nome do preset"
              className="w-full px-2 py-1 bg-gray-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCreatePreset()}
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={127}
                value={newPresetProgram}
                onChange={(e) => setNewPresetProgram(parseInt(e.target.value) || 0)}
                className="w-16 px-1 py-0.5 bg-gray-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">Número do Programa</span>
            </div>
            <button
              onClick={handleCreatePreset}
              className="w-full px-2 py-1 bg-green-600 rounded text-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!newPresetName.trim()}
            >
              Criar e Salvar
            </button>
          </div>
        </div>

        {/* Preset list */}
        <div>
          <h4 className="text-xs text-gray-500 mb-2">Presets Salvos ({presets.length})</h4>
          {presets.length === 0 ? (
            <p className="text-xs text-gray-600">Nenhum preset salvo</p>
          ) : (
            <div className="space-y-1">
              {presets
                .sort((a, b) => a.programNumber - b.programNumber)
                .map((preset) => (
                  <div
                    key={preset.id}
                    className={`
                      p-2 rounded-lg cursor-pointer transition-all
                      ${currentPresetId === preset.id
                        ? 'bg-blue-900/40 ring-1 ring-blue-500'
                        : 'bg-gray-800 hover:bg-gray-750'}
                    `}
                    onClick={() => handleQuickLoad(preset)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate">
                        <span className="text-sm font-medium text-gray-200 block truncate">
                          {preset.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          PRG {preset.programNumber.toString().padStart(3, '0')} • Ch {preset.midiChannel}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await onLoadPreset(preset.id);
                          }}
                          className="px-1.5 py-0.5 bg-gray-700 rounded text-xs hover:bg-gray-600"
                          title="Carregar preset"
                        >
                          ↻
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Deletar "${preset.name}"?`)) {
                              await onDeletePreset(preset.id);
                            }
                          }}
                          className="px-1.5 py-0.5 bg-red-900/30 rounded text-xs text-red-400 hover:bg-red-900/50"
                          title="Deletar preset"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 p-3">
        <div className="text-xs text-gray-500 text-center">
          Programa Ativo: <strong className="text-blue-400">{currentProgram.toString().padStart(3, '0')}</strong>
        </div>
      </div>
    </div>
  );
};
