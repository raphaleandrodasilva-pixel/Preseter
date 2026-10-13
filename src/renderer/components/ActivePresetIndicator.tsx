import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, Preset } from '@shared/types';
import { createMidiMessage, MidiStatus } from '@shared/constants';

interface ActivePresetIndicatorProps {
  appStatus: AppStatus;
  currentPreset: Preset | null;
  presets: Preset[];
  onPresetClick: (preset: Preset) => void;
  onProgramChange: (program: number, channel: number) => void;
  isCompact?: boolean;
}

export const ActivePresetIndicator: React.FC<ActivePresetIndicatorProps> = ({
  appStatus,
  currentPreset,
  presets,
  onPresetClick,
  onProgramChange,
  isCompact = false,
}) => {
  const [showProgramList, setShowProgramList] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Animação de pulso quando programa muda
  useEffect(() => {
    setPulseAnimation(true);
    const timer = setTimeout(() => setPulseAnimation(false), 1000);
    return () => clearTimeout(timer);
  }, [appStatus.currentProgramNumber]);

  // Click fora para fechar lista
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (indicatorRef.current && !indicatorRef.current.contains(e.target as Node)) {
        setShowProgramList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Program numbers organizados em grid
  const programs = Array.from({ length: 128 }, (_, i) => {
    const preset = presets.find((p) => p.programNumber === i);
    return { number: i, preset };
  });

  const handleProgramClick = (program: number) => {
    onProgramChange(program, appStatus.currentPresetId ? presets.find(p => p.id === appStatus.currentPresetId)?.midiChannel ?? 0 : 0);
  };

  return (
    <div
      ref={indicatorRef}
      className={`
        ${isCompact ? 'fixed top-2 right-2 z-50' : 'relative'}
        ${pulseAnimation ? 'animate-pulse' : ''}
      `}
    >
      <div
        className={`
          ${isCompact
            ? 'px-3 py-1.5 text-sm'
            : 'px-6 py-3 text-xl'
          }
          rounded-lg font-bold flex items-center gap-3
          transition-all duration-300 cursor-pointer
          ${currentPreset ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}
        `}
        onClick={() => setShowProgramList(!showProgramList)}
        style={{
          boxShadow: isCompact
            ? '0 4px 20px rgba(59, 130, 246, 0.4)'
            : '0 0 25px rgba(59, 130, 246, 0.5)',
          border: '2px solid #3B82F6',
        }}
      >
        {/* LED indicator */}
        <div className="relative flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-400 opacity-50 blur-sm" />
        </div>

        {/* Program number */}
        <div className="flex items-center gap-2">
          <span className="text-gray-300">PRG:</span>
          <span className="font-mono text-2xl tabular-nums">
            {appStatus.currentProgramNumber.toString().padStart(3, '0')}
          </span>
        </div>

        {/* Preset name */}
        {currentPreset && (
          <>
            <span className="text-gray-400">/</span>
            <span className="truncate max-w-[200px]" title={currentPreset.name}>
              {currentPreset.name}
            </span>
          </>
        )}

        {!currentPreset && (
          <span className="text-gray-400 text-sm">(sem preset)</span>
        )}
      </div>

      {/* Dropdown da lista de programas */}
      {showProgramList && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50">
          <div className="p-2 border-b border-gray-700">
            <input
              type="text"
              placeholder="Buscar programa..."
              className="w-full px-2 py-1 bg-gray-800 rounded text-sm text-gray-200"
              onKeyDown={(e) => {
                // Filtering would be added here
              }}
            />
          </div>
          <div className="grid grid-cols-8 gap-1 p-2">
            {programs.map(({ number, preset }) => (
              <button
                key={number}
                onClick={() => {
                  handleProgramClick(number);
                  setShowProgramList(false);
                }}
                className={`
                  text-xs py-1 rounded transition-all relative group
                  ${preset
                    ? 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-500'}
                  ${number === appStatus.currentProgramNumber
                    ? 'ring-2 ring-blue-500'
                    : ''}
                `}
                title={preset ? `${preset.name} (PRG ${number})` : `Programa ${number}`}
              >
                {number.toString()}
                {preset && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#10B981' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
