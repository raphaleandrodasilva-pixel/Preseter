import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  VstPreset,
  AudioInputSettings,
  AudioInputState,
  ConcertMapping,
  MappableAction,
  MidiBinding,
  PlaybackState,
} from '@shared/types';
import { MAX_AUX_BUSES, SEND_OFF_DB } from '@shared/types';
import { defaultAudioInput } from '@shared/audio-input';
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
import { AssignmentsMappingsTable } from './AssignmentsMappingsTable';
import { PatchLibraryModal } from './PatchLibraryModal';
import { TunerModal } from './TunerModal';
import { ComposerCanvas } from '../composer/ComposerCanvas';
import { ControlPalette } from '../composer/ControlPalette';
import { buildScannedParams } from '../composer/MappingTable';
import { findPaletteItem, makeElement, snap8, type PaletteItem } from '../composer/elementFactory';
import { PatchLcd } from '../hardware/PatchLcd';
import { StageControl } from '../stage/StageControl';
import type { RawMidiEvent } from '../../services/WebMidiService';
import { setParameterLearnHandler } from '../../services/parameter-learn';
import { shortcutFromKeyboardEvent } from '@shared/shortcuts';

/** Campos de um controle que pertencem ao patch, não ao layout do concert (Fase 4.1). */
const MAPPING_FIELDS = new Set<keyof UiElement>([
  'midiCommand',
  'midiPort',
  'midiThru',
  'pluginId',
  'pluginPath',
  'parameterId',
  'noteNumber',
  'velocity',
  'mappingMin',
  'mappingMax',
  'respondToHardwareMove',
]);

/** Chave única da origem MIDI, para resolver overrides por nível. */
function mappingSourceKey(source: MidiBinding): string {
  const number = source.type === 'cc'
    ? source.controllerNumber ?? -1
    : source.type === 'note'
      ? source.controllerNumber ?? -1
      : source.type === 'pc'
        ? source.programNumber ?? -1
        : 0;
  return `${source.type}:${source.channel}:${number}`;
}

/** true quando a mensagem de hardware casa com a origem do mapping. */
function matchesMappingSource(source: MidiBinding, event: RawMidiEvent): boolean {
  if ((source.channel ?? 0) !== event.channel) return false;
  switch (source.type) {
    case 'cc':
      return event.kind === 'cc' && event.number === source.controllerNumber;
    case 'note':
      return event.kind === 'note' && event.number === source.controllerNumber;
    case 'pc':
      return event.kind === 'pc' && event.number === source.programNumber;
    case 'pitch':
      return event.kind === 'pitch';
    case 'aftertouch':
      return event.kind === 'aftertouch'
        && (!source.controllerNumber || source.controllerNumber === event.number);
    default:
      return false;
  }
}

