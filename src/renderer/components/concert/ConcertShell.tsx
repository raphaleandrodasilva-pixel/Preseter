import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BusMixUpdate,
  BusSettings,
  ConcertStrip,
  EffectiveStrip,
  Insert,
  LayerMixUpdate,
  MasterMixUpdate,
  Preset,
  PresetPluginAssignment,
  StripAttribute,
  UiElement,
  VstPluginInfo,
} from '@shared/types';
import { MAX_AUX_BUSES, SEND_OFF_DB } from '@shared/types';
import {
  clearOverride,
  isMasked,
  replaceStrip,
  stripLevelViews,
  viewAt,
  withOverride,
  withStripValue,
  type StripEditTarget,
  type StripValue,
} from '@shared/strip-levels';
import { defaultSends } from '@shared/concert-strips';
import { useAppContext } from '../../context/AppContext';
import { ModeToolbar, type ConcertMode } from './ModeToolbar';
import { PatchList } from './PatchList';
import { ChannelStrips } from './ChannelStrips';
import { Inspector } from './Inspector';
import { ConcertSettingsPanel } from './ConcertSettingsPanel';
import { SettingsModal, type SettingsTab } from './SettingsModal';
import { ComposerCanvas } from '../composer/ComposerCanvas';
import { ControlPalette } from '../composer/ControlPalette';
import { buildScannedParams } from '../composer/MappingTable';
import { findPaletteItem, makeElement, snap8, type PaletteItem } from '../composer/elementFactory';
import { PatchLcd } from '../hardware/PatchLcd';
import { StageControl } from '../stage/StageControl';

interface ConcertShellProps {
  mode: ConcertMode;
  onModeChange: (mode: ConcertMode) => void;
  draft: Preset | null;
  onDraftChange: (preset: Preset) => void;
  selectedId: string | null;
  onSelectedId: (id: string | null) => void;
  armedKey: string | null;
  onArmedKey: (key: string | null) => void;
  saving: boolean;
  toast: string;
  error: string | null;
  onSelectPreset: (preset: Preset) => void;
  onNewPatch: (setId?: string) => void;
  onEditPreset: (preset: Preset) => void;
  onSaveDraft: () => void;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
  onError: (message: string) => void;
}


