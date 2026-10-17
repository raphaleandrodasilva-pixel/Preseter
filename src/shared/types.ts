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
  /** Compasso, MIDI, channel strips, metrônomo e anotações (Fase 2.4). */
  settings: ConcertSettings;
  createdAt: number;
  updatedAt: number;
}

/** Compasso (fórmula de compasso) do concert. */
export interface TimeSignature {
  numerator: number;
  denominator: number;
}

/** Pan law dos channel strips, em dB (Fase 2.4). */
export type PanLaw = 0 | -3 | -4.5 | -6;

export interface ConcertMidiSettings {
  /** CC7 controla o volume dos channel strips. */
  cc7ControlsVolume: boolean;
  /** CC10 controla o pan dos channel strips. */
  cc10ControlsPan: boolean;
  /** Envia MIDI não atribuído a todos os channel strips. */
  sendUnassignedMidiToStrips: boolean;
  /** Transpose do concert, em semitons. */
  transpose: number;
  /** Origem do Program Change. `channel` null = qualquer canal (omni). */
  programChange: { device: string; channel: number | null };
  /** Envia Program Change não usado aos channel strips. */
  sendUnusedProgramChangeToStrips: boolean;
}

export interface ConcertChannelStripSettings {
  panLaw: PanLaw;
  /** Pan law com compensação de ganho (as opções "comp." do MainStage). */
  panLawCompensated: boolean;
}

export interface ConcertMetronomeSettings {
  enabled: boolean;
  /** Volume do clique, em dB. */
  volumeDb: number;
  /** Acentua o primeiro tempo de cada compasso. */
  accentFirstBeat: boolean;
}

/** Configurações do concert (inspector "Concert Settings", Fase 2.4). */
export interface ConcertSettings {
  timeSignature: TimeSignature;
  midi: ConcertMidiSettings;
  channelStrips: ConcertChannelStripSettings;
  metronome: ConcertMetronomeSettings;
  /** Barramentos Aux/Output do concert (Fase 3.2). */
  buses: ConcertBusSettings;
  /** Anotações livres sobre o concert. */
  notes: string;
}

/** Mapeamento MIDI no nível do concert (Fase 4). */
export interface ConcertMapping {
  id: string;
  /** Mensagem MIDI que dispara o mapeamento. */
  source: MidiBinding;
  /** Patch alvo; ausente = todos os patches do concert. */
  patchId?: string;
  /** Elemento de tela alvo. */
  elementId?: string;
  /** Parâmetro de plugin alvo. */
  pluginId?: string;
  parameterId?: string;
}

/**
 * Documento do concert persistido em `.preseter` (Fase 2.1).
 * Cada patch traz o próprio layout; o layout do concert é o workspace padrão.
 */
export interface PreseterConcertFile {
  /** Assinatura do formato, para reconhecer arquivos `.preseter`. */
  format: 'preseter.concert';
  /** Versão do formato gravada no arquivo. */
  version: number;
  concert: Concert;
  sets: PresetSet[];
  patches: Preset[];
  /** Layout de tela do concert (workspace). */
  layout: LayoutConfig;
  /** Mapeamentos MIDI do concert (Fase 4). */
  mappings: ConcertMapping[];
}

/** Estado do concert trocado entre main e renderer (Fase 2.2). */
export interface ConcertState {
  /** Caminho do arquivo `.preseter`, ou null se ainda não foi salvo. */
  path: string | null;
  name: string;
  tempo: number;
  sets: PresetSet[];
  patches: Preset[];
  layout: LayoutConfig;
  dirty: boolean;
  /** Configurações do concert (Concert Settings, Fase 2.4). */
  settings: ConcertSettings;
  /** Último patch usado, para reabrir já selecionado. */
  lastPatchId: string | null;
}

/** Trecho do concert que o renderer edita e reenvia ao main a cada mudança. */
export interface ConcertSyncPayload {
  name: string;
  tempo: number;
  sets: PresetSet[];
  settings: ConcertSettings;
}

/** Dados lembrados entre execuções (userData/session.json). */
export interface SessionState {
  concertPath: string | null;
  lastPatchId: string | null;
}

/** Item da lista de concerts recentes. */
export interface RecentConcert {
  path: string;
  name: string;
  openedAt: number;
}