interface ConcertShellProps {  mode: ConcertMode;
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
    reorderSets, togglePresetSkipped, savePreset, createPreset,
    resetProgramNumbers, deletePreset, activeNotes, enginePanic, subscribeMidiLearn,
    loadedPlugins, scanVstPlugins, loadVstPlugin, unloadVstPlugin, setVstLayerRange, setVstLayerVelocity, setVstParameter,
    mixState, setVstLayerMix, setVstMasterMix, setVstBusMix, setVstSend, setVstLayerOutput,
    openVstEditor, closeVstEditor, setAudioInput, getAudioInputState, setMidiThruBlocked,
    setHostClock, setMetronome,
    startRecording, stopRecording, loadPlayback, playPlayback, stopPlayback, getPlaybackState,
    setPanLaw,
    concertSettings, updateConcertSettings, midiDevices, listMidiDevices, concertRevision,
    concertStrips, updateConcertStrips, updateSet, layout, updateConcertLayout, mappings, updateMappings,
    exportPatch, importPatch, exportSet, importSet,
  } = ctx;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  type PresetLoadResult = { ok: boolean; message: string };
  const pendingPresetRef = useRef<{
    preset: VstPreset;
    resolve: (result: PresetLoadResult) => void;
  } | null>(null);
  const currentPresetRef = useRef(currentPreset);
  currentPresetRef.current = currentPreset;
  const [liveValues, setLiveValues] = useState<Record<string, number>>({});
  const liveValuesRef = useRef(liveValues);
  liveValuesRef.current = liveValues;
  const hardwareStateRef = useRef<Map<string, { lastRaw?: number; picked?: boolean }>>(new Map());
  const executeActionRef = useRef<(action: MappableAction) => void>(() => undefined);
  const tapTimesRef = useRef<number[]>([]);
  const [actionNotice, setActionNotice] = useState('');
  const performQueryRef = useRef('');
  const performQueryTimer = useRef<number | undefined>(undefined);
  const [performQuery, setPerformQuery] = useState('');
  const [performListOpen, setPerformListOpen] = useState(true);
  const [performListQuery, setPerformListQuery] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [concertSelected, setConcertSelected] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [focusLayerId, setFocusLayerId] = useState<string | null>(null);
  const [openEditors, setOpenEditors] = useState<Set<string>>(() => new Set());
  const [audioInputState, setAudioInputState] = useState<AudioInputState | null>(null);
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
  const selectedLoadedPlugin = selectedLayerId
    ? loadedPlugins.find((plugin) => plugin.layerId === selectedLayerId) ?? null
    : null;
  /** Patches copiados na Patch List (Fase 5.1). */
  const patchClipboard = useRef<Preset[]>([]);

  const deepClonePreset = (preset: Preset): Preset =>
    typeof structuredClone === 'function'
      ? structuredClone(preset)
      : JSON.parse(JSON.stringify(preset));

  /** Cria a cópia de um patch com id novo, preservando plugins, layout e mappings. */
  const clonePatch = (
    source: Preset,
    setId: string | undefined,
    programNumber: number,
    name?: string
  ): Preset => ({
    ...deepClonePreset(source),
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name ?? source.name,
    setId,
    setOrder: 0,
    programNumber,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const patchesOfSet = (setId: string | undefined): Preset[] =>
    presets
      .filter((preset) => (preset.setId ?? undefined) === setId)
      .sort((a, b) => (a.setOrder ?? a.programNumber) - (b.setOrder ?? b.programNumber));

  const freeProgramNumbers = (): number[] => {
    const used = new Set(presets.map((preset) => preset.programNumber));
    const free: number[] = [];
    for (let program = 0; program < 128; program += 1) {
      if (!used.has(program)) free.push(program);
    }
    return free;
  };

  /** Grava a nova ordem de uma ou mais listas (sets), ajustando setOrder/setId. */
  const persistPatchLists = async (lists: Map<string | undefined, Preset[]>) => {
    for (const [setId, list] of lists) {
      for (let index = 0; index < list.length; index += 1) {
        const preset = list[index];
        const belongs = (preset.setId ?? undefined) === setId;
        if (belongs && preset.setOrder === index) continue;
        await savePreset({ ...preset, setId, setOrder: index, updatedAt: Date.now() });
      }
    }
  };

  /** Copia a seleção da Patch List para a área de transferência interna. */
  const copyPatches = (ids: string[]) => {
    const byId = new Map(presets.map((preset) => [preset.id, preset]));
    patchClipboard.current = ids
      .map((id) => byId.get(id))
      .filter((preset): preset is Preset => !!preset)
      .map(deepClonePreset);
  };

  /** Cola os patches copiados no set indicado, logo depois de `afterId`. */
  const pastePatches = async (
    setId: string | undefined,
    afterId: string | null
  ): Promise<string[]> => {
    const originals = patchClipboard.current;
    if (originals.length === 0) return [];
    const free = freeProgramNumbers();
    const list = patchesOfSet(setId);
    const afterIndex = afterId ? list.findIndex((preset) => preset.id === afterId) : -1;
    const insertAt = afterIndex === -1 ? list.length : afterIndex + 1;
    const copies = originals.map((source) =>
      clonePatch(source, setId, free.shift() ?? source.programNumber)
    );
    const next = [...list.slice(0, insertAt), ...copies, ...list.slice(insertAt)];
    await persistPatchLists(new Map([[setId, next]]));
    return copies.map((copy) => copy.id);
  };

  /** Duplica os patches selecionados, inserindo cada cópia logo abaixo do original. */
  const duplicatePatches = async (ids: string[]): Promise<string[]> => {
    const idSet = new Set(ids);
    const affected = new Set<string | undefined>();
    for (const preset of presets) {
      if (idSet.has(preset.id)) affected.add(preset.setId ?? undefined);
    }
    const free = freeProgramNumbers();
    const lists = new Map<string | undefined, Preset[]>();
    const created: string[] = [];
    for (const setId of affected) {
      const next: Preset[] = [];
      for (const preset of patchesOfSet(setId)) {
        next.push(preset);
        if (!idSet.has(preset.id)) continue;
        const copy = clonePatch(
          preset,
          setId,
          free.shift() ?? preset.programNumber,
          `${preset.name} (cópia)`
        );
        next.push(copy);
        created.push(copy.id);
      }
      lists.set(setId, next);
    }
    await persistPatchLists(lists);
    return created;
  };

  const deletePatches = async (ids: string[]): Promise<void> => {
    for (const id of ids) await deletePreset(id);
  };

  /** 5.2: combina os patches selecionados num patch novo. */
  const newPatchFromSelection = async (ids: string[]): Promise<void> => {
    const selected = presets.filter((preset) => ids.includes(preset.id));
    if (selected.length === 0) return;
    const first = selected[0];
    const program = freeProgramNumbers()[0] ?? first.programNumber;
    const base = createPreset(
      selected.length === 1 ? `${first.name} (novo)` : `${first.name} + ${selected.length - 1}`,
      program
    );
    const siblings = presets.filter((preset) => (preset.setId ?? undefined) === (first.setId ?? undefined));
    const setOrder = siblings.reduce((max, preset) => Math.max(max, preset.setOrder ?? 0), -1) + 1;
    const merged: Preset = {
      ...base,
      name: selected.length === 1 ? `${first.name} (novo)` : `${first.name} + ${selected.length - 1}`,
      setId: first.setId,
      setOrder,
      midiChannel: first.midiChannel,
      transpose: first.transpose,
      audioInput: first.audioInput,
      masterMix: first.masterMix,
      plugins: selected.flatMap((preset) => preset.plugins ?? []),
      vstStates: Object.assign({}, ...selected.map((preset) => preset.vstStates)),
      mappings: Object.assign({}, ...selected.map((preset) => preset.mappings ?? {})),
      stripOverrides: Object.assign({}, ...selected.map((preset) => preset.stripOverrides ?? {})),
      layout: layout ?? base.layout,
    };
    const saved = await savePreset(merged);
    if (saved) onSelectPreset(merged);
  };

  /** 5.2: move os patches selecionados para um set novo. */
  const newSetFromSelection = async (ids: string[]): Promise<void> => {
    const selected = presets
      .filter((preset) => ids.includes(preset.id))
      .sort((a, b) => (a.setOrder ?? a.programNumber) - (b.setOrder ?? b.programNumber));
    if (selected.length === 0) return;
    const set = createSet();
    for (let index = 0; index < selected.length; index += 1) {
      await savePreset({ ...selected[index], setId: set.id, setOrder: index, updatedAt: Date.now() });
    }
  };

  /**
   * Move (ou copia, com Option) os patches para antes de `beforeId` no set de
   * destino. `beforeId` nulo significa fim do set.
   */
  const movePatches = async (
    ids: string[],
    setId: string | undefined,
    beforeId: string | null,
    copy: boolean
  ): Promise<string[]> => {
    const idSet = new Set(ids);
    const affected = new Set<string | undefined>();
    for (const preset of presets) {
      if (idSet.has(preset.id)) affected.add(preset.setId ?? undefined);
    }
    affected.add(setId);

    const lists = new Map<string | undefined, Preset[]>();
    for (const key of affected) lists.set(key, patchesOfSet(key));
    if (!copy) {
      for (const list of lists.values()) {
        for (let index = list.length - 1; index >= 0; index -= 1) {
          if (idSet.has(list[index].id)) list.splice(index, 1);
        }
      }
    }

    const targetList = lists.get(setId) ?? [];
    if (!lists.has(setId)) lists.set(setId, targetList);
    const targetIndex = beforeId
      ? targetList.findIndex((preset) => preset.id === beforeId)
      : -1;
    const insertAt = targetIndex === -1 ? targetList.length : targetIndex;
    const free = freeProgramNumbers();
    const moved: Preset[] = [];
    for (const id of ids) {
      const source = presets.find((preset) => preset.id === id);
      if (!source) continue;
      moved.push(
        copy ? clonePatch(source, setId, free.shift() ?? source.programNumber) : source
      );
    }
    targetList.splice(insertAt, 0, ...moved);
    await persistPatchLists(lists);
    return moved.map((preset) => preset.id);
  };

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

  // === Strip de entrada de áudio (Fase 3.5) ===

  const applyAudioInput = async (settings: AudioInputSettings, resetFeedback = false) => {
    const state = await setAudioInput({ ...settings, resetFeedback });
    if (state) setAudioInputState(state);
  };

  const changeAudioInput = (update: Partial<AudioInputSettings>) => {
    if (!draft) return;
    const next: AudioInputSettings = {
      ...defaultAudioInput(),
      ...(draft.audioInput ?? {}),
      ...update,
      enabled: true,
    };
    onDraftChange({ ...draft, audioInput: next, updatedAt: Date.now() });
    void applyAudioInput(next);
  };

  const addAudioInput = () => {
    if (!draft) return;
    const next = { ...defaultAudioInput(), enabled: true };
    onDraftChange({ ...draft, audioInput: next, updatedAt: Date.now() });
    void applyAudioInput(next, true);
  };

  const removeAudioInput = () => {
    if (!draft) return;
    const next = { ...(draft.audioInput ?? defaultAudioInput()), enabled: false };
    onDraftChange({ ...draft, audioInput: next, updatedAt: Date.now() });
    setAudioInputState(null);
    void applyAudioInput(next);
  };

  const resetAudioFeedback = () => {
    const current = { ...defaultAudioInput(), ...(draft?.audioInput ?? {}), enabled: true, muted: false };
    if (draft) onDraftChange({ ...draft, audioInput: current, updatedAt: Date.now() });
    void applyAudioInput(current, true);
  };

  const keepAudioInputMuted = () => {
    const current = { ...defaultAudioInput(), ...(draft?.audioInput ?? {}), enabled: true, muted: true };
    if (draft) onDraftChange({ ...draft, audioInput: current, updatedAt: Date.now() });
    void applyAudioInput(current, true);
  };

  const disableAudioFeedbackProtection = () => {
    const current = {
      ...defaultAudioInput(),
      ...(draft?.audioInput ?? {}),
      enabled: true,
      feedbackProtection: false,
      muted: false,
    };
    if (draft) onDraftChange({ ...draft, audioInput: current, updatedAt: Date.now() });
    void applyAudioInput(current, true);
  };

  useEffect(() => {
    if (!activePreset?.audioInput?.enabled) {
      setAudioInputState(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const state = await getAudioInputState();
      if (!cancelled) setAudioInputState(state);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activePreset?.audioInput?.enabled, getAudioInputState]);

  // Assignments: MIDI de hardware move o controle de tela e o parâmetro mapeado (Fase 4.2).
  useEffect(() => {
    const unsubscribe = subscribeMidiLearn((event) => {
      // CC7/CC10 globais do Concert Settings (Fase 2.4).
      if (event.kind === 'cc' && event.number === 7 && concertSettings?.midi.cc7ControlsVolume) {
        const volumeDb = event.value === 0 ? -60 : -60 + (event.value / 127) * 60;
        for (const plugin of loadedPlugins) {
          if (plugin.layerId) void setVstLayerMix(plugin.layerId, { volumeDb });
        }
      }
      if (event.kind === 'cc' && event.number === 10 && concertSettings?.midi.cc10ControlsPan) {
        const pan = (event.value / 127) * 2 - 1;
        for (const plugin of loadedPlugins) {
          if (plugin.layerId) void setVstLayerMix(plugin.layerId, { pan });
        }
      }

      const preset = draftRef.current ?? currentPresetRef.current;
      for (const element of preset?.layout.elements ?? []) {
        const binding = element.midiCommand;
        if (!binding) continue;
        if (element.midiPort && event.deviceId && element.midiPort !== event.deviceId) continue;
        if ((binding.channel ?? 0) !== event.channel) continue;

        const min = element.minValue ?? 0;
        const max = element.maxValue ?? 1;
        const applyValue = (normalized: number) => {
          const norm = Math.max(0, Math.min(1, normalized));
          const value = min + norm * (max - min);
          setLiveValues((previous) => ({ ...previous, [element.id]: value }));
          if (element.pluginPath && element.parameterId) {
            const mappingMin = element.mappingMin ?? 0;
            const mappingMax = element.mappingMax ?? 1;
            onSetVstParameter(
              element.pluginPath,
              element.parameterId,
              mappingMin + norm * (mappingMax - mappingMin)
            );
          }
        };

        if (binding.type === 'cc' && event.kind === 'cc' && binding.controllerNumber === event.number) {
          const hardwareNorm = event.value / 127;
          const mode = element.respondToHardwareMove ?? 'jump';
          const live = liveValuesRef.current[element.id];
          const currentNorm = live !== undefined
            ? (live - min) / Math.max(max - min, Number.EPSILON)
            : (element.value ?? 0.5);
          const state = hardwareStateRef.current.get(element.id) ?? {};

          if (mode === 'relative') {
            const last = state.lastRaw ?? event.value;
            applyValue(currentNorm + (event.value - last) / 127);
          } else if (mode === 'pickup') {
            let picked = state.picked === true;
            if (!picked) {
              const target = currentNorm * 127;
              const crossed = state.lastRaw !== undefined
                && ((state.lastRaw < target && event.value >= target)
                  || (state.lastRaw > target && event.value <= target));
              if (Math.abs(event.value - target) < 4 || crossed) {
                picked = true;
                applyValue(hardwareNorm);
              }
            } else {
              applyValue(hardwareNorm);
            }
            state.picked = picked;
          } else {
            applyValue(hardwareNorm);
          }

          state.lastRaw = event.value;
          hardwareStateRef.current.set(element.id, state);
        } else if (binding.type === 'note' && event.kind === 'note' && binding.controllerNumber === event.number) {
          applyValue(event.value > 0 ? 1 : 0);
        } else if (binding.type === 'pc' && event.kind === 'pc' && binding.programNumber === event.number) {
          applyValue(1);
        } else if (binding.type === 'pitch' && event.kind === 'pitch') {
          applyValue(event.value / 16383);
        } else if (binding.type === 'aftertouch' && event.kind === 'aftertouch') {
          if (!binding.controllerNumber || binding.controllerNumber === event.number) {
            applyValue(event.value / 127);
          }
        }
      }

      const set = preset?.setId ? sets.find((item) => item.id === preset.setId) : undefined;
      const inScope = (mapping: ConcertMapping) =>
        mapping.patchId
          ? mapping.patchId === preset?.id
          : mapping.setId
            ? mapping.setId === set?.id
            : true;

      // Ações mapeáveis (Fase 4.7): o nível mais específico vence a mesma origem.
      const actions = new Map<string, { mapping: ConcertMapping; specificity: number }>();
      for (const mapping of mappings) {
        if (!mapping.action || !inScope(mapping)) continue;
        const key = mappingSourceKey(mapping.source);
        const specificity = mapping.patchId ? 0 : mapping.setId ? 1 : 2;
        const current = actions.get(key);
        if (!current || specificity < current.specificity) actions.set(key, { mapping, specificity });
      }
      for (const { mapping } of actions.values()) {
        if (matchesMappingSource(mapping.source, event)) {
          executeActionRef.current(mapping.action as MappableAction);
        }
      }

      // Mappings direto para parâmetro, sem controle de tela (Fase 4.6).
      const eventNormalized =
        event.kind === 'cc' || event.kind === 'aftertouch'
          ? event.value / 127
          : event.kind === 'pitch'
            ? event.value / 16383
            : event.value > 0
              ? 1
              : 0;
      for (const mapping of mappings) {
        if (mapping.action || mapping.elementId || !inScope(mapping)) continue;
        if (!matchesMappingSource(mapping.source, event)) continue;
        const pluginPath = mapping.pluginPath
          ?? preset?.plugins?.find((assignment) => assignment.pluginId === mapping.pluginId)?.path;
        if (!pluginPath || !mapping.parameterId) continue;
        const mappingMin = mapping.mappingMin ?? 0;
        const mappingMax = mapping.mappingMax ?? 1;
        onSetVstParameter(
          pluginPath,
          mapping.parameterId,
          mappingMin + eventNormalized * (mappingMax - mappingMin)
        );
      }
    });
    return unsubscribe;
  }, [subscribeMidiLearn, onSetVstParameter, mappings, sets, concertSettings?.midi.cc7ControlsVolume, concertSettings?.midi.cc10ControlsPan, loadedPlugins, setVstLayerMix]);

  // Learn de parâmetro por clique (Fase 4.3).
  useEffect(() => {
    setParameterLearnHandler((elementId, pluginPath, parameterId) => {
      const current = draftRef.current;
      if (!current) return;
      const next: Preset = {
        ...current,
        layout: {
          ...current.layout,
          elements: current.layout.elements.map((element) =>
            element.id === elementId
              ? { ...element, pluginPath, pluginId: undefined, parameterId }
              : element
          ),
        },
        updatedAt: Date.now(),
      };
      draftRef.current = next;
      onDraftChange(next);
      setActionNotice('Parâmetro mapeado');
    });
    return () => setParameterLearnHandler(null);
  }, [onDraftChange]);

  // Don't pass thru: bloqueia no motor as mensagens usadas só como assignment (Fase 4.5).
  useEffect(() => {
    const blocked = [];
    const preset = draft ?? currentPreset;
    const set = preset?.setId ? sets.find((item) => item.id === preset.setId) : undefined;
    for (const element of preset?.layout.elements ?? []) {
      const binding = element.midiCommand;
      if (!binding || element.midiThru !== false) continue;
      const number = binding.type === 'cc'
        ? binding.controllerNumber ?? 0
        : binding.type === 'note'
          ? binding.controllerNumber ?? element.noteNumber ?? 60
          : binding.type === 'pc'
            ? binding.programNumber ?? 0
            : 0;
      blocked.push({ type: binding.type, channel: binding.channel ?? 0, number });
    }
    for (const mapping of mappings) {
      if (mapping.midiThru !== false) continue;
      const inScope = mapping.patchId
        ? mapping.patchId === preset?.id
        : mapping.setId
          ? mapping.setId === set?.id
          : true;
      if (!inScope) continue;
      const binding = mapping.source;
      const number = binding.type === 'cc'
        ? binding.controllerNumber ?? 0
        : binding.type === 'note'
          ? binding.controllerNumber ?? 60
          : binding.type === 'pc'
            ? binding.programNumber ?? 0
            : 0;
      blocked.push({ type: binding.type, channel: binding.channel ?? 0, number });
    }
    void setMidiThruBlocked(blocked);
  }, [draft, currentPreset, sets, mappings, setMidiThruBlocked]);

  useEffect(() => {
    setLiveValues({});
    hardwareStateRef.current.clear();
  }, [currentPreset?.id, draft?.id]);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  // Relógio do host e metrônomo (Fase 6.2).
  useEffect(() => {
    const signature = concertSettings?.timeSignature ?? { numerator: 4, denominator: 4 };
    void setHostClock(appStatus.tempo, signature.numerator, signature.denominator, appStatus.isPlaying);
  }, [appStatus.tempo, appStatus.isPlaying, concertSettings?.timeSignature, setHostClock]);

  useEffect(() => {
    if (!concertSettings) return;
    void setMetronome(
      concertSettings.metronome.enabled,
      concertSettings.metronome.volumeDb,
      concertSettings.metronome.accentFirstBeat
    );
  }, [concertSettings?.metronome, setMetronome]);

  useEffect(() => {
    if (!concertSettings) return;
    void setPanLaw(concertSettings.channelStrips.panLaw, concertSettings.channelStrips.panLawCompensated);
  }, [concertSettings?.channelStrips, setPanLaw]);

  useEffect(() => {
    void getPlaybackState().then((state) => { if (state) setPlaybackState(state); });
  }, [getPlaybackState]);

  useEffect(() => {
    if (!playbackState?.playing) return;
    const timer = window.setInterval(() => {
      void getPlaybackState().then((state) => { if (state) setPlaybackState(state); });
    }, 500);
    return () => window.clearInterval(timer);
  }, [playbackState?.playing, getPlaybackState]);

  const baseElements = useMemo(() => (draft ?? currentPreset)?.layout.elements ?? [], [draft, currentPreset]);
  const displayElements = useMemo(
    () =>
      baseElements.map((element) =>
        liveValues[element.id] !== undefined ? { ...element, value: liveValues[element.id] } : element
      ),
    [baseElements, liveValues]
  );
  const performElements = useMemo(
    () =>
      (currentPreset?.layout.elements ?? []).map((element) =>
        liveValues[element.id] !== undefined ? { ...element, value: liveValues[element.id] } : element
      ),
    [currentPreset, liveValues]
  );

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
    setFocusLayerId(layerId);
    onError('');
    return true;
  };

  /** Cria um layer novo dividindo o range do layer base em grave/agudo. */
  const addSplitLayer = async (
    plugin: VstPluginInfo,
    options: { baseLayerId: string; splitNote: number; keep: 'low' | 'high' }
  ): Promise<boolean> => {
    if (!draft) return false;
    const plugins = draft.plugins ?? [];
    const baseIndex = plugins.findIndex(
      (item, index) => (item.layerId ?? `${draft.id}:layer:${index}`) === options.baseLayerId
    );
    if (baseIndex < 0) {
      onError('Layer base não encontrado para o split.');
      return false;
    }
    const base = plugins[baseIndex];
    const baseMin = base.minNote ?? 0;
    const baseMax = base.maxNote ?? 127;
    if (baseMax - baseMin < 1) {
      onError('O layer base precisa ter pelo menos duas notas para criar um split.');
      return false;
    }
    const cut = Math.max(baseMin + 1, Math.min(baseMax, Math.round(options.splitNote)));
    const nextBaseMin = options.keep === 'low' ? baseMin : cut;
    const nextBaseMax = options.keep === 'low' ? cut - 1 : baseMax;
    const newMin = options.keep === 'low' ? cut : baseMin;
    const newMax = options.keep === 'low' ? baseMax : cut - 1;

    const layerId = `layer_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
    const loaded = await loadVstPlugin(plugin.path, layerId, newMin, newMax);
    if (!loaded) {
      onError(`Não foi possível carregar o instrumento "${plugin.name}" para o split.`);
      return false;
    }

    const rangeChanged = await setVstLayerRange(options.baseLayerId, nextBaseMin, nextBaseMax);
    if (!rangeChanged) {
      await unloadVstPlugin(layerId);
      onError(`Não foi possível ajustar o range do layer "${base.name}".`);
      return false;
    }

    const assignment: PresetPluginAssignment = {
      pluginId: plugin.id,
      layerId,
      name: plugin.name,
      path: plugin.path,
      role: 'instrument',
      minNote: newMin,
      maxNote: newMax,
    };
    onDraftChange({
      ...draft,
      plugins: plugins.map((item, index) =>
        index === baseIndex ? { ...item, minNote: nextBaseMin, maxNote: nextBaseMax } : item
      ).concat(assignment),
      updatedAt: Date.now(),
    });
    setFocusLayerId(layerId);
    onError('');
    return true;
  };

  /** Learn da nota de corte do split: repassa a próxima nota MIDI pressionada. */
  const learnSplitNote = useCallback((listener: (note: number) => void) => {
    return subscribeMidiLearn((event) => {
      if (event.kind === 'note' && event.value > 0) listener(event.number);
    });
  }, [subscribeMidiLearn]);

  /** Localiza o plugin escaneado que originou um preset da Channel Strip Library. */
  const findPresetPlugin = (preset: VstPreset): VstPluginInfo | null =>
    scannedPlugins.find(
      (item) =>
        item.id === preset.pluginId ||
        item.path === preset.pluginPath ||
        item.name === preset.pluginName
    ) ?? null;

  /** Carrega um preset criando um channel strip novo. */
  const performPresetLoad = async (
    preset: VstPreset,
    patch: Preset
  ): Promise<PresetLoadResult> => {
    const plugin = findPresetPlugin(preset);
    if (!plugin) {
      return { ok: false, message: `Plugin "${preset.pluginName}" não encontrado. Reescaneie os VSTs.` };
    }

    const layerId = `layer_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
    const loaded = await loadVstPlugin(plugin.path, layerId, 0, 127);
    if (!loaded) {
      return { ok: false, message: `Não foi possível carregar "${plugin.name}".` };
    }

    if (preset.source === 'vital') {
      const assignment: PresetPluginAssignment = {
        pluginId: plugin.id,
        layerId,
        name: plugin.name,
        path: plugin.path,
        role: 'instrument',
        minNote: 0,
        maxNote: 127,
      };
      onDraftChange({
        ...patch,
        plugins: [...(patch.plugins ?? []), assignment],
        updatedAt: Date.now(),
      });
      setFocusLayerId(layerId);
      if (mode !== 'edit') onModeChange('edit');
      return {
        ok: true,
        message: `Channel strip criado. O preset .vital não é aplicável diretamente; use "Salvar som atual".`,
      };
    }

    try {
      const applied = await window.electronAPI.vstPresetApply(preset.id, layerId);
      if (!applied) throw new Error('O plugin não confirmou a aplicação do preset.');
    } catch (error) {
      await unloadVstPlugin(layerId);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Falha ao aplicar o preset.',
      };
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
    onDraftChange({
      ...patch,
      plugins: [...(patch.plugins ?? []), assignment],
      updatedAt: Date.now(),
    });
    setFocusLayerId(layerId);
    if (mode !== 'edit') onModeChange('edit');
    return { ok: true, message: `Preset "${preset.name}" carregado.` };
  };

  const loadPresetAsNewStrip = (preset: VstPreset): Promise<PresetLoadResult> => {
    if (draft) return performPresetLoad(preset, draft);
    return new Promise((resolve) => {
      pendingPresetRef.current = { preset, resolve };
      onNewPatch();
    });
  };

  const applyPresetToSelected = async (
    preset: VstPreset,
    options: { replacePlugin?: boolean } = {}
  ): Promise<PresetLoadResult> => {
    if (!selectedLayerId) {
      return { ok: false, message: 'Selecione um channel strip para aplicar o preset.' };
    }
    if (!draft) {
      return { ok: false, message: 'Abra um patch antes de aplicar o preset.' };
    }
    if (!selectedLoadedPlugin) {
      return { ok: false, message: 'Aguarde o plugin do channel strip terminar de carregar.' };
    }
    if (preset.source === 'vital') {
      return {
        ok: false,
        message: 'Presets .vital não são aplicáveis diretamente. Use "Salvar som atual" no Vital.',
      };
    }

    const samePlugin =
      preset.pluginId === selectedLoadedPlugin.id ||
      (!!preset.pluginPath && preset.pluginPath === selectedLoadedPlugin.path);

    if (!samePlugin) {
      if (!options.replacePlugin) {
        return {
          ok: false,
          message: `O preset "${preset.name}" usa outro VST. Confirme a substituição do instrumento do strip.`,
        };
      }
      const plugin = findPresetPlugin(preset);
      if (!plugin) {
        return {
          ok: false,
          message: `Plugin "${preset.pluginName}" não encontrado. Reescaneie os VSTs.`,
        };
      }
      const assignment = (draft.plugins ?? []).find(
        (item, index) => (item.layerId ?? `${draft.id}:layer:${index}`) === selectedLayerId
      );
      if (!assignment) {
        return { ok: false, message: 'Channel strip não encontrado no patch.' };
      }
      const replaced = await replaceLayer(assignment, selectedLayerId, plugin);
      if (!replaced) {
        return { ok: false, message: 'Não foi possível substituir o VST do channel strip.' };
      }
    }

    try {
      const applied = await window.electronAPI.vstPresetApply(preset.id, selectedLayerId);
      if (!applied) {
        return { ok: false, message: 'O preset não pôde ser aplicado.' };
      }
      return {
        ok: true,
        message: samePlugin
          ? `Preset "${preset.name}" aplicado.`
          : `VST substituído e preset "${preset.name}" aplicado.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Falha ao aplicar o preset.',
      };
    }
  };

  useEffect(() => {
    if (!draft || !pendingPresetRef.current) return;
    const pending = pendingPresetRef.current;
    pendingPresetRef.current = null;
    void performPresetLoad(pending.preset, draft).then((result) => pending.resolve(result));
  }, [draft]);

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
      await window.electronAPI.vstSetLayerVelocity(
        layerId,
        assignment.velocityMin ?? 1,
        assignment.velocityMax ?? 127
      );
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
  /** Troca o VST de um layer mantendo o mesmo strip, mixagem, key range e inserts. */
  const replaceLayer = async (
    assignment: PresetPluginAssignment,
    layerId: string,
    plugin: VstPluginInfo
  ): Promise<boolean> => {
    if (!draft) return false;
    const minNote = assignment.minNote ?? 0;
    const maxNote = assignment.maxNote ?? 127;
    const oldPluginId = assignment.pluginId;
    const oldState = await window.electronAPI.vstGetState(layerId);
    const insertStates: { slot: number; data: string }[] = [];
    for (const insert of assignment.inserts ?? []) {
      const state = await window.electronAPI.vstInsertStateGet(layerId, insert.slot);
      if (state?.data) insertStates.push({ slot: insert.slot, data: state.data });
    }

    const unloaded = await unloadVstPlugin(layerId);
    if (!unloaded) {
      onError(`Não foi possível descarregar "${assignment.name}" para trocar o VST.`);
      return false;
    }

    try {
      const loaded = await loadVstPlugin(plugin.path, layerId, minNote, maxNote);
      if (!loaded) throw new Error('O engine não confirmou o carregamento do novo plugin.');

      await setVstLayerMix(layerId, assignment.mix ?? {});
      await setVstLayerOutput(layerId, assignment.output ?? 1);
      await window.electronAPI.vstSetLayerVelocity(
        layerId,
        assignment.velocityMin ?? 1,
        assignment.velocityMax ?? 127
      );
      for (let aux = 1; aux <= MAX_AUX_BUSES; aux += 1) {
        await setVstSend(layerId, aux, assignment.sends?.[aux - 1] ?? SEND_OFF_DB);
      }
      for (const insert of [...(assignment.inserts ?? [])].sort((a, b) => a.slot - b.slot)) {
        await window.electronAPI.vstInsertSet(layerId, insert.slot, insert.path, insert.bypass);
        const saved = insertStates.find((item) => item.slot === insert.slot);
        if (saved) await window.electronAPI.vstInsertStateSet(layerId, insert.slot, saved.data);
      }

      const mappings = { ...(draft.mappings ?? {}) };
      let removedMappings = 0;
      for (const [id, mapping] of Object.entries(mappings)) {
        if (mapping.pluginId === oldPluginId || mapping.pluginPath === assignment.path) {
          delete mappings[id];
          removedMappings += 1;
        }
      }

      onDraftChange({
        ...draft,
        plugins: (draft.plugins ?? []).map((item) =>
          item.layerId === layerId
            ? { ...item, pluginId: plugin.id, name: plugin.name, path: plugin.path }
            : item
        ),
        mappings,
        vstStates: Object.fromEntries(
          Object.entries(draft.vstStates).filter(
            ([key]) => key !== `loaded_${layerId}` && !key.startsWith(`insert_${layerId}_`)
          )
        ),
        updatedAt: Date.now(),
      });

      if (removedMappings > 0) {
        onError(`${removedMappings} mapping(s) do plugin antigo foram removidos.`);
      } else {
        onError('');
      }
      return true;
    } catch (cause) {
      // Tenta voltar ao plugin anterior para não deixar o strip sem som.
      try {
        await loadVstPlugin(assignment.path, layerId, minNote, maxNote);
        if (oldState) await window.electronAPI.vstSetState(layerId, oldState);
        await setVstLayerMix(layerId, assignment.mix ?? {});
        await setVstLayerOutput(layerId, assignment.output ?? 1);
      } catch {
        // O erro principal abaixo já explica a falha.
      }
      onError(
        `Falha ao trocar "${assignment.name}" por "${plugin.name}": ${
          cause instanceof Error ? cause.message : String(cause)
        }`
      );
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
  const changeLayerVelocity = async (
    assignment: PresetPluginAssignment,
    layerId: string,
    velocityMin: number,
    velocityMax: number
  ) => {
    if (!draft) return;
    if (!await setVstLayerVelocity(layerId, velocityMin, velocityMax)) {
      onError(`Não foi possível atualizar a faixa de velocity de "${assignment.name}".`);
      return;
    }
    onDraftChange({
      ...draft,
      plugins: (draft.plugins ?? []).map((plugin) =>
        plugin.layerId === layerId ? { ...plugin, velocityMin, velocityMax } : plugin
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

  const addAux = () => {
    if (!concertSettings) return;
    const aux = [...(concertSettings.buses.aux ?? [])];
    const index = aux.findIndex(
      (bus) => bus.enabled === false || (bus.enabled === undefined && bus.inserts.length === 0)
    );
    if (index < 0 || index >= MAX_AUX_BUSES) return;
    aux[index] = { ...aux[index], enabled: true };
    updateConcertSettings({ buses: { ...concertSettings.buses, aux } });
  };

  const removeAux = (index: number) => {
    if (!concertSettings) return;
    const aux = [...(concertSettings.buses.aux ?? [])];
    if (!aux[index]) return;
    aux[index] = {
      ...aux[index],
      enabled: false,
      volumeDb: 0,
      pan: 0,
      muted: false,
      output: 1,
      inserts: [],
    };
    updateConcertSettings({ buses: { ...concertSettings.buses, aux } });

    if (draft) {
      onDraftChange({
        ...draft,
        plugins: (draft.plugins ?? []).map((plugin) => ({
          ...plugin,
          sends: (plugin.sends ?? []).map((value, position) =>
            position === index ? SEND_OFF_DB : value
          ),
        })),
        updatedAt: Date.now(),
      });
    }
    const clearSends = <T extends { sends?: number[] }>(strip: T): T => ({
      ...strip,
      sends: (strip.sends ?? []).map((value, position) => position === index ? SEND_OFF_DB : value),
    });
    updateConcertStrips(concertStrips.map(clearSends));
    if (currentSet) {
      updateSet(currentSet.id, { strips: (currentSet.strips ?? []).map(clearSends) });
    }
    for (const plugin of loadedPlugins) {
      const layerId = plugin.layerId ?? plugin.id;
      void setVstSend(layerId, index + 1, SEND_OFF_DB);
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
  const keyboardZoneColors = ['#FF9F0A', '#30D158', '#0A84FF', '#BF5AF2', '#FF453A', '#5E5CE6'];
  const keyboardZones = useMemo(
    () => stripViews.patch
      .filter((strip) => strip.role === 'instrument' && strip.level === 'patch')
      .map((strip, index) => ({
        id: strip.id,
        label: strip.name,
        low: strip.minNote ?? 0,
        high: strip.maxNote ?? 127,
        color: keyboardZoneColors[index % keyboardZoneColors.length],
      })),
    [stripViews]
  );
  const selectZone = (zoneId: string) => {
    setSelectedLayerId(zoneId);
    setFocusLayerId(zoneId);
  };

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
        case 'velocityMin':
          await setVstLayerVelocity(strip.id, value as number, strip.velocityMax);
          break;
        case 'velocityMax':
          await setVstLayerVelocity(strip.id, strip.velocityMin, value as number);
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
    // Geometria/aparência vão para o layout do concert; mappings ficam no patch.
    const layoutUpdate = Object.fromEntries(
      Object.entries(update).filter(([key]) => !MAPPING_FIELDS.has(key as keyof UiElement))
    ) as Partial<UiElement>;
    if (layout && Object.keys(layoutUpdate).length > 0) {
      updateConcertLayout({
        ...layout,
        elements: layout.elements.map((el) => (el.id === id ? { ...el, ...layoutUpdate } : el)),
      });
    }
  };
  const removeElement = (id: string) => {
    if (!draft) return;
    onDraftChange({
      ...draft,
      layout: { ...draft.layout, elements: draft.layout.elements.filter((el) => el.id !== id) },
      updatedAt: Date.now(),
    });
    if (layout) {
      updateConcertLayout({
        ...layout,
        elements: layout.elements.filter((el) => el.id !== id),
      });
    }
    if (selectedId === id) onSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    if (!draft) return;
    const src = draft.layout.elements.find((el) => el.id === id);
    if (!src) return;
    const copy: UiElement = { ...src, id: `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, x: src.x + 16, y: src.y + 16 };
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, copy] }, updatedAt: Date.now() });
    if (layout) {
      const layoutCopy = { ...copy };
      for (const key of MAPPING_FIELDS) delete (layoutCopy as Record<string, unknown>)[key as string];
      updateConcertLayout({ ...layout, elements: [...layout.elements, layoutCopy] });
    }
    onSelectedId(copy.id);
  };
  const bringFront = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...els, t] }, updatedAt: Date.now() });
    if (layout) {
      const layoutEls = layout.elements.filter((el) => el.id !== id);
      const layoutTarget = layout.elements.find((el) => el.id === id);
      if (layoutTarget) updateConcertLayout({ ...layout, elements: [...layoutEls, layoutTarget] });
    }
  };
  const sendBack = (id: string) => {
    if (!draft) return;
    const els = draft.layout.elements.filter((el) => el.id !== id);
    const t = draft.layout.elements.find((el) => el.id === id);
    if (t) onDraftChange({ ...draft, layout: { ...draft.layout, elements: [t, ...els] }, updatedAt: Date.now() });
    if (layout) {
      const layoutEls = layout.elements.filter((el) => el.id !== id);
      const layoutTarget = layout.elements.find((el) => el.id === id);
      if (layoutTarget) updateConcertLayout({ ...layout, elements: [layoutTarget, ...layoutEls] });
    }
  };
  const placeItems = (item: PaletteItem, x: number, y: number) => {
    if (!draft) return;
    const created: UiElement[] = [];
    if (item.group) {
      for (const m of item.group) created.push({ ...makeElement(m.type, snap8(x + m.dx), snap8(y + m.dy), m.label) });
    } else {
      const el = makeElement(item.type, 0, 0, item.label, item.orientation, item);
      el.x = snap8(Math.max(0, x - el.width / 2));
      el.y = snap8(Math.max(0, y - el.height / 2));
      created.push(el);
    }
    onDraftChange({ ...draft, layout: { ...draft.layout, elements: [...draft.layout.elements, ...created] }, updatedAt: Date.now() });
    if (layout) {
      updateConcertLayout({ ...layout, elements: [...layout.elements, ...created] });
    }
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

  /** Gravação da saída (Fase 6.4). */
  const toggleRecording = async () => {
    if (recordingPath) {
      await stopRecording();
      setRecordingPath(null);
      setActionNotice('Gravação salva');
      return;
    }
    const path = await startRecording();
    if (path) {
      setRecordingPath(path);
      setActionNotice('Gravando…');
    }
  };

  const handleLoadPlayback = async () => {
    const state = await loadPlayback();
    if (state) setPlaybackState(state);
  };

  const handlePlayPlayback = async () => {
    const state = await playPlayback();
    if (state) setPlaybackState(state);
  };

  const handleStopPlayback = async () => {
    const state = await stopPlayback();
    if (state) setPlaybackState(state);
  };

  /** Tap Tempo compartilhado pelo atalho Ctrl+T e pela ação mapeável (6.2/4.7). */
  const tapTempo = () => {    const now = Date.now();
    tapTimesRef.current = [...tapTimesRef.current.filter((time) => now - time < 3000), now];
    if (tapTimesRef.current.length >= 2) {
      const taps = tapTimesRef.current;
      const intervals = taps.slice(1).map((time, index) => time - taps[index]);
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      const tempo = Math.max(20, Math.min(300, Math.round(60000 / average)));
      void setAppStatus({ tempo });
      setActionNotice(`Tap Tempo: ${tempo} BPM`);
    } else {
      setActionNotice('Tap Tempo…');
    }
  };

  /** Executa as ações mapeáveis do 4.7 (chamado pelo listener de hardware). */
  executeActionRef.current = (action: MappableAction) => {
    switch (action) {
      case 'panic':
        panic();
        setActionNotice('Panic');
        break;
      case 'master-mute':
        toggleMasterMute();
        setActionNotice(masterMuted ? 'Master desmutado' : 'Master mudo');
        break;
      case 'tap-tempo':
        tapTempo();
        break;
      case 'next-patch':
      case 'previous-patch': {
        const ordered = [...presets]
          .sort((a, b) => a.programNumber - b.programNumber)
          .filter((patch) => !patch.skipped);
        const index = ordered.findIndex((patch) => patch.id === currentPreset?.id);
        const next = action === 'next-patch' ? ordered[index + 1] : ordered[index - 1];
        if (next) onSelectPreset(next);
        break;
      }
      case 'next-set': {
        const orderedSets = [...sets].sort((a, b) => a.order - b.order).filter((set) => !set.skipped);
        const index = orderedSets.findIndex((set) => set.id === currentSet?.id);
        const nextSet = orderedSets[index + 1];
        const next = nextSet
          ? presets
              .filter((patch) => patch.setId === nextSet.id && !patch.skipped)
              .sort((a, b) => (a.setOrder ?? 0) - (b.setOrder ?? 0))[0]
          : undefined;
        if (next) onSelectPreset(next);
        break;
      }
      case 'play-stop':
        void setAppStatus({ isPlaying: !appStatus.isPlaying });
        setActionNotice(appStatus.isPlaying ? 'Stop' : 'Play');
        break;
      case 'metronome': {
        const enabled = !(concertSettings?.metronome.enabled ?? appStatus.isMetronomeOn);
        if (concertSettings) {
          updateConcertSettings({ metronome: { ...concertSettings.metronome, enabled } });
        } else {
          void setAppStatus({ isMetronomeOn: enabled });
        }
        setActionNotice(enabled ? 'Metrônomo ligado' : 'Metrônomo desligado');
        break;
      }
      case 'current-notes':
        setActionNotice(
          activeNotes.size > 0
            ? `Notas atuais: ${[...activeNotes].sort((a, b) => a - b).join(', ')}`
            : 'Nenhuma nota ativa'
        );
        break;
      default:
        break;
    }
  };

  // Modos: 1/2 = Layout/Edit (em janela), 3 = Perform (em janela), 4 = Perform em tela cheia.
  const changeMode = (next: ConcertMode) => {
    void window.electronAPI.windowSetFullscreen(false);
    if (next === 'layout') setConcertSelected(false);
    onModeChange(next);
  };
  const enterPerformFullscreen = () => {
    void window.electronAPI.windowSetFullscreen(true);
    onModeChange('perform');
  };

  // Atalhos globais: Cmd+1/2/3/4 modos, Ctrl+P panic, Ctrl+M mute, Del remove, Ctrl+D duplica, F foca busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); changeMode('layout'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); changeMode('edit'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') { e.preventDefault(); changeMode('perform'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') { e.preventDefault(); enterPerformFullscreen(); return; }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMappingsOpen((open) => !open);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); panic(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMasterMute(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setLibraryOpen((open) => !open);
        return;
      }
      if ((e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 't') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't')) {
        e.preventDefault();
        setTunerOpen((open) => !open);
        return;
      }
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        tapTempo();
        return;
      }
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void toggleRecording();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsTab('general');
        return;
      }
      if (target?.closest('input,select,textarea')) return;
      // Atalhos da Patch List (copiar, colar, duplicar, deletar patches) são
      // tratados pelo próprio componente quando ele tem o foco.
      if (target?.closest('[data-patch-list]')) return;
      if (e.key.toLowerCase() === 'f') {
        const input = document.querySelector('aside input[placeholder*="Buscar"]') as HTMLInputElement | null;
        if (input) { e.preventDefault(); input.focus(); }
        return;
      }
      if (mode === 'perform') {
        if (e.key === 'Escape') {
          e.preventDefault();
          void window.electronAPI.windowSetFullscreen(false);
          performQueryRef.current = '';
          setPerformQuery('');
          return;
        }
        const shortcut = shortcutFromKeyboardEvent(e);
        const shortcutPatch = shortcut
          ? presets.find((patch) => (patch.shortcut ?? '') === shortcut)
          : undefined;
        if (shortcutPatch) {
          e.preventDefault();
          onSelectPreset(shortcutPatch);
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); panic(); return; }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMasterMute(); return; }
        const skip = e.ctrlKey || e.metaKey;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const ordered = [...presets]
            .sort((a, b) => a.programNumber - b.programNumber)
            .filter((patch) => !skip || !patch.skipped);
          const index = ordered.findIndex((patch) => patch.id === currentPreset?.id);
          const next = e.key === 'ArrowDown' ? ordered[index + 1] : ordered[index - 1];
          if (next) { e.preventDefault(); onSelectPreset(next); }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const orderedSets = [...sets].sort((a, b) => a.order - b.order).filter((set) => !skip || !set.skipped);
          const index = orderedSets.findIndex((set) => set.id === currentPreset?.setId);
          const nextSet = e.key === 'ArrowRight' ? orderedSets[index + 1] : orderedSets[index - 1];
          if (nextSet) {
            const first = presets
              .filter((patch) => patch.setId === nextSet.id && !patch.skipped)
              .sort((a, b) => (a.setOrder ?? 0) - (b.setOrder ?? 0))[0];
            if (first) { e.preventDefault(); onSelectPreset(first); }
          }
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
          e.preventDefault();
          const next = performQueryRef.current + e.key;
          performQueryRef.current = next;
          setPerformQuery(next);
          window.clearTimeout(performQueryTimer.current);
          performQueryTimer.current = window.setTimeout(() => {
            const term = next.trim().toLowerCase();
            const match = /^\d+$/.test(term)
              ? [...presets]
                  .sort((a, b) => a.programNumber - b.programNumber)
                  .find((patch) => String(patch.programNumber + 1).startsWith(term))
              : [...presets].find((patch) => patch.name.toLowerCase().startsWith(term));
            if (match) onSelectPreset(match);
            performQueryRef.current = '';
            setPerformQuery('');
          }, 600);
          return;
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
    const elements = performElements;
    const performListTerm = performListQuery.trim().toLowerCase();
    const performListRows = [...presets]
      .filter((patch) => {
        if (!performListTerm) return true;
        const setName = sets.find((set) => set.id === patch.setId)?.name ?? '';
        return `${patch.name} ${String(patch.programNumber + 1)} ${patch.shortcut ?? ''} ${setName}`
          .toLowerCase()
          .includes(performListTerm);
      })
      .sort((a, b) => {
        const setA = sets.find((set) => set.id === a.setId)?.order ?? -1;
        const setB = sets.find((set) => set.id === b.setId)?.order ?? -1;
        return setA - setB
          || (a.setOrder ?? 0) - (b.setOrder ?? 0)
          || a.programNumber - b.programNumber;
      });
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
          {performQuery && (
            <span className="rounded px-2 py-1 text-[11px] font-bold" style={{ background: '#0A84FF', color: '#fff' }}>
              {performQuery}
            </span>
          )}
          {masterMuted && (
            <span className="rounded px-2 py-1 text-[11px] font-bold" style={{ background: '#FF554D', color: '#1A1A1A' }}>
              MASTER MUDO
            </span>
          )}
          {recordingPath && (
            <span className="rounded px-2 py-1 text-[11px] font-bold" style={{ background: '#FF453A', color: '#fff' }}>
              ● GRAVANDO
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
            onClick={() => void toggleRecording()}
            title="Gravar saída do concert (Ctrl+R)"
            style={recordingPath ? { color: '#FF8A80', borderColor: '#FF554D' } : undefined}
          >
            {recordingPath ? 'Parar gravação' : 'Gravar'}
          </button>
          <button
            className="hw-squarebtn px-3 py-1.5 text-xs"
            onClick={() => setTunerOpen(true)}
            title="Afinador (Cmd+T / Ctrl+Shift+T)"
          >
            Afinador
          </button>
          <button
            className="hw-squarebtn px-3 py-1.5 text-xs"
            onClick={() => setSettingsTab('general')}
            title="Configurações"
          >
            Configurações
          </button>
          <button
            className="hw-squarebtn px-3 py-1.5 text-xs"
            onClick={() => setPerformListOpen((open) => !open)}
            title="Mostrar/ocultar lista de patches"
          >
            {performListOpen ? 'Ocultar lista' : 'Patch List'}
          </button>
          <button
            className="hw-squarebtn ml-auto px-3 py-1.5"
            onClick={() => changeMode('edit')}
          >
            Sair do Perform
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          {performListOpen && (
            <aside
              className="flex w-[240px] shrink-0 flex-col border-r"
              style={{ borderColor: '#303032', background: '#1A1A1C' }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: '#303032' }}>
                <div className="hw-label">Patch List</div>
                <input
                  value={performListQuery}
                  onChange={(event) => setPerformListQuery(event.target.value)}
                  placeholder="Buscar patch…"
                  className="mt-2 w-full rounded-lg border px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-[#0A84FF]"
                  style={{ borderColor: '#3A3A3C', background: '#242426' }}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {performListRows.length === 0 && (
                  <div className="p-3 text-center text-[11px]" style={{ color: '#8E8E93' }}>
                    Nenhum patch.
                  </div>
                )}
                {performListRows.map((patch) => {
                  const active = patch.id === currentPreset?.id;
                  const setName = sets.find((set) => set.id === patch.setId)?.name;
                  return (
                    <button
                      key={patch.id}
                      onClick={() => onSelectPreset(patch)}
                      className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px]"
                      style={active
                        ? { background: 'rgba(10,132,255,0.26)', color: '#FFFFFF' }
                        : { color: '#D1D1D6' }}
                    >
                      <span className="w-8 shrink-0 text-right tabular-nums" style={{ color: active ? '#CFE5FF' : '#8E8E93' }}>
                        {String(patch.programNumber + 1).padStart(3, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="block truncate font-medium">{patch.name}</span>
                        <span className="block truncate text-[9px]" style={{ color: '#8E8E93' }}>
                          {setName ?? 'Sem set'}{patch.skipped ? ' · skip' : ''}
                        </span>
                      </span>
                      {patch.shortcut && (
                        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: '#2C2C2E', color: '#9AD1FF', border: '1px solid #3A3A3C' }}>
                          {patch.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
          <div className="relative min-h-0 flex-1" style={{ background: 'radial-gradient(circle at 50% 0%, #2A2A2D, #1C1C1E 70%)' }}>
          {currentPreset ? (
            <>
              <div className="pointer-events-none absolute left-0 right-0 top-3 z-10 text-center">
                <div className="text-2xl font-semibold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{currentPreset.name}</div>
                <div className="text-[11px]" style={{ color: '#8E8E93' }}>Programa {currentPreset.programNumber + 1} · Canal {currentPreset.midiChannel + 1}</div>
              </div>
              <FitToView elements={elements} topInset={64}>
                {elements.map((el) => (
                  <StageControl key={el.id} element={el} channel={currentPreset.midiChannel} layoutMode="absolute" activeNotes={activeNotes} onMidiMessage={onMidiMessage} onSetVstParameter={onSetVstParameter} keyboardZones={keyboardZones} selectedZoneId={selectedLayerId} onZoneClick={selectZone} />
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
          onSelectConcert={() => {
            if (mode === 'layout') return;
            setConcertSelected(true);
            onSelectedId(null);
          }}
          onSelectPreset={(preset) => { setConcertSelected(false); onSelectPreset(preset); }}
          onEditPreset={onEditPreset}
          onNewPatch={onNewPatch}
          onNewSet={() => createSet()}
          onRenameSet={renameSet}
          onDeleteSet={deleteSet}
          onSetTranspose={(setId, semitones) => updateSet(setId, { transpose: semitones })}
          onToggleSetExpanded={toggleSetExpanded}
          onToggleSetSkipped={toggleSetSkipped}
          onTogglePresetSkipped={(id) => void togglePresetSkipped(id)}
          onReorderSets={reorderSets}
          onResetProgramNumbers={() => void resetProgramNumbers()}
          onCopyPatches={copyPatches}
          onPastePatches={pastePatches}
          onDuplicatePatches={duplicatePatches}
          onDeletePatches={deletePatches}
          onNewPatchFromSelection={newPatchFromSelection}
          onNewSetFromSelection={newSetFromSelection}
          onExportPatch={(id) => void exportPatch(id)}
          onImportPatch={() => void importPatch().then((imported) => { if (imported) onSelectPreset(imported); })}
          onExportSet={(id) => void exportSet(id)}
          onImportSet={() => void importSet()}
          onMovePatches={movePatches}
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
                  elements={displayElements}
                  selectedId={selectedId}
                  armed={mode === 'layout' && armedKey !== null && !!draft}
                  locked={!draft}
                  movable={mode === 'layout'}
                  previewKeyboard={mode === 'edit'}
                  interactivePreview={false}
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
                  keyboardZones={keyboardZones}
                  selectedZoneId={selectedLayerId}
                  onZoneClick={selectZone}
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
          {concertSelected && concertSettings && mode !== 'layout' ? (
            <ConcertSettingsPanel
              settings={concertSettings}
              tempo={appStatus.tempo}
              onChange={updateConcertSettings}
              onTempoChange={(tempo) => void setAppStatus({ tempo })}
              midiInputNames={midiInputNames}
            />
          ) : draft ? (
            <Inspector
              mode={mode === 'layout' ? 'layout' : 'edit'}
              draft={draft}
              presets={presets}
              scannedPlugins={scannedPlugins}
              scannedParams={scannedParams}
              selectedElement={selected}
              selectedLayerId={selectedLayerId}
              selectedPlugin={selectedLoadedPlugin}
              onLoadPresetAsNewStrip={loadPresetAsNewStrip}
              onApplyPresetToSelected={applyPresetToSelected}
              onLayerRangeChange={(assignment, layerId, minNote, maxNote) => void changeLayerRange(assignment, layerId, minNote, maxNote)}
              onLayerVelocityChange={(assignment, layerId, velocityMin, velocityMax) => void changeLayerVelocity(assignment, layerId, velocityMin, velocityMax)}
              transposeTotal={(activePreset?.transpose ?? 0) + (currentSet?.transpose ?? 0) + (concertSettings?.midi.transpose ?? 0)}
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
            audioInput={activePreset?.audioInput}
            audioInputState={audioInputState}
            audioInputChannels={ctx.audioDevices?.current?.inputChannels ?? 0}
            onAddAudioInput={addAudioInput}
            onRemoveAudioInput={removeAudioInput}
            onAudioInputChange={changeAudioInput}
            onResetAudioFeedback={resetAudioFeedback}
            onKeepAudioMuted={keepAudioInputMuted}
            onDisableAudioFeedbackProtection={disableAudioFeedbackProtection}
            playbackState={playbackState}
            onLoadPlayback={() => void handleLoadPlayback()}
            onPlayPlayback={() => void handlePlayPlayback()}
            onStopPlayback={() => void handleStopPlayback()}
            onRequestScan={scanVstPlugins}
            onAdd={addLayer}
            onAddSplit={addSplitLayer}
            onLearnSplitNote={learnSplitNote}
            onRemove={removeLayer}
            onCopy={copyLayer}
            onReplace={replaceLayer}
            focusLayerId={focusLayerId}
            onAddInsert={addInsert}
            onRemoveInsert={removeInsertFromStrip}
            onToggleInsertBypass={toggleInsertBypass}
            onOpenInsertEditor={openInsertEditor}
            onSetSend={(layerId, aux, levelDb) => void changeLayerSend(layerId, aux, levelDb)}
            onSetLayerOutput={(layerId, output) => void changeLayerOutput(layerId, output)}
            onSetBusMix={(bus, update) => void changeBusMix(bus, update)}
            onAddAux={addAux}
            onRemoveAux={removeAux}
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
        {actionNotice && <span className="truncate" style={{ color: '#FFD60A' }}>{actionNotice}</span>}
        <span className="ml-auto" style={{ color: ctx.audioDevices?.running ? '#30D158' : '#9A9AA0' }}>
          {ctx.audioDevices?.running ? 'Áudio ativo' : 'Áudio parado — configure em Configurações'}
        </span>
      </div>
      {settingsTab && (
        <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
      )}
      {libraryOpen && (
        <PatchLibraryModal
          presets={presets}
          sets={sets}
          currentPresetId={currentPreset?.id ?? null}
          onSelect={(preset) => { setConcertSelected(false); onSelectPreset(preset); }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      {tunerOpen && (
        <TunerModal
          state={audioInputState}
          referenceHz={activePreset?.tuningReferenceHz ?? 440}
          onClose={() => setTunerOpen(false)}
        />
      )}
      {mappingsOpen && (
        <AssignmentsMappingsTable
          mappings={mappings}
          presets={presets}
          sets={sets}
          currentPatch={currentPreset}
          currentSet={currentSet ?? null}
          layout={layout}
          scannedPlugins={scannedPlugins}
          onChange={updateMappings}
          onClose={() => setMappingsOpen(false)}
        />
      )}
    </div>
  );
};
