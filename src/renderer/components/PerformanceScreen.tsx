import React from 'react';
import { Preset } from '@shared/types';
import { StageControl } from './stage/StageControl';
import { StageHeader } from './stage/StageHeader';
import { StageSidebar } from './stage/StageSidebar';
import { StageSections } from './stage/StageSections';
import { KeyboardControl } from './stage/KeyboardControl';
import { PedalBoard } from './stage/PedalBoard';

interface PerformanceScreenProps {
  presets: Preset[];
  currentPreset: Preset | null;
  isLoading: boolean;
  activeNotes?: Set<number>;
  onSelectPreset: (preset: Preset) => void;
  onEditPreset: (preset: Preset) => void;
  onNewPreset: () => void;
  onOpenMidi: () => void;
  onOpenVst: () => void;
  onOpenPresetManager: () => void;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
}

export const PerformanceScreen: React.FC<PerformanceScreenProps> = ({
  presets,
  currentPreset,
  isLoading,
  activeNotes,
  onSelectPreset,
  onEditPreset,
  onNewPreset,
  onOpenMidi,
  onOpenVst,
  onOpenPresetManager,
  onMidiMessage,
  onSetVstParameter,
}) => {
  const sectioned = (currentPreset?.layout.elements ?? []).filter((e) => e.section);
  const free = (currentPreset?.layout.elements ?? []).filter((e) => !e.section);

  return (
    <div className="stg-root">
      <StageHeader
        preset={currentPreset}
        onEditPreset={onEditPreset}
        onNewPreset={onNewPreset}
        onOpenMidi={onOpenMidi}
        onOpenVst={onOpenVst}
        onOpenPresetManager={onOpenPresetManager}
      />

      <div className="stg-body">
        <StageSidebar
          presets={presets}
          currentPresetId={currentPreset?.id ?? null}
          onSelectPreset={onSelectPreset}
          onEditPreset={onEditPreset}
          onNewPreset={onNewPreset}
        />

        <main className="stg-main">
          {currentPreset ? (
            <>
              {sectioned.length > 0 && (
                <StageSections
                  elements={sectioned}
                  channel={currentPreset.midiChannel}
                  activeNotes={activeNotes}
                  onMidiMessage={onMidiMessage}
                  onSetVstParameter={onSetVstParameter}
                />
              )}

              <div className="stg-canvas">
                {free.map((element) => (
                  <StageControl
                    key={element.id}
                    element={element}
                    channel={currentPreset.midiChannel}
                    layoutMode="absolute"
                    activeNotes={activeNotes}
                    onMidiMessage={onMidiMessage}
                    onSetVstParameter={onSetVstParameter}
                  />
                ))}
                {free.length === 0 && sectioned.length === 0 && (
                  <div className="stg-canvasempty">
                    <div className="stg-glyph">◇</div>
                    <div className="stg-t1">Este preset ainda não tem controles visuais.</div>
                    <div className="stg-t2">
                      Abra “Editar” para adicionar knobs, faders, botões e pedais — e use a
                      seção (Instrument / Effects / Tone / Output) para montarem o palco acima.
                    </div>
                  </div>
                )}
                {free.length === 0 && sectioned.length > 0 && (
                  <div className="stg-canvasempty">
                    <div className="stg-t2">
                      Todos os controles estão nas seções acima. Adicione controles “Livres”
                      no Composer para vê-los aqui.
                    </div>
                  </div>
                )}
              </div>

              <div className="stg-keys">
                <KeyboardControl
                  channel={currentPreset.midiChannel}
                  activeNotes={activeNotes}
                  compact
                  foot={`canal ${currentPreset.midiChannel + 1}`}
                  onNoteOn={(note, velocity) => onMidiMessage([0x90 | currentPreset.midiChannel, note, velocity])}
                  onNoteOff={(note) => onMidiMessage([0x80 | currentPreset.midiChannel, note, 0])}
                />
              </div>
              <PedalBoard />

              <div className="stg-plugins">
                <div className="stg-plugtags">
                  {(currentPreset.plugins ?? []).map((plugin) => (
                    <span key={plugin.pluginId} className="stg-plugtag">
                      {plugin.role === 'instrument' ? 'Instrumento' : 'Efeito'}: {plugin.name}
                    </span>
                  ))}
                  {(currentPreset.plugins?.length ?? 0) === 0 && (
                    <span className="stg-plugtag">Nenhum plugin associado.</span>
                  )}
                </div>
                <span className="stg-note">Associação VST salva; áudio real chega com o motor (Fase E).</span>
              </div>
            </>
          ) : (
            <div className="stg-empty">
              <div className="stg-glyph">♫</div>
              <h1>Pronto para tocar?</h1>
              <p>Escolha um preset na lista ou monte o primeiro som.</p>
              <button className="stg-btn stg-btn-primary" onClick={onNewPreset}>
                Montar primeiro preset
              </button>
            </div>
          )}
          {isLoading && <div className="stg-toast">Carregando preset…</div>}
        </main>
      </div>
    </div>
  );
};
