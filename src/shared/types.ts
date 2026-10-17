/**
 * Tipos compartilhados entre main process e renderer
 */

// Tipo de plugin VST
export interface VstPluginInfo {
  id: string;
  /** Identidade da instância no patch; diferentes layers podem usar o mesmo VST. */
  layerId?: string;
  name: string;
  path: string;
  isLoaded: boolean;
  isInstrument: boolean;
  parameters: VstParameter[];
  minNote?: number;
  maxNote?: number;
}

export interface VstParameter {
  id: string;
  name: string;
  label: string;
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  stepCount: number;
}

// Tipo de preset/programa
export interface Preset {
  id: string;
  name: string;
  category?: string;
  /** ID do Set ao qual pertence (para hierarquia Set → Patch) */
  setId?: string;
  /** Ordem dentro do Set (para drag-reorder) */
  setOrder?: number;
  programNumber: number;
  /** Banco MIDI (0-127) para acessar mais de 128 patches */
  bankNumber?: number;
  /** Quando true, é pulado na navegação por Program Change / setas */
  skipped?: boolean;
  /** Ícone do patch na Patch List */
  icon?: string;
  /** Anotações de texto sobre o patch */
  notes?: string;
  midiChannel: number;
  plugins?: PresetPluginAssignment[];
  masterMix?: MasterMixSettings;
  vstStates: Record<string, any>;
  layout: LayoutConfig;
  createdAt: number;
  updatedAt: number;
}

