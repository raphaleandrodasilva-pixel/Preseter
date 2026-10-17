import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Preset,
  PresetSet,
  VstPluginInfo,
  UiElement,
  LayoutConfig,
  AppStatus,
  AudioDeviceSnapshot,
  AudioStartOptions,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  SavedAudioSettings,
  AppPreferences,
  ConcertState,
  ConcertSyncPayload,
  ConcertSettings,
  ConcertTemplateSummary,
  MenuAction,
} from '@shared/types';
import type { ElectronAPI } from '../types/electron-api';
import { MidiDeviceInfo, RawMidiEvent, WebMidiService } from '../services/WebMidiService';
import { ConcertHistory } from '@shared/concert-history';

/** Instantâneo do concert para o desfazer/refazer (Fase 2.5). */
interface ConcertSnapshot {
  name: string;
  tempo: number;
  sets: PresetSet[];
  settings: ConcertSettings;
  patches: Preset[];
}

export interface AppContextType {
  // Estado
  presets: Preset[];
  sets: PresetSet[];
  concertName: string;
  currentPreset: Preset | null;
  loadedPlugins: VstPluginInfo[];
  mixState: EngineMixState | null;
  scannedPlugins: VstPluginInfo[];
  audioDevices: AudioDeviceSnapshot | null;
  audioSettings: SavedAudioSettings | null;
  preferences: AppPreferences | null;
  /** Mensagem quando o motor de áudio caiu (null = tudo certo). */
  engineError: string | null;
  /** Caminho do arquivo `.preseter` aberto (null = ainda não salvo). */
  concertPath: string | null;
  /** true quando há alterações não salvas no concert. */
  concertDirty: boolean;
  /** Erro de Arquivo (abrir/salvar) do concert. */
  concertError: string | null;
  /** Configurações do concert (Concert Settings, Fase 2.4). */
  concertSettings: ConcertSettings | null;
  /** Atualiza uma seção das configurações do concert. */
  updateConcertSettings: (patch: Partial<ConcertSettings>) => void;
  /** Desfazer/Refazer edições do concert (Fase 2.5). */
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Incrementa a cada concert novo/aberto, para o shell descartar rascunhos. */
  concertRevision: number;
  /** Templates disponíveis ao criar um concert novo (Fase 2.3). */
  concertTemplates: ConcertTemplateSummary[];
  /** true quando o seletor de templates está aberto. */
  templatePickerOpen: boolean;
  /** Cria um concert novo a partir de um template. */
  chooseTemplate: (templateId: string) => Promise<void>;
  /** Fecha o seletor de templates sem criar nada. */
  cancelTemplatePicker: () => void;
  midiDevices: MidiDeviceInfo[];
  midiError: string | null;
  midiLastMessage: string | null;
  /** Notas com note-on aberto vindas da entrada MIDI (Fase C) */
  activeNotes: Set<number>;
  layout: LayoutConfig | null;
  appStatus: AppStatus;
  isPanelOpen: {
    midi: boolean;
    vst: boolean;
    presets: boolean;
  };

  // Ações de Preset
  savePreset: (preset: Preset) => Promise<boolean>;
  loadPreset: (presetId: string) => Promise<boolean>;
  deletePreset: (presetId: string) => Promise<boolean>;
  createPreset: (name: string, programNumber?: number) => Preset;

  // Ações de Concert / Sets (fase 1 visual — estado local + localStorage)
  setConcertName: (name: string) => void;
  createSet: (name?: string) => PresetSet;
  renameSet: (setId: string, name: string) => void;
  deleteSet: (setId: string) => void;
  toggleSetExpanded: (setId: string) => void;
  toggleSetSkipped: (setId: string) => void;
  reorderSets: (orderedIds: string[]) => void;
  movePresetToSet: (presetId: string, setId: string | undefined, order?: number) => Promise<boolean>;
  reorderPatchesInSet: (setId: string | undefined, orderedIds: string[]) => Promise<void>;
  togglePresetSkipped: (presetId: string) => Promise<boolean>;
  resetProgramNumbers: () => Promise<void>;

  // Ações MIDI
  listMidiDevices: () => Promise<any[]>;
  openMidiPort: (deviceId: string, type: 'input' | 'output') => Promise<boolean>;
  sendProgramChange: (program: number, channel?: number) => Promise<any>;
  sendMidiMessage: (message: number[]) => Promise<boolean>;
  /** Panic do motor: all notes off + all sound off em todos os canais. */
  enginePanic: () => Promise<boolean>;
  /** Assina mensagens MIDI brutas (MIDI Learn). Retorna unsubscribe. */
  subscribeMidiLearn: (listener: (event: RawMidiEvent) => void) => () => void;

