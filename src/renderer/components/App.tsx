import React, { useEffect, useState } from 'react';
import { Preset } from '@shared/types';
import { AppProvider, useAppContext } from '../context/AppContext';
import { ConcertShell } from './concert/ConcertShell';
import { TemplatePicker } from './concert/TemplatePicker';
import type { ConcertMode } from './concert/ModeToolbar';

const AppContent: React.FC = () => {
  const context = useAppContext();
  const {
    presets,
    loadedPlugins,
    midiError,
    engineError,
    concertError,
    concertRevision,
    concertTemplates,
    templatePickerOpen,
    chooseTemplate,
    cancelTemplatePicker,
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

  // Concert novo/aberto: descarta o rascunho em edição e a seleção.
  useEffect(() => {
    setDraft(null);
    setSelectedId(null);
    setArmedKey(null);
    setMode('edit');
  }, [concertRevision]);

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
      plugins: (preset.plugins ?? []).map((plugin, index) => ({
        ...plugin,
        layerId: plugin.layerId ?? `${preset.id}:layer:${index}`,
        minNote: plugin.minNote ?? 0,
        maxNote: plugin.maxNote ?? 127,
      })),
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
      const vstStates = { ...draft.vstStates };
      for (const [index, assignment] of (draft.plugins ?? []).entries()) {
        const layerId = assignment.layerId ?? `${draft.id}:layer:${index}`;
        const loaded = loadedPlugins.some((plugin) => plugin.layerId === layerId);
        if (loaded) vstStates[`loaded_${layerId}`] = await window.electronAPI.vstGetState(layerId);
        for (const insert of assignment.inserts ?? []) {
          const state = await window.electronAPI.vstInsertStateGet(layerId, insert.slot);
          if (state) vstStates[`insert_${layerId}_${insert.slot}`] = state;
        }
      }
      const saved = await savePreset({ ...draft, vstStates, updatedAt: Date.now() });
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
    <div className="relative flex h-screen w-full flex-col overflow-hidden text-slate-200" style={{ background: '#1C1C1E' }}>
      {engineError && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs font-semibold"
          style={{ background: '#3A1414', borderColor: '#7A1F1F', color: '#FFB4A9' }}
          role="alert"
        >
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full"
            style={{ background: '#FF554D' }}
          />
          <span>
            O motor de áudio caiu e está reiniciando. Recarregando o patch…
            <span className="ml-1 font-normal" style={{ color: '#D89A93' }}>({engineError})</span>
          </span>
        </div>
      )}
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
          error={error ?? concertError ?? midiError}
          onSelectPreset={(preset) => void selectPreset(preset)}
          onNewPatch={startNewPatch}
          onEditPreset={editPreset}
          onSaveDraft={() => void saveDraft()}
          onMidiMessage={(message) => void sendMidiMessage(message)}
          onSetVstParameter={(pluginPath, parameterId, value) => void updatePresetVstParameter(pluginPath, parameterId, value)}
          onError={(message) => setError(message || null)}
        />
      </div>
      {templatePickerOpen && (
        <TemplatePicker
          templates={concertTemplates}
          onPick={(templateId) => void chooseTemplate(templateId)}
          onCancel={cancelTemplatePicker}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export default App;
