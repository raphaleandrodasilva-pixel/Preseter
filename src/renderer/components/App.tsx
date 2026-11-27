import React, { useEffect, useRef, useState } from 'react';
import { EffectiveStrip, MAX_AUX_BUSES, Preset, SEND_OFF_DB } from '@shared/types';
import { resolveStrips } from '@shared/concert-strips';
import { createDefaultKeyboardLayout } from '@shared/default-layout';
import { suggestPatchIcon } from '@shared/patch-icons';
import { firstPlayablePreset } from '@shared/concert-navigation';
import { AppProvider, useAppContext } from '../context/AppContext';
import { useSlowScroll } from '../hooks/useSlowScroll';
import { ConcertShell } from './concert/ConcertShell';
import { TemplatePicker } from './concert/TemplatePicker';
import { AboutModal } from './concert/AboutModal';
import { HelpModal } from './concert/HelpModal';
import { LibraryGeneratorModal } from './concert/LibraryGeneratorModal';
import { TemplatePrepareModal } from './concert/TemplatePrepareModal';
import type { TemplateReadiness } from '@shared/template-requirements';
import { AppLoadingOverlay } from './ui/AppLoadingOverlay';
import { ConcertPrepareOverlay } from './ui/ConcertPrepareOverlay';
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
    concertLoaded,
    concertActive,
    currentPreset,
    loadProgress,
    concertTemplates,
    templatePickerOpen,
    infoModal,
    closeInfoModal,
    chooseTemplate,
    openConcertFile,
    savePreset,
    loadPreset,
    createPreset,
    sendMidiMessage,
    setVstParameter,
    concertSettings,
    concertStrips,
    sets,
    layout,
    updateConcertLayout,
    preferences,
    updatePreferences,
  } = context;

  useSlowScroll(preferences?.scrollSpeed ?? 'slow');

  const [mode, setMode] = useState<ConcertMode>('edit');
  const [draft, setDraft] = useState<Preset | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Template aguardando a preparação das dependências. */
  const [pendingTemplate, setPendingTemplate] = useState<{ id: string; readiness: TemplateReadiness } | null>(null);

  /** Confere as dependências da Loja antes de criar um concert de template. */
  const prepareTemplate = async (templateId: string) => {
    try {
      const readiness = await window.electronAPI.templateReadiness(templateId);
      if (readiness.missingIds.length === 0) {
        await chooseTemplate(templateId);
        return;
      }
      setPendingTemplate({ id: templateId, readiness });
    } catch {
      // Sem a análise, cria o concert como antes.
      await chooseTemplate(templateId);
    }
  };

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

  /** Cópia editável do patch, com ids de layer garantidos. */
  const editablePreset = (preset: Preset): Preset => ({
    ...preset,
    plugins: (preset.plugins ?? []).map((plugin, index) => ({
      ...plugin,
      layerId: plugin.layerId ?? `${preset.id}:layer:${index}`,
      minNote: plugin.minNote ?? 0,
      maxNote: plugin.maxNote ?? 127,
    })),
    layout: {
      ...preset.layout,
      elements: preset.layout.elements.map((element) => ({ ...element })),
    },
  });

  /** Há alterações no rascunho que ainda não foram para o concert? */
  const isDraftDirty = (): boolean => {
    if (!draft) return false;
    const saved = presets.find((preset) => preset.id === draft.id);
    if (!saved) return true;
    return draft.updatedAt !== saved.updatedAt;
  };

  /** Confirma a troca de patch quando o rascunho atual tem alterações. */
  const confirmDiscardDraft = (nextPatchId?: string): boolean => {
    if (!draft || draft.id === nextPatchId || !isDraftDirty()) return true;
    return window.confirm(`Descartar as alterações não salvas do patch “${draft.name}”?`);
  };

  const startNewPatch = (setId?: string) => {
    if (!concertLoaded) {
      showToast('Carregando o concert… tente de novo em instantes.');
      return;
    }
    if (!concertActive) {
      showToast('Crie ou abra um concert antes de adicionar patches.');
      return;
    }
    if (!confirmDiscardDraft()) return;
    const usedPrograms = new Set(presets.map((p) => p.programNumber));
    const nextProgram =
      Array.from({ length: 128 }, (_, i) => i).find((pg) => !usedPrograms.has(pg)) ?? 0;
    const base = createPreset(
      'Novo patch',
      nextProgram,
      suggestPatchIcon('Novo patch', sets.find((set) => set.id === setId)?.name)
    );
    const nextLayout = layout && layout.elements.length > 0
      ? layout
      : createDefaultKeyboardLayout(layout?.tempo ?? 120, { title: base.name });
    if (!layout || layout.elements.length === 0) updateConcertLayout(nextLayout);
    const siblings = presets.filter((p) => (p.setId ?? undefined) === setId);
    const nextOrder = siblings.reduce((max, p) => Math.max(max, p.setOrder ?? 0), -1) + 1;
    setDraft({
      ...base,
      layout: nextLayout,
      mappings: {},
      setId,
      setOrder: nextOrder,
    });
    setSelectedId(null);
    setArmedKey(null);
    setMode('edit');
    setError(null);
    showToast(setId ? 'Novo patch no set — escolha o instrumento.' : 'Novo patch — escolha o instrumento.');
  };

  const editPreset = (preset: Preset) => {
    if (!concertLoaded) {
      showToast('Carregando o concert… tente de novo em instantes.');
      return;
    }
    if (draft?.id === preset.id) {
      setMode('edit');
      return;
    }
    if (!confirmDiscardDraft(preset.id)) return;
    setDraft(editablePreset(preset));
    setSelectedId(null);
    setMode('edit');
    setError(null);
  };

  const selectPreset = async (preset: Preset) => {
    if (mode === 'edit' && draft?.id === preset.id) return;
    if (!confirmDiscardDraft(preset.id)) return;
    setError(null);
    setSelectedId(null);
    // No Edit o patch já abre como rascunho; em Layout/Perform só carrega.
    setDraft(mode === 'edit' ? editablePreset(preset) : null);
    try {
      const loaded = await loadPreset(preset.id, { silent: mode === 'perform' });
      if (!loaded) {
        setError(`Não foi possível carregar o patch "${preset.name}".`);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Erro desconhecido.';
      setError(`Falha ao carregar "${preset.name}": ${detail}`);
    }
  };

  /** Ao abrir/criar um concert, abre o primeiro patch disponível. */
  const autoLoadedConcertRef = useRef<string | null>(null);
  useEffect(() => {
    if (!concertLoaded || !concertActive || mode !== 'edit') return;
    if (draft) return;

    // Abre o patch atual (ou o primeiro do concert) como rascunho editável.
    if (currentPreset) {
      if (!loadProgress?.active) setDraft(editablePreset(currentPreset));
      return;
    }
    if (loadProgress?.active) return;

    const first = firstPlayablePreset(presets);
    if (!first) return;
    const key = `${concertRevision}:${first.id}`;
    if (autoLoadedConcertRef.current === key) return;
    autoLoadedConcertRef.current = key;
    void selectPreset(first);
    // selectPreset já abre o rascunho no modo Edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concertLoaded, concertActive, concertRevision, mode, draft, currentPreset, presets, loadProgress?.active]);

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

  /**
   * Channel strips herdados do concert/set visíveis neste patch (Fase 3.3).
   * Os valores deles vivem no set/concert; o patch guarda o estado dos plugins.
   */
  const inheritedStrips = (patch: Preset): EffectiveStrip[] => {
    const set = patch.setId ? sets.find((item) => item.id === patch.setId) : undefined;
    return resolveStrips({
      concertStrips,
      setStrips: set?.strips,
      patchStrips: patch.plugins,
      patchId: patch.id,
      setOverrides: set?.stripOverrides,
      patchOverrides: patch.stripOverrides,
    }).filter((strip) => strip.level !== 'patch');
  };

  const saveDraft = async (candidate?: Preset | null): Promise<boolean> => {
    // Chamadas antigas de botão passavam o MouseEvent; ignora qualquer objeto
    // que não seja um patch e usa o rascunho atual.
    const target = candidate && typeof candidate === 'object' && 'id' in candidate
      ? candidate
      : draft;
    if (!target) {
      setError('Nenhum patch aberto para salvar.');
      return false;
    }
    if (!target.name.trim()) {
      setError('Informe um nome para o patch antes de salvar.');
      return false;
    }
    setSaving(true);
    try {
      const vstStates = { ...target.vstStates };
      for (const [index, assignment] of (target.plugins ?? []).entries()) {
        const layerId = assignment.layerId ?? `${target.id}:layer:${index}`;
        const loaded = loadedPlugins.some((plugin) => plugin.layerId === layerId);
        if (loaded) vstStates[`loaded_${layerId}`] = await window.electronAPI.vstGetState(layerId);
        for (const insert of assignment.inserts ?? []) {
          const state = await window.electronAPI.vstInsertStateGet(layerId, insert.slot);
          if (state) vstStates[`insert_${layerId}_${insert.slot}`] = state;
        }
      }
      // Master do Patch: patches antigos usam o mix/inserts do Output 1 do
      // concert como fallback na primeira vez que forem salvos.
      const output1 = concertSettings?.buses.outputs[0];
      const master = target.master ?? {
        volumeDb: output1?.volumeDb ?? 0,
        pan: output1?.pan ?? 0,
        muted: output1?.muted ?? false,
        inserts: output1?.inserts ?? [],
        sends: Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB),
      };
      for (const insert of master.inserts ?? []) {
        const state = await window.electronAPI.vstInsertStateGet('patch', insert.slot);
        if (state) vstStates[`insert_patch_${insert.slot}`] = state;
      }
      // Barramentos Aux/Output do concert: o estado dos efeitos fica no patch (Fase 3.2).
      const concertBuses = [
        ...(concertSettings?.buses.aux ?? []).map((bus, index) => ({ id: `aux${index + 1}`, bus })),
        ...(concertSettings?.buses.outputs ?? []).map((bus, index) => ({ id: `output${index + 1}`, bus })),
      ];
      for (const { id, bus } of concertBuses) {
        for (const insert of bus.inserts ?? []) {
          const state = await window.electronAPI.vstInsertStateGet(id, insert.slot);
          if (state) vstStates[`insert_${id}_${insert.slot}`] = state;
        }
      }
      // Channel strips do concert/set: o estado do plugin e dos inserts fica no
      // patch que está sendo salvo (Fase 3.3).
      for (const strip of inheritedStrips(target)) {
        if (loadedPlugins.some((plugin) => plugin.layerId === strip.id)) {
          vstStates[`loaded_${strip.id}`] = await window.electronAPI.vstGetState(strip.id);
        }
        for (const insert of strip.inserts) {
          const state = await window.electronAPI.vstInsertStateGet(strip.id, insert.slot);
          if (state) vstStates[`insert_${strip.id}_${insert.slot}`] = state;
        }
      }
      const savedAt = Date.now();
      const saved = await savePreset({ ...target, master, vstStates, updatedAt: savedAt });
      if (!saved) setError('O armazenamento não confirmou que o patch foi salvo.');
      else {
        setError(null);
        // Mantém o rascunho sincronizado com o que foi salvo para a checagem
        // de alterações pendentes não acusar um rascunho já gravado.
        setDraft((current) => (
          current && current.id === target.id
            ? { ...current, master, vstStates, updatedAt: savedAt }
            : current
        ));
        showToast('Patch salvo.');
      }
      return saved;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Erro desconhecido.';
      setError(`Falha ao salvar: ${detail}`);
      return false;
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
          onSaveDraft={(preset) => saveDraft(preset ?? null)}
          onMidiMessage={(message) => void sendMidiMessage(message)}
          onSetVstParameter={(pluginPath, parameterId, value) => void updatePresetVstParameter(pluginPath, parameterId, value)}
          onError={(message) => setError(message || null)}
        />
      </div>
      {infoModal === 'about' && <AboutModal onClose={closeInfoModal} />}
      {infoModal === 'help' && <HelpModal onClose={closeInfoModal} />}
      {infoModal === 'library' && <LibraryGeneratorModal onClose={closeInfoModal} />}
      {templatePickerOpen && (
        <TemplatePicker
          templates={concertTemplates}
          externalMidiEnabled={preferences?.externalMidiEnabled ?? false}
          onEnableExternalMidi={async () => {
            const next = await updatePreferences({ externalMidiEnabled: true });
            return next?.externalMidiEnabled === true;
          }}
          onPick={(templateId) => { void prepareTemplate(templateId); }}
          onOpenFile={() => void openConcertFile()}
        />
      )}
      {pendingTemplate && (
        <TemplatePrepareModal
          templateId={pendingTemplate.id}
          templateName={concertTemplates.find((item) => item.id === pendingTemplate.id)?.name}
          readiness={pendingTemplate.readiness}
          onClose={() => setPendingTemplate(null)}
          onProceed={() => {
            const id = pendingTemplate.id;
            setPendingTemplate(null);
            void chooseTemplate(id);
          }}
        />
      )}
      <AppLoadingOverlay />
      <ConcertPrepareOverlay />
    </div>
  );
};

export const App: React.FC = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export default App;