  // Ações VST
  scanVstPlugins: () => Promise<any[]>;
  loadVstPlugin: (pluginPath: string, layerId?: string, minNote?: number, maxNote?: number) => Promise<VstPluginInfo | null>;
  unloadVstPlugin: (pluginId: string) => Promise<boolean>;
  setVstParameter: (pluginId: string, paramId: string, value: number) => Promise<boolean>;
  openVstEditor: (pluginId: string) => Promise<boolean>;
  closeVstEditor: (pluginId: string) => Promise<boolean>;
  setVstLayerRange: (layerId: string, minNote: number, maxNote: number) => Promise<boolean>;
  setVstLayerMix: (layerId: string, update: LayerMixUpdate) => Promise<boolean>;
  setVstMasterMix: (update: MasterMixUpdate) => Promise<boolean>;
  refreshAudioSettings: () => Promise<void>;
  startAudio: (options: AudioStartOptions) => Promise<boolean>;
  stopAudio: () => Promise<boolean>;
  updatePreferences: (update: Partial<AppPreferences>) => Promise<AppPreferences | null>;

  // Ações de Layout/UI
  addUIElement: (element: UiElement) => void;
  updateUIElement: (element: UiElement) => void;
  removeUIElement: (id: string) => void;
  setLayout: (layout: LayoutConfig) => void;