/** Ação disparada pelo menu nativo "Arquivo". */
export type MenuAction =
  | { action: 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo' }
  | { action: 'open-recent'; path: string };

/** Resumo de um template de concert mostrado no seletor (Fase 2.3). */
export interface ConcertTemplateSummary {
  id: string;
  name: string;
  description: string;
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
  /** Slots de insert (efeitos) do channel strip (Fase 3.1). */
  inserts?: Insert[];
  /** Saída (Output 1 a `MAX_OUTPUT_BUSES`) do channel strip (Fase 3.2). Padrão 1. */
  output?: number;
  /**
   * Níveis dos sends post-fader para os Aux 1..`MAX_AUX_BUSES`, em dB (Fase 3.2).
   * `SEND_OFF_DB` (-60) desliga o send. Ausente = todos desligados.
   */
  sends?: number[];
}

/** Quantidade de slots de insert por channel strip (Fase 3.1). */
export const MAX_INSERTS = 4;

/** Quantidade de barramentos Aux do concert (Fase 3.2). */
export const MAX_AUX_BUSES = 4;
/** Quantidade de barramentos Output do concert (Fase 3.2). */
export const MAX_OUTPUT_BUSES = 4;
/** Nível a partir do qual o send é considerado desligado (Fase 3.2). */
export const SEND_OFF_DB = -60;

/** Um slot de insert (efeito VST3) de um channel strip. */
export interface Insert {
  /** Slot do channel strip (0 a `MAX_INSERTS - 1`). */
  slot: number;
  pluginId: string;
  name: string;
  path: string;
  /** Quando true, o efeito fica carregado mas fora da cadeia de áudio. */
  bypass: boolean;
}

/**
 * Um barramento (Aux ou Output) do concert (Fase 3.2). Os barramentos são
 * definidos no concert e ficam ativos entre patches; o estado dos plugins dos
 * inserts é guardado por patch em `Preset.vstStates` (`insert_<bus>_<slot>`).
 */
export interface BusSettings {
  volumeDb: number;
  pan: number;
  muted: boolean;
  /** Output de destino dos Aux (1 a `MAX_OUTPUT_BUSES`); ignorado pelos Output. */
  output: number;
  /** Slots de insert (efeitos) do barramento. */
  inserts: Insert[];
}

/** Barramentos Aux/Output do concert (Fase 3.2). */
export interface ConcertBusSettings {
  aux: BusSettings[];
  outputs: BusSettings[];
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
  /** Output (1 a `MAX_OUTPUT_BUSES`) do channel strip (Fase 3.2). */
  output: number;
  /** Níveis dos sends para os Aux 1..`MAX_AUX_BUSES`, em dB (Fase 3.2). */
  sends: number[];
}

/** Estado ao vivo de um barramento Aux/Output (Fase 3.2). */
export interface BusMixState {
  bus: string;
  volumeDb: number;
  pan: number;
  muted: boolean;
  peakDb: number;
  /** Presente nos Aux: Output de destino (1 a `MAX_OUTPUT_BUSES`). */
  output?: number;
}

export interface EngineMixState {
  layers: LayerMixState[];
  aux: BusMixState[];
  outputs: BusMixState[];
  master: MasterMixSettings & { peakDb: number };
}

/** Estado de um barramento (comando `buses`, Fase 3.2). */
export interface EngineBusState {
  bus: string;
  kind: 'aux' | 'output';
  /** 1 a `MAX_AUX_BUSES` / `MAX_OUTPUT_BUSES`. */
  index: number;
  volumeDb: number;
  pan: number;
  muted: boolean;
  peakDb: number;
  output?: number;
}

export type LayerMixUpdate = Partial<LayerMixSettings>;
export type MasterMixUpdate = Partial<MasterMixSettings>;
export type BusMixUpdate = Partial<Pick<BusSettings, 'volumeDb' | 'pan' | 'muted' | 'output'>>;

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
  | 'window-set-fullscreen'
  | 'engine-crashed'
  | 'engine-recovered'
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
  | 'concert-init'
  | 'concert-get'
  | 'concert-new'
  | 'concert-templates'
  | 'concert-open'
  | 'concert-open-recent'
  | 'concert-save'
  | 'concert-sync'
  | 'concert-recent'
  | 'menu-action'
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
  'engine-crashed': (payload: { message: string }) => void;
  'engine-recovered': (payload: { presetId: string | null }) => void;
  'preset-save': (preset: Preset) => void;
  'preset-load': (presetId: string) => void;
  'preset-list': () => void;
  'layout-change': (layout: LayoutConfig) => void;
  'app-status-change': (status: Partial<AppStatus>) => void;
  'ui-element-add': (element: UiElement) => void;
  'ui-element-update': (element: UiElement) => void;
  'ui-element-remove': (id: string) => void;
}