/** Escala o workspace do Perform para preencher a tela, como no MainStage. */
const FitToView: React.FC<{ elements: UiElement[]; topInset?: number; children: React.ReactNode }> = ({ elements, topInset = 0, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const width = Math.max(320, ...elements.map((e) => e.x + e.width)) + 32;
  const height = Math.max(200, ...elements.map((e) => e.y + e.height)) + 32;
  const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight - topInset;
      const scale = Math.max(0.4, Math.min(2.5, availW / width, availH / height));
      setFit({ scale, left: Math.max(0, (availW - width * scale) / 2), top: topInset + Math.max(0, (availH - height * scale) / 2) });
    };
    calc();
    const observer = new ResizeObserver(calc);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height, topInset]);
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <div style={{ position: 'absolute', width, height, left: fit.left, top: fit.top, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
};

export const ConcertShell: React.FC<ConcertShellProps> = ({
  mode,
  onModeChange,
  draft,
  onDraftChange,
  selectedId,
  onSelectedId,
  armedKey,
  onArmedKey,
  saving,
  toast,
  error,
  onSelectPreset,
  onNewPatch,
  onEditPreset,
  onSaveDraft,
  onMidiMessage,
  onSetVstParameter,
  onError,
}) => {
  const ctx = useAppContext();
  const {
    presets, sets, concertName, setConcertName,
    currentPreset, scannedPlugins, midiLastMessage, appStatus, setAppStatus,
    createSet, renameSet, deleteSet, toggleSetExpanded, toggleSetSkipped,
    movePresetToSet, reorderPatchesInSet, reorderSets, togglePresetSkipped,
    resetProgramNumbers, deletePreset, activeNotes, enginePanic,
    loadedPlugins, scanVstPlugins, loadVstPlugin, unloadVstPlugin, setVstLayerRange, setVstParameter,
    mixState, setVstLayerMix, setVstMasterMix, setVstBusMix, setVstSend, setVstLayerOutput,
    openVstEditor, closeVstEditor,
    concertSettings, updateConcertSettings, midiDevices, listMidiDevices, concertRevision,
    concertStrips, updateConcertStrips, updateSet,
  } = ctx;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const toastTimer = useRef<number | undefined>(undefined);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [concertSelected, setConcertSelected] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [openEditors, setOpenEditors] = useState<Set<string>>(() => new Set());
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /** Abre/fecha a janela nativa do plugin do layer (tecla V ou botão do channel strip). */
  const togglePluginEditor = (layerId: string) => {
    if (openEditors.has(layerId)) {
      void closeVstEditor(layerId).then((closed) => {
        if (!closed) return;
        setOpenEditors((previous) => {
          const next = new Set(previous);
          next.delete(layerId);
          return next;
        });
      });
      return;
    }
    void openVstEditor(layerId).then((opened) => {
      if (!opened) return;
      setOpenEditors((previous) => new Set(previous).add(layerId));
    });
  };

  const activePreset = draft ?? currentPreset;
  const scannedParams = useMemo(() => buildScannedParams(scannedPlugins), [scannedPlugins]);
  const midiInputNames = useMemo(
    () => midiDevices.filter((device) => device.type === 'input').map((device) => device.name),
    [midiDevices]
  );
  useEffect(() => {
    if (concertSelected) void listMidiDevices();
  }, [concertSelected, listMidiDevices]);
  // Concert novo/aberto: volta a mostrar o patch, não as configurações.
  useEffect(() => {
    setConcertSelected(false);
  }, [concertRevision]);
  const selected = activePreset?.layout.elements.find((e) => e.id === selectedId) ?? null;

  const updateDraft = (update: Partial<Preset>) => {
    if (draft) onDraftChange({ ...draft, ...update, updatedAt: Date.now() });
  };
  const addLayer = async (plugin: VstPluginInfo) => {
    if (!draft) return false;
    const layerId = `layer_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
    const loaded = await loadVstPlugin(plugin.path, layerId, 0, 127);
    if (!loaded) {
      onError(`Não foi possível carregar o instrumento "${plugin.name}".`);
      return false;
    }
    const assignment: PresetPluginAssignment = {
      pluginId: plugin.id,
      layerId,
      name: plugin.name,
      path: plugin.path,
      role: 'instrument',
      minNote: 0,
      maxNote: 127,
    };
    onDraftChange({ ...draft, plugins: [...(draft.plugins ?? []), assignment], updatedAt: Date.now() });
    onError('');
    return true;
  };
  const removeLayer = async (assignment: PresetPluginAssignment, layerId: string) => {
    if (!draft) return;
    const removed = await unloadVstPlugin(layerId);
    if (!removed) {
      onError(`Não foi possível remover o layer "${assignment.name}".`);
      return;
    }
    onDraftChange({
      ...draft,
      plugins: (draft.plugins ?? []).filter((plugin) => plugin.layerId !== layerId),
      vstStates: Object.fromEntries(
        Object.entries(draft.vstStates).filter(
          ([key]) => key !== layerId && key !== `loaded_${layerId}` && !key.startsWith(`insert_${layerId}_`)
        )
      ),
      updatedAt: Date.now(),
    });
    onError('');
  };
  const copyLayer = async (assignment: PresetPluginAssignment, sourceLayerId: string) => {
    if (!draft) return false;
    const layerId = `layer_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
    const loaded = await loadVstPlugin(
      assignment.path,
      layerId,
      assignment.minNote ?? 0,
      assignment.maxNote ?? 127
    );
    if (!loaded) {
      onError(`Não foi possível copiar o instrumento "${assignment.name}".`);
      return false;
    }
    try {
      const state = await window.electronAPI.vstGetState(sourceLayerId);
      const stateApplied = await window.electronAPI.vstSetState(layerId, state);
      if (!stateApplied) throw new Error('O engine não confirmou a cópia dos parâmetros.');
      const mixApplied = await setVstLayerMix(layerId, assignment.mix ?? {});
      if (!mixApplied) throw new Error('O engine não confirmou a cópia dos controles de mixagem.');
      await setVstLayerOutput(layerId, assignment.output ?? 1);
      for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
        await setVstSend(layerId, aux, assignment.sends?.[aux - 1] ?? SEND_OFF_DB);
      }
      const inserts = [...(assignment.inserts ?? [])].sort((a, b) => a.slot - b.slot);
      for (const insert of inserts) {
        await window.electronAPI.vstInsertSet(layerId, insert.slot, insert.path, insert.bypass);
        const insertState = await window.electronAPI.vstInsertStateGet(sourceLayerId, insert.slot);
        if (insertState) await window.electronAPI.vstInsertStateSet(layerId, insert.slot, insertState.data);
      }
      const copy: PresetPluginAssignment = { ...assignment, layerId, inserts };
      onDraftChange({ ...draft, plugins: [...(draft.plugins ?? []), copy], updatedAt: Date.now() });
      onError('');
      return true;
    } catch (cause) {
      await unloadVstPlugin(layerId);
      onError(`Falha ao copiar "${assignment.name}": ${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    }
  };
  const changeLayerRange = async (
    assignment: PresetPluginAssignment,
    layerId: string,
    minNote: number,
    maxNote: number
  ) => {
    if (!draft) return;
    const updated = await setVstLayerRange(layerId, minNote, maxNote);
    if (!updated) {
      onError(`Não foi possível atualizar a região MIDI de "${assignment.name}".`);
      return;
    }
    onDraftChange({
      ...draft,
      plugins: (draft.plugins ?? []).map((plugin) =>
        plugin.layerId === layerId ? { ...plugin, minNote, maxNote } : plugin
      ),
      updatedAt: Date.now(),
    });
  };
  const changeLayerMix = async (layerId: string, update: LayerMixUpdate) => {
    if (!await setVstLayerMix(layerId, update)) return;
    const current = draftRef.current;
    if (!current) return;
    const next: Preset = {
      ...current,
      plugins: (current.plugins ?? []).map((assignment, index) =>
        (assignment.layerId ?? `${current.id}:layer:${index}`) === layerId
        ? {
            ...assignment,
            mix: {
              volumeDb: assignment.mix?.volumeDb ?? 0,
              pan: assignment.mix?.pan ?? 0,
              muted: assignment.mix?.muted ?? false,
              solo: assignment.mix?.solo ?? false,
              ...update,
            },
          }
        : assignment),
      updatedAt: Date.now(),
    };
    draftRef.current = next;
    onDraftChange(next);
  };
  const changeMasterMix = async (update: MasterMixUpdate) => {
    if (!await setVstMasterMix(update)) return;
    const current = draftRef.current;
    if (!current) return;
    const next: Preset = {
      ...current,
      masterMix: {
        volumeDb: current.masterMix?.volumeDb ?? 0,
        muted: current.masterMix?.muted ?? false,
        ...update,
      },
      updatedAt: Date.now(),
    };
    draftRef.current = next;
    onDraftChange(next);
  };

  // === Inserts (efeitos do channel strip, Fase 3.1) ===

  const mutateInserts = (layerId: string, update: (inserts: Insert[]) => Insert[]) => {
    const current = draftRef.current;
    if (!current) return;
    const next: Preset = {
      ...current,
      plugins: (current.plugins ?? []).map((assignment, index) => {
        const id = assignment.layerId ?? `${current.id}:layer:${index}`;
        if (id !== layerId) return assignment;
        const inserts = [...(assignment.inserts ?? [])].sort((a, b) => a.slot - b.slot);
        return { ...assignment, inserts: update(inserts).sort((a, b) => a.slot - b.slot) };
      }),
      updatedAt: Date.now(),
    };
    draftRef.current = next;
    onDraftChange(next);
  };

  const addInsert = async (layerId: string, slot: number, plugin: VstPluginInfo) => {
    if (!draft) return false;
    try {
      await window.electronAPI.vstInsertSet(layerId, slot, plugin.path, false);
    } catch (cause) {
      onError(`Não foi possível carregar o efeito "${plugin.name}": ${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    }
    const insert: Insert = { slot, pluginId: plugin.id, name: plugin.name, path: plugin.path, bypass: false };
    mutateInserts(layerId, (inserts) => [...inserts.filter((item) => item.slot !== slot), insert]);
    onError('');
    return true;
  };

  const removeInsertFromStrip = async (layerId: string, slot: number) => {
    if (!draft) return;
    try {
      await window.electronAPI.vstInsertRemove(layerId, slot);
    } catch (cause) {
      onError(`Não foi possível remover o efeito: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    mutateInserts(layerId, (inserts) => inserts.filter((item) => item.slot !== slot));
    onError('');
  };

  const toggleInsertBypass = async (layerId: string, slot: number, bypass: boolean) => {
    if (!await window.electronAPI.vstInsertBypass(layerId, slot, bypass)) return;
    mutateInserts(layerId, (inserts) =>
      inserts.map((item) => (item.slot === slot ? { ...item, bypass } : item))
    );
  };

  const openInsertEditor = (layerId: string, slot: number) => {
    void window.electronAPI.vstInsertOpenEditor(layerId, slot);
  };

  // === Sends e barramentos Aux/Output (Fase 3.2) ===

  /** Nível do send post-fader de um layer para um Aux. */
  const changeLayerSend = async (layerId: string, aux: number, levelDb: number) => {
    if (!await setVstSend(layerId, aux, levelDb)) return;
    const current = draftRef.current;
    if (!current) return;
    const next: Preset = {
      ...current,
      plugins: (current.plugins ?? []).map((assignment, index) => {
        const id = assignment.layerId ?? `${current.id}:layer:${index}`;
        if (id !== layerId) return assignment;
        const sends = [...(assignment.sends ?? Array.from({ length: MAX_AUX_BUSES }, () => SEND_OFF_DB))];
        sends[aux - 1] = levelDb;
        return { ...assignment, sends };
      }),
      updatedAt: Date.now(),
    };
    draftRef.current = next;
    onDraftChange(next);
  };

  /** Saída (Output 1..4) do channel strip de um layer. */
  const changeLayerOutput = async (layerId: string, output: number) => {
    if (!await setVstLayerOutput(layerId, output)) return;
    const current = draftRef.current;
    if (!current) return;
    const next: Preset = {
      ...current,
      plugins: (current.plugins ?? []).map((assignment, index) =>
        (assignment.layerId ?? `${current.id}:layer:${index}`) === layerId
          ? { ...assignment, output }
          : assignment
      ),
      updatedAt: Date.now(),
    };
    draftRef.current = next;
    onDraftChange(next);
  };

  const busIndexOf = (busId: string) => Number(busId.replace(/\D/g, '')) - 1;

  /** Aplica uma alteração à lista de inserts de um barramento do concert. */
  const mutateBusInserts = (busId: string, update: (inserts: Insert[]) => Insert[]) => {
    if (!concertSettings) return;
    const index = busIndexOf(busId);
    if (!Number.isInteger(index) || index < 0) return;
    const buses = concertSettings.buses;
    const apply = (list: BusSettings[]) =>
      list.map((bus, position) => {
        if (position !== index) return bus;
        const inserts = update([...(bus.inserts ?? [])].sort((a, b) => a.slot - b.slot));
        return { ...bus, inserts: inserts.sort((a, b) => a.slot - b.slot) };
      });
    if (busId.startsWith('aux')) {
      updateConcertSettings({ buses: { ...buses, aux: apply(buses.aux ?? []) } });
    } else {
      updateConcertSettings({ buses: { ...buses, outputs: apply(buses.outputs ?? []) } });
    }
  };

  const changeBusMix = async (busId: string, update: BusMixUpdate) => {
    if (!await setVstBusMix(busId, update)) return;
    if (!concertSettings) return;
    const index = busIndexOf(busId);
    if (!Number.isInteger(index) || index < 0) return;
    const buses = concertSettings.buses;
    const apply = (list: BusSettings[]) =>
      list.map((bus, position) => (position === index ? { ...bus, ...update } : bus));
    if (busId.startsWith('aux')) {
      updateConcertSettings({ buses: { ...buses, aux: apply(buses.aux ?? []) } });
    } else {
      updateConcertSettings({ buses: { ...buses, outputs: apply(buses.outputs ?? []) } });
    }
  };

  const addBusInsert = async (busId: string, slot: number, plugin: VstPluginInfo) => {
    try {
      await window.electronAPI.vstInsertSet(busId, slot, plugin.path, false);
    } catch (cause) {
      onError(`Não foi possível carregar o efeito "${plugin.name}" no barramento: ${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    }
    const insert: Insert = { slot, pluginId: plugin.id, name: plugin.name, path: plugin.path, bypass: false };
    mutateBusInserts(busId, (inserts) => [...inserts.filter((item) => item.slot !== slot), insert]);
    onError('');
    return true;
  };

  const removeBusInsert = async (busId: string, slot: number) => {
    try {
      await window.electronAPI.vstInsertRemove(busId, slot);
    } catch (cause) {
      onError(`Não foi possível remover o efeito do barramento: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    mutateBusInserts(busId, (inserts) => inserts.filter((item) => item.slot !== slot));
    onError('');
  };

  const toggleBusInsertBypass = async (busId: string, slot: number, bypass: boolean) => {
    if (!await window.electronAPI.vstInsertBypass(busId, slot, bypass)) return;
    mutateBusInserts(busId, (inserts) =>
      inserts.map((item) => (item.slot === slot ? { ...item, bypass } : item))
    );
  };

  const openBusInsertEditor = (busId: string, slot: number) => {
    void window.electronAPI.vstInsertOpenEditor(busId, slot);
  };

  // === Channel strips do concert/set (Fase 3.3) ===

  /** Set do patch atual: guarda os strips do set e as sobreposições dele. */
  const currentSet = useMemo(
    () => (activePreset?.setId ? sets.find((set) => set.id === activePreset.setId) : undefined),
    [sets, activePreset?.setId]
  );

  /** Strips herdados resolvidos por nível — a mesma conta que o main aplica. */
  const stripViews = useMemo(
    () => stripLevelViews({
      concertStrips,
      setStrips: currentSet?.strips,
      setOverrides: currentSet?.stripOverrides,
      patch: activePreset,
    }),
    [concertStrips, currentSet, activePreset]
  );

  /** Nível que define um strip herdado (o concert tem prioridade). */
  const stripOwnerLevel = (stripId: string): 'concert' | 'set' =>
    concertStrips.some((strip) => strip.id === stripId) ? 'concert' : 'set';

  /** Grava um atributo de um strip herdado no nível pedido (patch, set ou concert). */
  const writeStripValue = (
    target: StripEditTarget,
    stripId: string,
    attr: StripAttribute,
    value: StripValue
  ) => {
    if (target === 'patch') {
      const current = draftRef.current;
      if (!current) return;
      const next: Preset = {
        ...current,
        stripOverrides: withOverride(current.stripOverrides, stripId, attr, value),
        updatedAt: Date.now(),
      };
      draftRef.current = next;
      onDraftChange(next);
      return;
    }
    if (target === 'set') {
      if (!currentSet) return;
      if (stripOwnerLevel(stripId) === 'set') {
        const strip = (currentSet.strips ?? []).find((item) => item.id === stripId);
        if (!strip) return;
        updateSet(currentSet.id, {
          strips: replaceStrip(currentSet.strips ?? [], withStripValue(strip, attr, value)),
        });
      } else {
        updateSet(currentSet.id, {
          stripOverrides: withOverride(currentSet.stripOverrides, stripId, attr, value),
        });
      }
      return;
    }
    const strip = concertStrips.find((item) => item.id === stripId);
    if (!strip) return;
    updateConcertStrips(replaceStrip(concertStrips, withStripValue(strip, attr, value)));
  };

  /** Aplica um atributo de um strip herdado no motor. */
  const applyStripValue = async (strip: EffectiveStrip, attr: StripAttribute, value: StripValue) => {
    try {
      switch (attr) {
        case 'volumeDb':
        case 'pan':
        case 'muted':
        case 'solo':
          await setVstLayerMix(strip.id, { [attr]: value } as LayerMixUpdate);
          break;
        case 'minNote':
          await setVstLayerRange(strip.id, value as number, strip.maxNote);
          break;
        case 'maxNote':
          await setVstLayerRange(strip.id, strip.minNote, value as number);
          break;
        case 'output':
          await setVstLayerOutput(strip.id, value as number);
          break;
        case 'sends': {
          const sends = value as number[];
          for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
            await setVstSend(strip.id, aux, sends[aux - 1] ?? SEND_OFF_DB);
          }
          break;
        }
        default:
          break;
      }
    } catch (cause) {
      onError(`Não foi possível ajustar "${strip.name}": ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  /**
   * Edita um atributo de um strip herdado. Grava no nível escolhido e só mexe no
   * motor quando o valor gravado é o que está valendo (se um nível mais
   * específico manda, o som não muda).
   */
  const changeStripValue = (
    target: StripEditTarget,
    stripId: string,
    attr: StripAttribute,
    value: StripValue
  ) => {
    if (!draft) return;
    const full = stripViews.patch.find((strip) => strip.id === stripId);
    writeStripValue(target, stripId, attr, value);
    if (full && !isMasked(full, target, attr)) void applyStripValue(full, attr, value);
  };

  /** Carrega, remove e atualiza no motor a diferença entre duas cadeias de inserts. */
  const applyInsertChain = async (
    stripId: string,
    label: string,
    current: Insert[],
    wanted: Insert[]
  ): Promise<boolean> => {
    try {
      const before = [...current].sort((a, b) => a.slot - b.slot);
      const after = [...wanted].sort((a, b) => a.slot - b.slot);
      for (const existing of before) {
        const want = after.find((item) => item.slot === existing.slot);
        if (!want || want.path !== existing.path) {
          await window.electronAPI.vstInsertRemove(stripId, existing.slot);
        }
      }
      for (const want of after) {
        const existing = before.find((item) => item.slot === want.slot);
        if (!existing || existing.path !== want.path) {
          await window.electronAPI.vstInsertSet(stripId, want.slot, want.path, want.bypass);
        } else if (existing.bypass !== want.bypass) {
          await window.electronAPI.vstInsertBypass(stripId, want.slot, want.bypass);
        }
      }
      return true;
    } catch (cause) {
      onError(`Não foi possível alterar os inserts de "${label}": ${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    }
  };

  /** Ajusta a cadeia de inserts de um strip herdado no nível pedido. */
  const changeStripInserts = async (
    target: StripEditTarget,
    stripId: string,
    inserts: Insert[]
  ): Promise<boolean> => {
    if (!draft) return false;
    const full = stripViews.patch.find((strip) => strip.id === stripId);
    const view = viewAt(stripViews, target, stripId);
    if (!full || !view) return false;
    const wanted = [...inserts].sort((a, b) => a.slot - b.slot);
    if (!isMasked(full, target, 'inserts')) {
      if (!await applyInsertChain(stripId, full.name, view.inserts, wanted)) return false;
    }
    writeStripValue(target, stripId, 'inserts', wanted);
    onError('');
    return true;
  };

  /** Tira o atributo dos níveis que o sobrepõem e volta ao valor herdado. */
  const revertStripAttribute = (target: StripEditTarget, stripId: string, attr: StripAttribute) => {
    if (!draft) return;
    const current = draftRef.current;
    if (current) {
      const next: Preset = {
        ...current,
        stripOverrides: clearOverride(current.stripOverrides, stripId, attr),
        updatedAt: Date.now(),
      };
      draftRef.current = next;
      onDraftChange(next);
    }
    if (target !== 'patch' && stripOwnerLevel(stripId) === 'concert' && currentSet) {
      updateSet(currentSet.id, { stripOverrides: clearOverride(currentSet.stripOverrides, stripId, attr) });
    }
    const inherited = stripViews.set.find((strip) => strip.id === stripId);
    if (!inherited) return;
    if (attr === 'inserts') {
      void applyInsertChain(stripId, inherited.name, stripViews.patch.find((s) => s.id === stripId)?.inserts ?? [], inherited.inserts);
      return;
    }
    void applyStripValue(inherited, attr, inherited[attr]);
  };

  /** Cria um channel strip do concert ou do set a partir de um plugin escaneado. */
  const addStrip = async (level: 'concert' | 'set', plugin: VstPluginInfo): Promise<boolean> => {
    if (!draft) return false;
    if (level === 'set' && !currentSet) {
      onError('Este patch não está num set. Mova-o para um set antes de criar channel strips do set.');
      return false;
    }
    const stripId = `strip_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
    // Strip herdado nasce pinado: sobrevive à troca de patch e toca em todos.
    const loaded = await loadVstPlugin(plugin.path, stripId, 0, 127, true);
    if (!loaded) {
      onError(`Não foi possível carregar o plugin "${plugin.name}".`);
      return false;
    }
    const strip: ConcertStrip = {
      id: stripId,
      pluginId: plugin.id,
      name: plugin.name,
      path: plugin.path,
      role: plugin.isInstrument ? 'instrument' : 'effect',
      minNote: 0,
      maxNote: 127,
      mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
      inserts: [],
      output: 1,
      sends: defaultSends(),
    };
    if (level === 'concert') updateConcertStrips([...concertStrips, strip]);
    else if (currentSet) updateSet(currentSet.id, { strips: [...(currentSet.strips ?? []), strip] });
    onError('');
    return true;
  };

  /** Remove um channel strip herdado e tira o plugin do motor. */
  const removeStrip = async (level: 'concert' | 'set', stripId: string) => {
    if (!draft) return;
    await unloadVstPlugin(stripId);
    if (level === 'concert') {
      updateConcertStrips(concertStrips.filter((strip) => strip.id !== stripId));
    } else if (currentSet) {
      const overrides = { ...(currentSet.stripOverrides ?? {}) };
      delete overrides[stripId];
      updateSet(currentSet.id, {
        strips: (currentSet.strips ?? []).filter((strip) => strip.id !== stripId),
        stripOverrides: overrides,
      });
    }
    onError('');
  };

  /** Renomeia um channel strip herdado no nível que o define. */
  const renameStrip = (level: 'concert' | 'set', stripId: string, name: string) => {
    if (level === 'concert') {
      updateConcertStrips(concertStrips.map((strip) => (strip.id === stripId ? { ...strip, name } : strip)));
    } else if (currentSet) {
      updateSet(currentSet.id, {
        strips: (currentSet.strips ?? []).map((strip) => (strip.id === stripId ? { ...strip, name } : strip)),
      });
    }
  };

  const updateElement = (id: string, update: Partial<UiElement>) => {
    if (!draft) return;
    onDraftChange({
      ...draft,
      layout: {
        ...draft.layout,
        elements: draft.layout.elements.map((el) => (el.id === id ? { ...el, ...update } : el)),
      },
      updatedAt: Date.now(),
    });
  };
  const removeElement = (id: string) => {
    if (!draft) return;
    onDraftChange({
      ...draft,
      layout: { ...draft.layout, elements: draft.layout.elements.filter((el) => el.id !== id) },
      updatedAt: Date.now(),
    });
    if (selectedId === id) onSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    if (!draft) return;
    const src = draft.layout.elements.find((el) => el.id === id);
    if (!src) return;
    const copy: UiElement = { ...src, id: `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, x: src.x + 16, y: src.y + 16 };
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, copy] }, updatedAt: Date.now() });
    onSelectedId(copy.id);
  };
  const bringFront = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...els, t] }, updatedAt: Date.now() });
  };
  const sendBack = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [t, ...els] }, updatedAt: Date.now() });
  };
  const placeItems = (item: PaletteItem, x: number, y: number) => {
    if (!draft) return;
    const created: UiElement[] = [];
    if (item.group) {
      for (const m of item.group) created.push({ ...makeElement(m.type, snap8(x + m.dx), snap8(y + m.dy), m.label) });
    } else {
      const el = makeElement(item.type, 0, 0, item.label, item.orientation);
      el.x = snap8(Math.max(0, x - el.width / 2));
      el.y = snap8(Math.max(0, y - el.height / 2));
      created.push(el);
    }
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, ...created] }, updatedAt: Date.now() });
    onSelectedId(created[0].id);
    onArmedKey(null);
  };
  const armItem = (item: PaletteItem) => {
    if (!draft) return;
    onArmedKey(armedKey === item.key ? null : item.key);
  };

  const masterMuted = mixState?.master?.muted ?? false;
  const panic = () => { void enginePanic(); };
  const toggleMasterMute = () => { void setVstMasterMix({ muted: !masterMuted }); };

  // Modos: 1/2 = Layout/Edit (em janela), 3 = Perform (em janela), 4 = Perform em tela cheia.
  const changeMode = (next: ConcertMode) => {
    void window.electronAPI.windowSetFullscreen(false);
    onModeChange(next);
  };
  const enterPerformFullscreen = () => {
    void window.electronAPI.windowSetFullscreen(true);
    onModeChange('perform');
  };

  // Atalhos globais: Cmd+1/2/3/4 modos, Ctrl+P panic, Ctrl+M mute, Del remove, Ctrl+D duplica, F foca busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); changeMode('layout'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); changeMode('edit'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') { e.preventDefault(); changeMode('perform'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') { e.preventDefault(); enterPerformFullscreen(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); panic(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMasterMute(); return; }
      if (target?.closest('input,select,textarea')) return;
      if (e.key.toLowerCase() === 'f') {
        const input = document.querySelector('aside input[placeholder*="Buscar"]') as HTMLInputElement | null;
        if (input) { e.preventDefault(); input.focus(); }
        return;
      }
      if (mode === 'perform') {
        if (e.key === 'Escape') { e.preventDefault(); void window.electronAPI.windowSetFullscreen(false); return; }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); panic(); return; }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMasterMute(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          // Navega patches pulando skipped (MainStage: Cmd+setas pula skip; simples aqui)
          const ordered = [...presets].sort((a, b) => a.programNumber - b.programNumber).filter((p) => !p.skipped);
          const idx = ordered.findIndex((p) => p.id === currentPreset?.id);
          const next = e.key === 'ArrowDown' ? ordered[idx + 1] : ordered[idx - 1];
          if (next) { e.preventDefault(); onSelectPreset(next); }
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); removeElement(selectedId); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicateElement(selectedId); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'v' && selectedLayerId) {
        e.preventDefault();
        togglePluginEditor(selectedLayerId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedId, draft, presets, currentPreset, selectedLayerId, openEditors, masterMuted]);

  if (mode === 'perform') {
    const elements = currentPreset?.layout.elements ?? [];
    return (
      <div className="flex h-full flex-col text-slate-200" style={{ background: '#1C1C1E' }}>
        <div
          className="flex h-14 shrink-0 items-center gap-3 border-b px-4 text-xs"
          style={{ background: 'linear-gradient(to bottom, #4A4A4D, #333335)', borderColor: '#0E0E10' }}
        >
          <PatchLcd
            programNumber={currentPreset?.programNumber ?? appStatus.currentProgramNumber}
            patchName={currentPreset?.name ?? null}
            tempo={appStatus.tempo}
          />
          <span className="font-semibold" style={{ color: '#EDEDEF' }}>{concertName}</span>
          <span style={{ color: '#9A9AA0' }}>Perform — Esc sai da tela cheia · ↑/↓ troca patch</span>
          {masterMuted && (
            <span className="rounded px-2 py-1 text-[11px] font-bold" style={{ background: '#FF554D', color: '#1A1A1A' }}>
              MASTER MUDO
            </span>
          )}
          <select
            className="ml-2 rounded-lg px-2 py-1 text-xs outline-none"
            style={{ border: '1px solid #3A3A3C', background: '#1F1F21', color: '#EDEDEF' }}
            value={currentPreset?.id ?? ''}
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) onSelectPreset(p);
            }}
          >
            <option value="">Selecionar patch…</option>
            {[...presets].sort((a, b) => a.programNumber - b.programNumber).map((p) => (
              <option key={p.id} value={p.id}>{String(p.programNumber + 1).padStart(3, '0')} — {p.name}{p.skipped ? ' (skip)' : ''}</option>
            ))}
          </select>
          <button
            className="hw-squarebtn px-3 py-1.5 text-xs"
            onClick={() => setSettingsTab('midi')}
            title="Configurações — MIDI e VST"
          >
            Configurações
          </button>
          <button
            className="hw-squarebtn ml-auto px-3 py-1.5"
            onClick={() => changeMode('edit')}
          >
            Sair do Perform
          </button>
        </div>
        <div className="relative min-h-0 flex-1" style={{ background: 'radial-gradient(circle at 50% 0%, #2A2A2D, #1C1C1E 70%)' }}>
          {currentPreset ? (
            <>
              <div className="pointer-events-none absolute left-0 right-0 top-3 z-10 text-center">
                <div className="text-2xl font-semibold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{currentPreset.name}</div>
                <div className="text-[11px]" style={{ color: '#8E8E93' }}>Programa {currentPreset.programNumber + 1} · Canal {currentPreset.midiChannel + 1}</div>
              </div>
              <FitToView elements={elements} topInset={64}>
                {elements.map((el) => (
                  <StageControl key={el.id} element={el} channel={currentPreset.midiChannel} layoutMode="absolute" activeNotes={activeNotes} onMidiMessage={onMidiMessage} onSetVstParameter={onSetVstParameter} />
                ))}
              </FitToView>
              {elements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: '#636366' }}>
                  Patch sem controles — volte ao Layout para adicionar.
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8E8E93' }}>
              Nenhum patch selecionado — escolha na lista ou com ↑/↓.
            </div>
          )}
        </div>
        {settingsTab && (
          <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-slate-200" style={{ background: '#1C1C1E' }}>
      <ModeToolbar
        mode={mode}
        onModeChange={changeMode}
        concertName={concertName}
        onConcertNameChange={setConcertName}
        tempo={appStatus.tempo}
        onTempoChange={(tempo) => void setAppStatus({ tempo })}
        programNumber={appStatus.currentProgramNumber}
        presetCount={presets.length}
        currentPresetName={currentPreset?.name ?? null}
        midiLastMessage={midiLastMessage}
        isMetronomeOn={concertSettings?.metronome.enabled ?? appStatus.isMetronomeOn}
        onToggleMetronome={() => {
          if (concertSettings) {
            updateConcertSettings({ metronome: { ...concertSettings.metronome, enabled: !concertSettings.metronome.enabled } });
          } else {
            void setAppStatus({ isMetronomeOn: !appStatus.isMetronomeOn });
          }
        }}
        onPanic={panic}
        onOpenSettings={(tab) => setSettingsTab(tab)}
      />
      <div className="flex min-h-0 flex-1">
        <PatchList
          presets={presets}
          sets={sets}
          currentPresetId={currentPreset?.id ?? null}
          concertName={concertName}
          concertSelected={concertSelected}
          onSelectConcert={() => { setConcertSelected(true); onSelectedId(null); }}
          onSelectPreset={(preset) => { setConcertSelected(false); onSelectPreset(preset); }}
          onEditPreset={onEditPreset}
          onNewPatch={onNewPatch}
          onNewSet={() => createSet()}
          onRenameSet={renameSet}
          onDeleteSet={deleteSet}
          onToggleSetExpanded={toggleSetExpanded}
          onToggleSetSkipped={toggleSetSkipped}
          onTogglePresetSkipped={(id) => void togglePresetSkipped(id)}
          onMovePresetToSet={(pid, sid) => void movePresetToSet(pid, sid)}
          onReorderPatches={(sid, ids) => void reorderPatchesInSet(sid, ids)}
          onReorderSets={reorderSets}
          onResetProgramNumbers={() => void resetProgramNumbers()}
          onDeletePreset={(id) => void deletePreset(id)}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-1.5 text-xs" style={{ borderColor: '#303032' }}>
            <span className="font-medium text-white">
              {mode === 'layout' ? 'Workspace — Layout do concert' : 'Workspace — Edit + Mapping'}
            </span>
            <span style={{ color: '#9A9AA0' }}>
              {(draft ?? currentPreset) ? `${(draft ?? currentPreset)?.name} · ${(draft ?? currentPreset)?.layout.elements.length ?? 0} controle(s)${draft ? ' · editando (não salvo)' : ''}` : 'Nenhum patch'}
            </span>
            {masterMuted && (
              <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: '#FF554D', color: '#1A1A1A' }}>
                MASTER MUDO
              </span>
            )}
          </div>
          {error && <div className="border-b border-red-900 bg-red-950/40 px-4 py-1 text-[11px] text-red-300">{error}</div>}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {(draft ?? currentPreset) ? (
              <>
                <ComposerCanvas
                  elements={(draft ?? currentPreset)?.layout.elements ?? []}
                  selectedId={mode === 'layout' ? selectedId : selectedId}
                  armed={mode === 'layout' && armedKey !== null && !!draft}
                  locked={!draft || mode !== 'layout'}
                  interactivePreview={mode === 'edit'}
                  channel={(draft ?? currentPreset)?.midiChannel ?? 0}
                  onCanvasClick={(x, y) => {
                    const item = findPaletteItem(armedKey);
                    if (item) placeItems(item, x, y);
                  }}
                  onDropKey={(key, x, y) => {
                    const item = findPaletteItem(key);
                    if (item) placeItems(item, x, y);
                  }}
                  onSelect={(id) => onSelectedId(id)}
                  onMove={(id, x, y) => updateElement(id, { x, y })}
                  onResize={(id, width, height) => updateElement(id, { width, height })}
                  onMidiMessage={onMidiMessage}
                  onSetVstParameter={onSetVstParameter}
                />
                {!draft && (
                  <div className="mt-2 rounded-lg px-3 py-1.5 text-[11px]" style={{ border: '1px solid rgba(10,132,255,0.4)', background: 'rgba(10,132,255,0.08)', color: '#EDEDEF' }}>
                    Visualizando patch salvo. Clique em um patch → Editar (✎) ou crie um novo para desenhar o layout.
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-2 text-4xl" style={{ color: '#0A84FF' }}>♫</div>
                  <div className="font-semibold text-white">Concert vazio</div>
                  <p className="my-2 text-xs" style={{ color: '#9A9AA0' }}>Crie um Set e o primeiro Patch na Patch List.</p>
                  <button className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: '#0A84FF', color: '#FFFFFF' }} onClick={() => onNewPatch(undefined)}>
                    Criar primeiro patch
                  </button>
                </div>
              </div>
            )}
          </div>
          {concertSelected && concertSettings ? (
            <ConcertSettingsPanel
              settings={concertSettings}
              tempo={appStatus.tempo}
              onChange={updateConcertSettings}
              onTempoChange={(tempo) => void setAppStatus({ tempo })}
              midiInputNames={midiInputNames}
            />
          ) : draft ? (
            <Inspector
              draft={draft}
              scannedPlugins={scannedPlugins}
              scannedParams={scannedParams}
              selectedElement={selected}
              selectedLayerId={selectedLayerId}
              onLayerRangeChange={(assignment, layerId, minNote, maxNote) => void changeLayerRange(assignment, layerId, minNote, maxNote)}
              onPatchChange={updateDraft}
              onUpdateElement={updateElement}
              onRemoveElement={removeElement}
              onDuplicateElement={duplicateElement}
              onBringFront={bringFront}
              onSendBack={sendBack}
              onSelectElement={(id) => onSelectedId(id)}
              onSave={onSaveDraft}
              saving={saving}
            />
          ) : null}
          {mode === 'layout' && (
            <ControlPalette armedKey={armedKey} onArm={armItem} />
          )}
        </main>
        {mode === 'edit' && (
          <ChannelStrips
            preset={draft ?? currentPreset}
            editable={!!draft}
            scannedPlugins={scannedPlugins}
            loadedPlugins={loadedPlugins}
            mixState={mixState}
            busSettings={concertSettings?.buses ?? null}
            concertStrips={concertStrips}
            setStrips={currentSet?.strips ?? []}
            setName={currentSet?.name ?? null}
            setOverrides={currentSet?.stripOverrides}
            onRequestScan={scanVstPlugins}
            onAdd={addLayer}
            onRemove={removeLayer}
            onCopy={copyLayer}
            onAddInsert={addInsert}
            onRemoveInsert={removeInsertFromStrip}
            onToggleInsertBypass={toggleInsertBypass}
            onOpenInsertEditor={openInsertEditor}
            onSetSend={(layerId, aux, levelDb) => void changeLayerSend(layerId, aux, levelDb)}
            onSetLayerOutput={(layerId, output) => void changeLayerOutput(layerId, output)}
            onSetBusMix={(bus, update) => void changeBusMix(bus, update)}
            onAddBusInsert={addBusInsert}
            onRemoveBusInsert={removeBusInsert}
            onToggleBusInsertBypass={toggleBusInsertBypass}
            onOpenBusInsertEditor={openBusInsertEditor}
            onAddStrip={addStrip}
            onRemoveStrip={removeStrip}
            onRenameStrip={renameStrip}
            onSetStripValue={changeStripValue}
            onSetStripInserts={changeStripInserts}
            onRevertStripAttribute={revertStripAttribute}
            onSelectedLayerChange={setSelectedLayerId}
            onOpenEditor={togglePluginEditor}
            onSetParameter={(layerId, parameterId, value) => void setVstParameter(layerId, parameterId, value)}
            onSetLayerMix={(layerId, update) => void changeLayerMix(layerId, update)}
            onSetMasterMix={(update) => void changeMasterMix(update)}
          />
        )}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-4 border-t px-4 text-[10px]" style={{ borderColor: '#3A3A3C', background: '#1F1F21', color: '#9A9AA0' }}>
        <span>Programa {appStatus.currentProgramNumber + 1}</span>
        <span>Patches: {presets.length} · Sets: {sets.length}</span>
        {midiLastMessage && <span className="truncate" style={{ color: '#30D158' }}>{midiLastMessage}</span>}
        {toast && <span className="truncate" style={{ color: '#EDEDEF' }}>{toast}</span>}
        <span className="ml-auto" style={{ color: ctx.audioDevices?.running ? '#30D158' : '#9A9AA0' }}>
          {ctx.audioDevices?.running ? 'Áudio ativo' : 'Áudio parado — configure em Configurações'}
        </span>
      </div>
      {settingsTab && (
        <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
      )}
    </div>
  );
};