/** Set (pasta) — MainStage style */
export interface PresetSet {
  id: string;
  name: string;
  /** Ordem dos sets (para drag-reorder) */
  order: number;
  /** Se expandido na sidebar */
  expanded?: boolean;
  /** Quando true, é pulado na navegação por Program Change / setas */
  skipped?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Concert — nível raiz estilo MainStage (Concert → Sets → Patches) */
export interface Concert {
  id: string;
  name: string;
  tempo: number;
  /** Sets ordenados; patches sem setId caem no set virtual "Sem set" */
  sets: PresetSet[];
  createdAt: number;
  updatedAt: number;
}

export interface PresetPluginAssignment {
  pluginId: string;
  /** Identidade única do layer dentro do patch. */
  layerId?: string;
  name: string;
  path: string;
  role: 'instrument' | 'effect';
  minNote?: number;
  maxNote?: number;
  mix?: LayerMixSettings;
}

export interface LayerMixSettings {
  volumeDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface MasterMixSettings {
  volumeDb: number;
  muted: boolean;
}

export interface LayerMixState extends LayerMixSettings {
  layerId: string;
  peakDb: number;
}

export interface EngineMixState {
  layers: LayerMixState[];
  master: MasterMixSettings & { peakDb: number };
}

export type LayerMixUpdate = Partial<LayerMixSettings>;
export type MasterMixUpdate = Partial<MasterMixSettings>;

export interface AudioStartOptions {
  inputs?: number;
  outputs?: number;
  type?: string;
  input?: string;
  output?: string;
  sampleRate?: number;
  bufferSize?: number;
  midi?: boolean;
}

export interface AudioDeviceSnapshot {
  running: boolean;
  asioSupported: boolean;
  asioDriverAvailable: boolean;
  asioUnavailableReason?: string;
  current: null | {
    type: string;
    name: string;
    sampleRate: number;
    bufferSize: number;
    inputChannels: number;
    outputChannels: number;
    outputLatencyMs: number;
  };
  audioTypes: Array<{ type: string; outputs: string[]; inputs: string[] }>;
  midiInputs: Array<{ name: string; identifier: string; enabled: boolean }>;
}

export interface SavedAudioSettings extends AudioStartOptions {
  enabled: boolean;
}

export interface AudioSettingsSnapshot {
  devices: AudioDeviceSnapshot;
  settings: SavedAudioSettings;
}

/** Preferências gerais do app (arquivo preferences.json no userData). */
export interface AppPreferences {
  /** Corta o patch anterior assim que troca; padrão false (deixa as caudas acabarem). */
  silencePreviousPatch: boolean;
}

// Configuração de layout da interface
export interface LayoutConfig {
  elements: UiElement[];
  background: string | null;
  tempo: number;
}

// Elementos de interface
export type ElementType = 'button' | 'fader' | 'knob' | 'pedal' | 'toggle' | 'slider' | 'label' | 'pad' | 'meter-vertical' | 'midi-activity' | 'keyboard';

export interface UiElement {
  id: string;
  type: ElementType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  // Seção do palco MainStage (undefined = canvas livre)
  section?: 'instrument' | 'effects' | 'tone' | 'output';
  // Para faders, sliders
  minValue: number;
  maxValue: number;
  orientation: 'horizontal' | 'vertical';
  // Para botões e pads
  isMomentary: boolean;
  // Ligação a plugin/parametro
  pluginId?: string;
  pluginPath?: string;
  parameterId?: string;
  midiCommand?: MidiBinding;
  // Para pads de notas MIDI
  noteNumber?: number;
  velocity?: number;
  value?: number;
  // Exibição do rótulo (Text Labels do inspector)
  labelDisplay?: 'name' | 'value' | 'both';
  // Porta MIDI de entrada vinculada (usada pelo motor na Fase E)
  midiPort?: string;
  // Repassa evento adiante sem processar (consumido pelo motor na Fase E)
  midiThru?: boolean;
  // Teclado (Fase C) — null em keyboardSplit = sem split
  keyboardLow?: number;
  keyboardHigh?: number;
  keyboardSplit?: number | null;
  keyboardLowerLabel?: string;
  keyboardUpperLabel?: string;
  keyboardLowerColor?: string;
  keyboardUpperColor?: string;
  keyboardChannel?: number;
}

export interface MidiBinding {
  type: 'cc' | 'note' | 'pc' | 'pitch' | 'aftertouch';
  channel: number;
  controllerNumber?: number;
  // Para PC, controla qual programa
  programNumber?: number;
  min?: number;
  max?: number;
}

// Status da aplicação
export interface AppStatus {
  isPlaying: boolean;
  currentPresetId: string | null;
  currentProgramNumber: number;
  tempo: number;
  isMetronomeOn: boolean;
}

// Mensagens entre processos
export type ElectronChannels =
  | 'midi-open'
  | 'midi-close'
  | 'midi-send'
  | 'midi-program-change'
  | 'midi-input-program-change'
  | 'midi-list-devices'
  | 'vst-scan'
  | 'vst-load'
  | 'vst-unload'
  | 'vst-set-param'
  | 'vst-get-state'
  | 'vst-set-state'
  | 'vst-open-editor'
  | 'vst-close-editor'
  | 'vst-list'
  | 'vst-loaded'
  | 'engine-midi'
  | 'engine-panic'
  | 'preferences-get'
  | 'preferences-set'
  | 'preset-save'
  | 'preset-load'
  | 'preset-list'
  | 'preset-delete'
  | 'preset-by-program'
  | 'preset-loaded'
  | 'layout-change'
  | 'app-status-change'
  | 'app-status-get'
  | 'ui-element-add'
  | 'ui-element-update'
  | 'ui-element-remove'
  | 'open-plugin-dialog'
  | 'get-app-version';

// Mensagens de evento
export interface ElectronEventMap {
  'midi-open': (portName: string) => void;
  'midi-close': () => void;
  'midi-send': (message: number[]) => void;
  'midi-program-change': (program: number, channel: number) => void;
  'midi-list-devices': () => void;
  'vst-scan': () => void;
  'vst-load': (pluginPath: string) => void;
  'vst-unload': (pluginId: string) => void;
  'vst-set-param': (pluginId: string, paramId: string, value: number) => void;
  'vst-get-state': (pluginId: string) => void;
  'vst-set-state': (pluginId: string, state: any) => void;
  'vst-open-editor': (pluginId: string) => void;
  'vst-close-editor': (pluginId: string) => void;
  'engine-midi': (message: number[]) => void;
  'engine-panic': () => void;
  'preset-save': (preset: Preset) => void;
  'preset-load': (presetId: string) => void;
  'preset-list': () => void;
  'layout-change': (layout: LayoutConfig) => void;
  'app-status-change': (status: Partial<AppStatus>) => void;
  'ui-element-add': (element: UiElement) => void;
  'ui-element-update': (element: UiElement) => void;
  'ui-element-remove': (id: string) => void;
}