  // Ações de App
  togglePanel: (panel: keyof AppContextType['isPanelOpen']) => void;
  setAppStatus: (status: Partial<AppStatus>) => Promise<AppStatus>;
  sendMidiNote: (note: number, velocity: number, channel: number) => void;
  sendControlChange: (cc: number, value: number, channel: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [midiLastMessage, setMidiLastMessage] = useState<string | null>(null);
  const webMidi = useRef<WebMidiService | null>(null);
  if (!webMidi.current) {
    webMidi.current = new WebMidiService(
      (program, channel) => {
        setMidiLastMessage(`Program Change ${program} · canal ${channel + 1}`);
        void window.electronAPI.midiInputProgramChange(program, channel)
          .then(() => setMidiError(null))
          .catch((error: unknown) => {
            setMidiError(error instanceof Error ? error.message : 'Falha ao ativar o preset MIDI.');
          });
      },
      setMidiError
    );
  }
  const [presets, setPresets] = useState<Preset[]>([]);
  const presetsRef = useRef(presets);
  const [sets, setSets] = useState<PresetSet[]>([]);
  const [concertName, setConcertNameState] = useState<string>('Meu Concert');
  const [concertPath, setConcertPath] = useState<string | null>(null);
  const [concertDirty, setConcertDirty] = useState(false);
  const [concertError, setConcertError] = useState<string | null>(null);
  const [concertSettings, setConcertSettings] = useState<ConcertSettings | null>(null);
  const [concertRevision, setConcertRevision] = useState(0);
  const [concertTemplates, setConcertTemplates] = useState<ConcertTemplateSummary[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  /** true depois que o estado do concert foi carregado do main (libera o sync). */
  const concertReady = useRef(false);
  /** Patch a reabrir depois que a lista de patches estiver pronta. */
  const pendingPatchRef = useRef<string | null>(null);
  /** Última ação do menu nativo, lida pelo listener (sem closure velha). */
  const menuHandlerRef = useRef<(action: MenuAction) => void>(() => undefined);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [currentPreset, setCurrentPreset] = useState<Preset | null>(null);
  const [loadedPlugins, setLoadedPlugins] = useState<VstPluginInfo[]>([]);
  const [mixState, setMixState] = useState<EngineMixState | null>(null);
  const [scannedPlugins, setScannedPlugins] = useState<VstPluginInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceSnapshot | null>(null);
  const [audioSettings, setAudioSettings] = useState<SavedAudioSettings | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [layout, setLayoutState] = useState<LayoutConfig | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus>({
    isPlaying: false,
    currentPresetId: null,
    currentProgramNumber: 0,
    tempo: 120,
    isMetronomeOn: false,
  });
  const [openPanels, setOpenPanels] = useState({
    midi: false,
    vst: false,
    presets: false,
  });

  /** Aplica no renderer o estado do concert vindo do main. */
  const applyConcertState = useCallback((state: ConcertState) => {
    setPresets(state.patches);
    setSets(state.sets);
    setConcertNameState(state.name);
    setConcertPath(state.path);
    setConcertDirty(state.dirty);
    setLayoutState(state.layout);
    setConcertSettings(state.settings);
    setAppStatus((prev) => ({ ...prev, tempo: state.tempo, currentPresetId: null, currentProgramNumber: 0 }));
    setConcertRevision((revision) => revision + 1);
  }, []);

  /** Lê os dados do modelo antigo (localStorage) para a migração da Fase 2. */
  const readLegacyConcert = (): { sets?: PresetSet[]; name?: string } => {
    try {
      const rawSets = localStorage.getItem('preseter.sets.v1');
      const name = localStorage.getItem('preseter.concertName.v1') ?? undefined;
      return { sets: rawSets ? (JSON.parse(rawSets) as PresetSet[]) : undefined, name };
    } catch {
      return {};
    }
  };

  // Carregar dados iniciais (concert + estado do motor)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [concert, loaded, audio, prefs] = await Promise.all([
          window.electronAPI.concertInit(readLegacyConcert()),
          window.electronAPI.vstLoaded(),
          window.electronAPI.audioSettingsGet(),
          window.electronAPI.preferencesGet(),
        ]);
        applyConcertState(concert);
        pendingPatchRef.current = concert.lastPatchId;
        setLoadedPlugins(loaded);
        setAudioDevices(audio.devices);
        setAudioSettings(audio.settings);
        setPreferences(prefs);
        concertReady.current = true;
      } catch (error) {
        setMidiError(error instanceof Error ? error.message : 'Falha ao iniciar os serviços do Preseter.');
      }
    };
    void loadData();
  }, [applyConcertState]);

  useEffect(() => {
    presetsRef.current = presets;
  }, [presets]);

  // Notas ativas da entrada MIDI (acende o teclado na tela)
  useEffect(() => {
    const service = webMidi.current;
    if (!service) return;
    return service.onRawMessage((event) => {
      if (event.kind !== 'note') return;
      setActiveNotes((prev) => {
        const next = new Set(prev);
        if (event.value > 0) next.add(event.number);
        else next.delete(event.number);
        return next;
      });
    });
  }, []);

  // Escutar eventos do main process
  useEffect(() => {
    window.electronAPI.onPresetList((list) => {
      setPresets(list);
    });

    window.electronAPI.onPresetLoaded((data) => {
      setCurrentPreset(presetsRef.current.find((preset) => preset.id === data.presetId) || null);
      setAppStatus((prev) => ({
        ...prev,
        currentPresetId: data.presetId,
        currentProgramNumber: data.programNumber,
      }));
    });

    window.electronAPI.onAppStatusChange((status) => {
      setAppStatus(status);
    });

    window.electronAPI.onLayoutChange((newLayout) => {
      setLayoutState(newLayout);
    });

    window.electronAPI.onPluginLoaded((plugin) => {
      setLoadedPlugins((prev) => {
        const layerId = plugin.layerId ?? plugin.id;
        const next = prev.filter((item) => (item.layerId ?? item.id) !== layerId);
        return [...next, plugin];
      });
    });

    window.electronAPI.onPluginUnloaded((pluginId) => {
      setLoadedPlugins((prev) => prev.filter((p) => (p.layerId ?? p.id) !== pluginId));
    });

    window.electronAPI.onParameterChanged((data) => {
      // Atualizar parâmetro visual
      setLoadedPlugins((prev) =>
        prev.map((plugin) => {
          if ((plugin.layerId ?? plugin.id) !== (data.layerId ?? data.pluginId)) return plugin;
          return {
            ...plugin,
            parameters: plugin.parameters.map((p) =>
              p.id === data.paramId
                ? { ...p, value: data.value }
                : p
            ),
          };
        })
      );
    });

    window.electronAPI.onEngineCrashed((data) => {
      setEngineError(data?.message ?? 'O motor de áudio encerrou.');
    });

    window.electronAPI.onEngineRecovered(() => {
      setEngineError(null);
      void (async () => {
        try {
          const [loaded, mix] = await Promise.all([
            window.electronAPI.vstLoaded(),
            window.electronAPI.vstMixGet(),
          ]);
          setLoadedPlugins(loaded);
          setMixState(mix);
        } catch {
          /* a UI também se atualiza pelos eventos plugin-loaded/plugin-unloaded */
        }
      })();
    });
  }, []);

  // === Preset Actions ===
  const savePreset = useCallback(async (preset: Preset): Promise<boolean> => {
    const result = await window.electronAPI.presetSave(preset);
    if (result) {
      setPresets((prev) => {
        const existing = prev.findIndex((p) => p.id === preset.id);
        if (existing !== -1) {
          const newPresets = [...prev];
          newPresets[existing] = preset;
          return newPresets;
        }
        return [...prev, preset];
      });
    }
    return result;
  }, []);

  const loadPreset = useCallback(async (presetId: string): Promise<boolean> => {
    let result: boolean;
    try {
      result = await window.electronAPI.presetLoad(presetId);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao carregar o preset.');
      return false;
    }
    if (result) {
      setLoadedPlugins(await window.electronAPI.vstLoaded());
      try {
        setMixState(await window.electronAPI.vstMixGet());
      } catch (error) {
        setMidiError(error instanceof Error ? error.message : 'Falha ao carregar a mixagem do patch.');
      }
      try {
        const audio = await window.electronAPI.audioSettingsGet();
        setAudioDevices(audio.devices);
        setAudioSettings(audio.settings);
      } catch (error) {
        setMidiError(error instanceof Error ? error.message : 'Falha ao atualizar o estado de áudio.');
      }
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setCurrentPreset(preset);
        setLayoutState(preset.layout);
        setAppStatus((prev) => ({
          ...prev,
          currentPresetId: presetId,
          currentProgramNumber: preset.programNumber,
        }));
      }
    }
    return result;
  }, [presets]);

  // Reabre o último patch usado, após a lista de patches ter chegado do main.
  useEffect(() => {
    const id = pendingPatchRef.current;
    if (!id || presets.length === 0) return;
    pendingPatchRef.current = null;
    if (presets.some((preset) => preset.id === id)) void loadPreset(id);
  }, [presets, loadPreset]);

  const deletePreset = useCallback(async (presetId: string): Promise<boolean> => {
    const result = await window.electronAPI.presetDelete(presetId);
    if (result) {
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
    }
    return result;
  }, []);

  const createPreset = useCallback(
    (name: string, programNumber: number = 0): Preset => {
      const newPreset: Preset = {
        id: `preset_${Date.now()}`,
        name,
        programNumber,
        midiChannel: 0,
        plugins: [],
        vstStates: {},
        layout: { elements: [], background: null, tempo: 120 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return newPreset;
    },
    []
  );

  // === Concert / Sets (arquivo .preseter) ===

  // Reenvia nome, tempo e sets ao main, que mantém o arquivo do concert.
  // A lista de patches é sincronizada por preset-save/preset-delete.
  useEffect(() => {
    if (!concertReady.current || !concertSettings) return;
    const handle = window.setTimeout(() => {
      const payload: ConcertSyncPayload = {
        name: concertName,
        tempo: appStatus.tempo,
        sets,
        settings: concertSettings,
      };
      window.electronAPI
        .concertSync(payload)
        .then((result) => setConcertDirty(result.dirty))
        .catch((error: unknown) =>
          setConcertError(error instanceof Error ? error.message : 'Falha ao sincronizar o concert.')
        );
    }, 300);
    return () => window.clearTimeout(handle);
  }, [concertName, appStatus.tempo, sets, concertSettings, presets]);

  const updateConcertSettings = useCallback((patch: Partial<ConcertSettings>) => {
    setConcertSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // === Desfazer / Refazer (Fase 2.5) ===
  const historyRef = useRef<ConcertHistory<ConcertSnapshot> | null>(null);
  if (!historyRef.current) historyRef.current = new ConcertHistory<ConcertSnapshot>();
  const history = historyRef.current;
  const [historyVersion, setHistoryVersion] = useState(0);

  const applySnapshot = useCallback((snapshot: ConcertSnapshot) => {
    setConcertNameState(snapshot.name);
    setAppStatus((prev) => ({ ...prev, tempo: snapshot.tempo }));
    setSets(snapshot.sets);
    setConcertSettings(snapshot.settings);
    setPresets(snapshot.patches);
  }, []);

  // Concert novo/aberto: recomeça o histórico.
  useEffect(() => {
    history.reset();
    setHistoryVersion((version) => version + 1);
  }, [concertRevision, history]);

  // Guarda o estado anterior a cada edição (agrupada) do concert.
  useEffect(() => {
    if (!concertReady.current || !concertSettings) return;
    const handle = window.setTimeout(() => {
      const snapshot: ConcertSnapshot = {
        name: concertName,
        tempo: appStatus.tempo,
        sets,
        settings: concertSettings,
        patches: presets,
      };
      if (history.commit(snapshot)) setHistoryVersion((version) => version + 1);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [concertName, appStatus.tempo, sets, concertSettings, presets, history]);

  const undo = useCallback(() => {
    const previous = history.undo();
    if (!previous) return;
    applySnapshot(previous);
    setHistoryVersion((version) => version + 1);
  }, [applySnapshot, history]);

  const redo = useCallback(() => {
    const next = history.redo();
    if (!next) return;
    applySnapshot(next);
    setHistoryVersion((version) => version + 1);
  }, [applySnapshot, history]);

  // === Arquivo (menu nativo) ===
  const handleMenuAction = useCallback(
    async (action: MenuAction) => {
      setConcertError(null);
      try {
        if (action.action === 'new') {
          const templates = await window.electronAPI.concertTemplates();
          setConcertTemplates(templates);
          setTemplatePickerOpen(true);
        } else if (action.action === 'open') {
          const state = await window.electronAPI.concertOpen();
          if (state) applyConcertState(state);
        } else if (action.action === 'open-recent') {
          applyConcertState(await window.electronAPI.concertOpenRecent(action.path));
        } else if (action.action === 'save' || action.action === 'save-as') {
          const state = await window.electronAPI.concertSave(action.action === 'save-as');
          if (state) {
            setConcertPath(state.path);
            setConcertDirty(state.dirty);
          }
        } else if (action.action === 'undo') {
          undo();
        } else if (action.action === 'redo') {
          redo();
        }
      } catch (error) {
        setConcertError(error instanceof Error ? error.message : 'Falha na operação de arquivo.');
      }
    },
    [applyConcertState, undo, redo]
  );
  menuHandlerRef.current = handleMenuAction;

  const chooseTemplate = useCallback(
    async (templateId: string) => {
      setTemplatePickerOpen(false);
      setConcertError(null);
      try {
        applyConcertState(await window.electronAPI.concertNew(templateId));
      } catch (error) {
        setConcertError(error instanceof Error ? error.message : 'Falha ao criar o concert.');
      }
    },
    [applyConcertState]
  );

  const cancelTemplatePicker = useCallback(() => setTemplatePickerOpen(false), []);

  useEffect(() => {
    window.electronAPI.onMenuAction((action) => void menuHandlerRef.current(action));
  }, []);

  const setConcertName = useCallback((name: string) => setConcertNameState(name), []);

  const createSet = useCallback((name?: string): PresetSet => {
    const next: PresetSet = {
      id: `set_${Date.now()}`,
      name: name?.trim() || `Set ${sets.length + 1}`,
      order: sets.length,
      expanded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSets((prev) => [...prev, next]);
    return next;
  }, [sets.length]);

  const renameSet = useCallback((setId: string, name: string) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, name, updatedAt: Date.now() } : s)));
  }, []);

  const deleteSet = useCallback((setId: string) => {
    // Patches do set voltam para "sem set" (setId undefined) — sem deletar sons
    setPresets((prev) => prev.map((p) => (p.setId === setId ? { ...p, setId: undefined } : p)));
    setSets((prev) => prev.filter((s) => s.id !== setId));
  }, []);

  const toggleSetExpanded = useCallback((setId: string) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, expanded: s.expanded === false ? true : false } : s)));
  }, []);

  const toggleSetSkipped = useCallback((setId: string) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, skipped: !s.skipped } : s)));
  }, []);

  const reorderSets = useCallback((orderedIds: string[]) => {
    setSets((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]));
      return orderedIds
        .map((id) => map.get(id))
        .filter((s): s is PresetSet => !!s)
        .map((s, i) => ({ ...s, order: i, updatedAt: Date.now() }));
    });
  }, []);

  const persistPreset = useCallback(async (preset: Preset): Promise<boolean> => {
    const ok = await window.electronAPI.presetSave({ ...preset, updatedAt: Date.now() });
    if (ok) {
      setPresets((prev) => {
        const i = prev.findIndex((p) => p.id === preset.id);
        if (i === -1) return [...prev, preset];
        const next = [...prev];
        next[i] = preset;
        return next;
      });
      setCurrentPreset((cur) => (cur?.id === preset.id ? preset : cur));
    }
    return ok;
  }, []);

  const movePresetToSet = useCallback(async (presetId: string, setId: string | undefined, order?: number): Promise<boolean> => {
    const target = presetsRef.current.find((p) => p.id === presetId);
    if (!target) return false;
    return persistPreset({ ...target, setId, setOrder: order ?? Date.now(), updatedAt: Date.now() });
  }, [persistPreset]);

  const reorderPatchesInSet = useCallback(async (setId: string | undefined, orderedIds: string[]): Promise<void> => {
    const updates: Preset[] = [];
    orderedIds.forEach((id, i) => {
      const p = presetsRef.current.find((x) => x.id === id);
      if (p) updates.push({ ...p, setId: setId ?? undefined, setOrder: i, updatedAt: Date.now() });
    });
    for (const u of updates) {
      await window.electronAPI.presetSave(u);
    }
    setPresets((prev) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      return prev.map((p) => map.get(p.id) ?? p);
    });
  }, []);

  const togglePresetSkipped = useCallback(async (presetId: string): Promise<boolean> => {
    const target = presetsRef.current.find((p) => p.id === presetId);
    if (!target) return false;
    return persistPreset({ ...target, skipped: !target.skipped });
  }, [persistPreset]);

  const resetProgramNumbers = useCallback(async (): Promise<void> => {
    // Atribui program numbers sequenciais pela ordem visual (sets + patches não-skip)
    const orderedSets = [...sets].sort((a, b) => a.order - b.order);
    let program = 0;
    const updates: Preset[] = [];
    const pushSet = (setId: string | undefined) => {
      const list = presetsRef.current
        .filter((p) => (p.setId ?? undefined) === setId)
        .sort((a, b) => (a.setOrder ?? a.programNumber) - (b.setOrder ?? b.programNumber));
      for (const p of list) {
        if (p.skipped) continue;
        if (program > 127) break;
        updates.push({ ...p, programNumber: program++, updatedAt: Date.now() });
      }
    };
    if (orderedSets.length === 0) {
      presetsRef.current.slice().sort((a, b) => a.programNumber - b.programNumber).forEach((p) => {
        if (p.skipped || program > 127) return;
        updates.push({ ...p, programNumber: program++, updatedAt: Date.now() });
      });
    } else {
      for (const s of orderedSets) {
        if (s.skipped) continue;
        pushSet(s.id);
      }
      pushSet(undefined);
    }
    for (const u of updates) {
      await window.electronAPI.presetSave(u);
    }
    setPresets((prev) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      return prev.map((p) => map.get(p.id) ?? p);
    });
  }, [sets]);

  // === MIDI Actions ===
  const listMidiDevices = useCallback(async () => {
    try {
      const devices = await webMidi.current!.listDevices();
      setMidiDevices(devices);
      setMidiError(null);
      return devices;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao acessar MIDI.';
      setMidiError(message);
      return [];
    }
  }, []);

  const openMidiPort = useCallback(async (deviceId: string, type: 'input' | 'output'): Promise<boolean> => {
    try {
      const connected = await webMidi.current!.openPort(deviceId, type);
      setMidiError(null);
      return connected;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao conectar dispositivo MIDI.');
      return false;
    }
  }, []);

  const sendProgramChange = useCallback(
    async (program: number, channel: number = 0) => {
      const sent = await webMidi.current!.sendProgramChange(program, channel);
      if (!sent) return { sent: false };
      const result = await window.electronAPI.midiProgramChange(program, channel);
      setMidiError(null);
      return { ...result, sent: true };
    },
    []
  );

  const sendMidiMessage = useCallback(async (message: number[]) => {
    let externalSent = false;
    try {
      externalSent = await webMidi.current!.send(message);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao enviar MIDI para a saída externa.');
    }

    try {
      const engineSent = await window.electronAPI.engineMidi(message);
      if (externalSent || engineSent) setMidiError(null);
      return externalSent || engineSent;
    } catch (error) {
      if (!externalSent) {
        setMidiError(error instanceof Error ? error.message : 'Falha ao enviar MIDI ao engine.');
      }
      return externalSent;
    }
  }, []);

  const subscribeMidiLearn = useCallback((listener: (event: RawMidiEvent) => void) => {
    if (!webMidi.current) return () => undefined;
    return webMidi.current.onRawMessage(listener);
  }, []);

  const enginePanic = useCallback(async (): Promise<boolean> => {
    try {
      return await window.electronAPI.enginePanic();
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao enviar o panic ao motor.');
      return false;
    }
  }, []);

  // === VST Actions ===
  const scanVstPlugins = useCallback(async () => {
    try {
      const plugins = await window.electronAPI.vstScan();
      setScannedPlugins(plugins);
      setMidiError(null);
      return plugins;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao escanear plugins VST3.');
      return [];
    }
  }, []);

  const loadVstPlugin = useCallback(async (pluginPath: string, layerId?: string, minNote = 0, maxNote = 127) => {
    try {
      const plugin = await window.electronAPI.vstLoad(pluginPath, layerId, minNote, maxNote);
      if (plugin) {
        setLoadedPlugins((previous) => [
          ...previous.filter((current) => current.layerId !== plugin.layerId),
          plugin,
        ]);
        void window.electronAPI.audioSettingsGet()
          .then((snapshot) => {
            setAudioDevices(snapshot.devices);
            setAudioSettings(snapshot.settings);
          })
          .catch((error: unknown) => {
            setMidiError(error instanceof Error ? error.message : 'Falha ao atualizar o estado de áudio.');
          });
      }
      setMidiError(null);
      return plugin;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao carregar plugin VST3.');
      return null;
    }
  }, []);

  const unloadVstPlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.vstUnload(pluginId);
      if (result) {
        setLoadedPlugins((prev) => prev.filter((p) => p.layerId !== pluginId && p.id !== pluginId));
      }
      setMidiError(null);
      return result;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao descarregar plugin VST3.');
      return false;
    }
  }, []);

  const setVstParameter = useCallback(
    async (pluginId: string, paramId: string, value: number): Promise<boolean> => {
      try {
        const result = await window.electronAPI.vstSetParam(pluginId, paramId, value);
        if (result) {
          setLoadedPlugins((previous) =>
            previous.map((plugin) =>
              plugin.layerId === pluginId
                ? {
                    ...plugin,
                    parameters: plugin.parameters.map((parameter) =>
                      parameter.id === paramId ? { ...parameter, value } : parameter
                    ),
                  }
                : plugin
            )
          );
        }
        setMidiError(result ? null : 'Não foi possível aplicar o parâmetro ao plugin carregado.');
        return result;
      } catch (error) {
        setMidiError(error instanceof Error ? error.message : 'Falha ao alterar parâmetro VST.');
        return false;
      }
    },
    []
  );

  const openVstEditor = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      const opened = await window.electronAPI.vstOpenEditor(pluginId);
      setMidiError(opened ? null : 'Este plugin não tem janela de edição.');
      return opened;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao abrir a janela do plugin.');
      return false;
    }
  }, []);

  const closeVstEditor = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      return await window.electronAPI.vstCloseEditor(pluginId);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao fechar a janela do plugin.');
      return false;
    }
  }, []);

  const setVstLayerRange = useCallback(async (layerId: string, minNote: number, maxNote: number) => {
    try {
      const updated = await window.electronAPI.vstSetLayerRange(layerId, minNote, maxNote);
      setLoadedPlugins((previous) =>
        previous.map((plugin) => (plugin.layerId === layerId ? { ...plugin, ...updated } : plugin))
      );
      setMidiError(null);
      return true;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao alterar a região MIDI do layer.');
      return false;
    }
  }, []);

  const setVstLayerMix = useCallback(async (layerId: string, update: LayerMixUpdate) => {
    try {
      setMixState(await window.electronAPI.vstSetLayerMix(layerId, update));
      setMidiError(null);
      return true;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao alterar o channel strip.');
      return false;
    }
  }, []);

  const setVstMasterMix = useCallback(async (update: MasterMixUpdate) => {
    try {
      setMixState(await window.electronAPI.vstSetMasterMix(update));
      setMidiError(null);
      return true;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao alterar o channel strip Master.');
      return false;
    }
  }, []);

  const refreshAudioSettings = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.audioSettingsGet();
      setAudioDevices(snapshot.devices);
      setAudioSettings(snapshot.settings);
      setMidiError(null);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao consultar dispositivos de áudio.');
    }
  }, []);

  useEffect(() => {
    if (!audioDevices?.running || loadedPlugins.length === 0) {
      setMixState(null);
      return;
    }

    let active = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const snapshot = await window.electronAPI.vstMixGet();
        if (active) setMixState(snapshot);
      } catch (error) {
        if (active) setMidiError(error instanceof Error ? error.message : 'Falha ao atualizar os medidores.');
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 100);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [audioDevices?.running, loadedPlugins.length]);

  const startAudio = useCallback(async (options: AudioStartOptions) => {
    try {
      const snapshot = await window.electronAPI.audioStart(options);
      setAudioDevices(snapshot.devices);
      setAudioSettings(snapshot.settings);
      setMidiError(null);
      return true;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao iniciar o áudio.');
      return false;
    }
  }, []);

  const stopAudio = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.audioStop();
      setAudioDevices(snapshot.devices);
      setAudioSettings(snapshot.settings);
      setMidiError(null);
      return true;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao parar o áudio.');
      return false;
    }
  }, []);

  const updatePreferences = useCallback(async (update: Partial<AppPreferences>) => {
    try {
      const next = await window.electronAPI.preferencesSet(update);
      setPreferences(next);
      setMidiError(null);
      return next;
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'Falha ao salvar as preferências.');
      return null;
    }
  }, []);

  // === Layout Actions ===
  const addUIElement = useCallback((element: UiElement) => {
    window.electronAPI.uiElementAdd(element);
    setLayoutState((prev: LayoutConfig | null) =>
      prev ? { ...prev, elements: [...prev.elements, element] } : { elements: [element], background: null, tempo: 120 }
    );
  }, []);

  const updateUIElement = useCallback((element: UiElement) => {
    window.electronAPI.uiElementUpdate(element);
    setLayoutState((prev: LayoutConfig | null) => {
      if (!prev) return null;
      return {
        ...prev,
        elements: prev.elements.map((e) => (e.id === element.id ? element : e)),
      };
    });
  }, []);

  const removeUIElement = useCallback((id: string) => {
    window.electronAPI.uiElementRemove(id);
    setLayoutState((prev: LayoutConfig | null) =>
      prev ? { ...prev, elements: prev.elements.filter((e) => e.id !== id) } : null
    );
  }, []);

  const setLayout = useCallback((newLayout: LayoutConfig) => {
    window.electronAPI.layoutChange(newLayout);
    setLayoutState(newLayout);
  }, []);

  // === App Actions ===
  const togglePanel = useCallback((panel: keyof typeof openPanels) => {
    setOpenPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const setAppStatusAction = useCallback(
    async (status: Partial<AppStatus>) => {
      const newStatus = await window.electronAPI.appStatusChange(status);
      setAppStatus(newStatus);
      return newStatus;
    },
    []
  );

  const sendMidiNote = useCallback((note: number, velocity: number, channel: number) => {
    void sendMidiMessage([0x90 | channel, note & 0x7f, velocity & 0x7f]);
  }, [sendMidiMessage]);

  const sendControlChange = useCallback((cc: number, value: number, channel: number) => {
    void sendMidiMessage([0xb0 | channel, cc & 0x7f, value & 0x7f]);
  }, [sendMidiMessage]);

  const contextValue: AppContextType = {
    presets,
    sets,
    concertName,
    currentPreset,
    loadedPlugins,
    mixState,
    scannedPlugins,
    audioDevices,
    audioSettings,
    preferences,
    engineError,
    concertPath,
    concertDirty,
    concertError,
    concertSettings,
    updateConcertSettings,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo,
    redo,
    concertRevision,
    concertTemplates,
    templatePickerOpen,
    chooseTemplate,
    cancelTemplatePicker,
    midiDevices,
    midiError,
    midiLastMessage,
    activeNotes,
    layout,
    appStatus,
    isPanelOpen: openPanels,
    savePreset,
    loadPreset,
    deletePreset,
    createPreset,
    setConcertName,
    createSet,
    renameSet,
    deleteSet,
    toggleSetExpanded,
    toggleSetSkipped,
    reorderSets,
    movePresetToSet,
    reorderPatchesInSet,
    togglePresetSkipped,
    resetProgramNumbers,
    listMidiDevices,
    openMidiPort,
    sendProgramChange,
    sendMidiMessage,
    enginePanic,
    subscribeMidiLearn,
    scanVstPlugins,
    loadVstPlugin,
    unloadVstPlugin,
    setVstParameter,
    openVstEditor,
    closeVstEditor,
    setVstLayerRange,
    setVstLayerMix,
    setVstMasterMix,
    refreshAudioSettings,
    startAudio,
    stopAudio,
    updatePreferences,
    addUIElement,
    updateUIElement,
    removeUIElement,
    setLayout,
    togglePanel,
    setAppStatus: setAppStatusAction,
    sendMidiNote,
    sendControlChange,
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};
