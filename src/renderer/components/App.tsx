import React, { useState } from 'react';
import { Preset } from '@shared/types';
import { AppProvider, useAppContext } from '../context/AppContext';
import { ConcertShell } from './concert/ConcertShell';
import type { ConcertMode } from './concert/ModeToolbar';

const AppContent: React.FC = () => {
  const context = useAppContext();
  const {
    presets,
    loadedPlugins,
    midiError,
    savePreset,
    loadPreset,
    createPreset,
    sendMidiMessage,
    setVstParameter,
  } = context;

  const [mode, setMode] = useState<ConcertMode>('edit');
  const [draft, setDraft] = useState<Preset | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  };

  const startNewPatch = (setId?: string) => {
    const usedPrograms = new Set(presets.map((p) => p.programNumber));
    const nextProgram =
      Array.from({ length: 128 }, (_, i) => i).find((pg) => !usedPrograms.has(pg)) ?? 0;
    const base = createPreset('Novo patch', nextProgram);
    const siblings = presets.filter((p) => (p.setId ?? undefined) === setId);
    const nextOrder = siblings.reduce((max, p) => Math.max(max, p.setOrder ?? 0), -1) + 1;
    setDraft({ ...base, setId, setOrder: nextOrder });
    setSelectedId(null);
    setArmedKey(null);
    setMode('layout');
    setError(null);
    showToast(setId ? 'Novo patch no set — desenhe o layout.' : 'Novo patch — desenhe o layout.');
  };

  const editPreset = (preset: Preset) => {
    setDraft({
      ...preset,
      plugins: [...(preset.plugins ?? [])],
      layout: { ...preset.layout, elements: preset.layout.elements.map((e) => ({ ...e })) },
    });
    setSelectedId(null);
    setMode('edit');
    setError(null);
  };

  const selectPreset = async (preset: Preset) => {
    setError(null);
    setDraft(null);
    setSelectedId(null);
    try {
      const loaded = await loadPreset(preset.id);
      if (!loaded) {
        setError(`Não foi possível carregar o patch "${preset.name}".`);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Erro desconhecido.';
      setError(`Falha ao carregar "${preset.name}": ${detail}`);
    }
  };

  const updatePresetVstParameter = async (pluginPath: string, parameterId: string, value: number) => {
    const plugin = loadedPlugins.find((entry) => entry.path === pluginPath);
    if (!plugin) {
      setError('O plugin associado a este controle não está carregado.');
      return;
    }
    try {
      const updated = await setVstParameter(plugin.id, parameterId, value);
      if (!updated) setError(`Não foi possível atualizar ${parameterId} de ${plugin.name}.`);
      else setError(null);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Erro desconhecido.';
      setError(`Falha ao atualizar parâmetro VST: ${detail}`);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError('Informe um nome para o patch antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      const saved = await savePreset({ ...draft, updatedAt: Date.now() });
      if (!saved) setError('O armazenamento não confirmou que o patch foi salvo.');
      else {
        setError(null);
        showToast('Patch salvo.');
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Erro desconhecido.';
      setError(`Falha ao salvar: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden text-slate-200" style={{ background: '#0B0B0D' }}>
      <div className="min-h-0 flex-1">
        <ConcertShell
          mode={mode}
          onModeChange={setMode}
          draft={draft}
          onDraftChange={setDraft}
          selectedId={selectedId}
          onSelectedId={setSelectedId}
          armedKey={armedKey}
          onArmedKey={setArmedKey}
          saving={saving}
          toast={toast}
          error={error ?? midiError}
          onSelectPreset={(preset) => void selectPreset(preset)}
          onNewPatch={startNewPatch}
          onEditPreset={editPreset}
          onSaveDraft={() => void saveDraft()}
          onMidiMessage={(message) => void sendMidiMessage(message)}
          onSetVstParameter={(pluginPath, parameterId, value) => void updatePresetVstParameter(pluginPath, parameterId, value)}
        />
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export default App;
