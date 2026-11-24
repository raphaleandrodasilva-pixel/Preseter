/**
 * Tipos compartilhados entre main process e renderer
 */

import type { ExternalMidiConfig } from './external-midi';

/** Plataformas com suporte oficial no Preseter. */
export type AppPlatform = 'win32' | 'linux' | 'darwin';

// Tipo de plugin VST
/** Progresso global de carregamento de arquivo/patch mostrado no overlay. */
export interface AppLoadProgress {
  active: boolean;
  title: string;
  detail?: string;
  current?: number;
  total?: number;
  percent?: number;
  error?: string;
}

/** Resultado detalhado da última varredura de plugins. */
export interface VstScanReport {
  count: number;
  failed: string[];
  blacklisted: string[];
  /** Pastas solicitadas na varredura. */
  paths: string[];
  /** Erro que impediu a varredura, quando houver. */
  error?: string;
  scannedAt: number;
}

export interface VstPluginInfo {
  id: string;  /** Identidade da instância no patch; diferentes layers podem usar o mesmo VST. */
  layerId?: string;
  /** Strip do concert/set, carregado fora da troca de patch (Fase 3.3). */
  pinned?: boolean;
  name: string;
  path: string;
  isLoaded: boolean;
  isInstrument: boolean;
  parameters: VstParameter[];
  minNote?: number;
  maxNote?: number;
  velocityMin?: number;
  velocityMax?: number;
  manufacturer?: string;
  version?: string;
  category?: string;
  format?: string;
  arch?: 'x64' | 'x86' | 'unknown';
  /** Programa interno atual, quando o plugin expõe programas. */
  program?: number;
  programCount?: number;
  /** Nomes dos programas (instrumentos nativos/MDA). */
  programNames?: string[];
  /** Preseter Synth2: nome do patch .sy1 carregado. */
  patchName?: string;
}

/** De onde veio um preset de VST exibido nos Timbres. */
export type VstPresetSource = 'program' | 'vstpreset' | 'snapshot' | 'fxp' | 'sy1';

/** Preset de um VST3 indexado pelo Preseter. */
export interface VstPreset {
  id: string;
  name: string;
  /** Categoria de som (Piano, Synth Lead, Bass, ...). */
  category: string;
  source: VstPresetSource;
  pluginId: string;
  pluginName: string;
  pluginPath: string;
  /** Programa interno (source = program). */
  programIndex?: number;
  /** Arquivo .vstpreset ou .fxp (source = vstpreset/fxp). */
  filePath?: string;
  /** Nome do arquivo de estado capturado pelo Preseter (source = snapshot). */
  stateFile?: string;
  /** Pasta/coleção original (ex.: Factory, Afro). */
  collection?: string;
  favorite?: boolean;
  /** Preset de uma pasta do usuário/terceiro: não pode ser apagado pelo app. */
  readOnly?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VstPresetLibraryStatus {
  scanning: boolean;
  scanned: number;
  total: number;
  current?: string;
  error?: string;
  lastScan?: number;
}

export interface VstPresetListResult {
  presets: VstPreset[];
  status: VstPresetLibraryStatus;
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
  name: string;  category?: string;
  /** ID do Set ao qual pertence (para hierarquia Set → Patch) */
  setId?: string;
  /** Ordem dentro do Set (para drag-reorder) */
  setOrder?: number;
  programNumber: number;
  /** Banco MIDI (0-127) para acessar mais de 128 patches */
  bankNumber?: number;
  /** Quando true, é pulado na navegação por Program Change / setas */
  skipped?: boolean;
  /** Atalho do teclado do computador para selecionar este patch no Perform. */
  shortcut?: string;
  /** Ícone do patch na Patch List */
  icon?: string;
  /** Anotações de texto sobre o patch */
  notes?: string;
  /** Transpose deste patch, em semitons (soma com set e concert na Fase 3.4). */
  transpose?: number;
  /** Compasso deste patch (Fase 5.4). */
  timeSignature?: TimeSignature;
  /** Ao selecionar o patch, aplica o tempo dele (Fase 5.4). */
  changeTempoOnSelect?: boolean;
  /** Referência de afinação do patch (A4 em Hz, Fase 5.4). */
  tuningReferenceHz?: number;
  /** Strip de entrada de áudio (guitarra/microfone) deste patch (Fase 3.5). */
  audioInput?: AudioInputSettings;
  /** Master do patch: volume, pan, mute e os 4 inserts que processam todos os layers. */
  master?: PatchMasterSettings;
  /**
   * Preset do Aux (1..4) para este patch. Aplicado ao carregar quando o patch
   * não tem estado salvo daquele Aux; a intensidade vem de `master.sends`.
   */
  auxPresets?: Partial<Record<1 | 2 | 3 | 4, string>>;
  midiChannel: number;
  plugins?: PresetPluginAssignment[];
  /** Valores que este patch sobrepõe nos strips herdados do set/concert (Fase 3.3). */
  stripOverrides?: Record<string, StripOverride>;
  masterMix?: MasterMixSettings;
  vstStates: Record<string, any>;
  /** Layout materializado (geometria do concert + mappings deste patch). */
  layout: LayoutConfig;
  /** Mappings por id de controle; o layout em si é do concert (Fase 4.1). */
  mappings?: Record<string, PatchMapping>;
  createdAt: number;
  updatedAt: number;
}

/** Campos de um controle que pertencem ao patch (não ao layout do concert). */
export interface PatchMapping {
  midiCommand?: MidiBinding;
  midiPort?: string;
  midiThru?: boolean;
  pluginId?: string;
  pluginPath?: string;
  parameterId?: string;
  /** Dono do plugin mapeado: layerId, "patch" ou "aux1".."aux4". */
  paramOwner?: string;
  /** Slot de insert (0..3); ausente = instrumento do layer. */
  paramSlot?: number;
  noteNumber?: number;
  velocity?: number;
  /** Faixa do parâmetro de destino para este mapping (0..1). */
  mappingMin?: number;
  mappingMax?: number;
  /** Como o controle de tela reage ao movimento do hardware (Fase 4.4). */
  respondToHardwareMove?: 'jump' | 'pickup' | 'relative';
}

/** Set (pasta): agrupamento de patches. */
export interface PresetSet {
  id: string;
  name: string;
  /** Ordem dos sets (para drag-reorder) */
  order: number;
  /** Channel strips deste set, visíveis em todos os patches dele (Fase 3.3). */
  strips?: ConcertStrip[];
  /** Valores que este set sobrepõe nos strips do concert (Fase 3.3). */
  stripOverrides?: Record<string, StripOverride>;
  /** Se expandido na sidebar */
  expanded?: boolean;
  /** Quando true, é pulado na navegação por Program Change / setas */
  skipped?: boolean;
  /** Transpose deste set, em semitons (soma com patch e concert na Fase 3.4). */
  transpose?: number;
  /** Atalho de teclado para pular direto para este grupo no Perform. */
  shortcut?: string;
  createdAt: number;
  updatedAt: number;
}

/** Formato do strip de entrada de áudio (Fase 3.5). */
export type AudioInputMode = 'mono' | 'stereo';

/** Strip de entrada de áudio (guitarra/microfone) de um patch (Fase 3.5). */
export interface AudioInputSettings {
  enabled: boolean;
  /** Canal de entrada do dispositivo (0 = primeiro). Em estéreo usa também o seguinte. */
  inputChannel: number;
  mode: AudioInputMode;
  /** Volume inicial 0 dB. */
  volumeDb: number;
  pan: number;
  muted: boolean;
  /** Silencia o canal quando detecta feedback (Fase 3.5). */
  feedbackProtection: boolean;
  /** Saída (Output 1..4). Ignorado quando `destination` é `patch`. */
  output: number;
  /**
   * Para onde o sinal vai: um Output do concert ou o bus do patch (Master do
   * Patch). `patch` é o modo pedaleira: a entrada passa pela cadeia de efeitos
   * do patch atual.
   */
  destination?: 'output' | 'patch';
}

/** Estado do plugin Playback (Fase 6.4). */
export interface PlaybackState {
  loaded: boolean;
  playing: boolean;
  path: string;
}

/** Estado do strip de entrada de áudio no motor (peak/feedback em tempo real). */
export interface AudioInputState extends AudioInputSettings {
  peakDb: number;
  /** Frequência detectada no afinador (Hz); 0 = sem pitch. */
  pitchHz?: number;
  feedback: boolean;
}

/** Concert — nível raiz (Concert → Sets → Patches) */
export interface Concert {
  id: string;
  name: string;
  tempo: number;
  /** Compasso, MIDI, channel strips, metrônomo e anotações (Fase 2.4). */
  settings: ConcertSettings;
  /** Channel strips do concert, visíveis em todos os patches (Fase 3.3). */
  strips?: ConcertStrip[];
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
  /** Pan law com compensação de ganho. */
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
  /** Volume do master do concert, em dB (fader Volume do Layout). */
  masterVolumeDb: number;
}

/** Mapeamento MIDI no nível do concert (Fase 4). */
export interface ConcertMapping {
  id: string;
  /** Mensagem MIDI que dispara o mapeamento. */
  source: MidiBinding;
  /** Set alvo (ausente = concert). */
  setId?: string;
  /** Patch alvo (ausente = concert/set). */
  patchId?: string;
  /** Elemento de tela alvo. */
  elementId?: string;
  /** Parâmetro de plugin alvo (sem depender de elemento). */
  pluginPath?: string;
  pluginId?: string;
  parameterId?: string;
  /** Dono do plugin mapeado: layerId, "patch" ou "aux1".."aux4". */
  paramOwner?: string;
  /** Slot de insert (0..3); ausente = instrumento do layer. */
  paramSlot?: number;
  /** Faixa do parâmetro de destino (0..1). */
  mappingMin?: number;
  mappingMax?: number;
  /** Don't pass thru: bloqueia o MIDI bruto no motor (Fase 4.5). */
  midiThru?: boolean;
  /** Jump/Pickup/Relative (Fase 4.4). */
  respondToHardwareMove?: 'jump' | 'pickup' | 'relative';
  /** Ação executada em vez de mover um controle/parâmetro (Fase 4.7). */
  action?: MappableAction;
}

/** Ações que podem ser disparadas por um mapping (Fase 4.7). */
export type MappableAction =
  | 'panic'
  | 'master-mute'
  | 'tap-tempo'
  | 'next-patch'
  | 'previous-patch'
  | 'next-set'
  | 'play-stop'
  | 'metronome'
  | 'current-notes';

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
  /** Channel strips do concert, herdados por todos os patches (Fase 3.3). */
  strips: ConcertStrip[];
  /** Mapeamentos do concert/set/patch (Fase 4.6). */
  mappings: ConcertMapping[];
  /** Último patch usado, para reabrir já selecionado. */
  lastPatchId: string | null;
}

/** Trecho do concert que o renderer edita e reenvia ao main a cada mudança. */
export interface ConcertSyncPayload {
  name: string;
  tempo: number;
  sets: PresetSet[];
  settings: ConcertSettings;
  /** Channel strips do concert (Fase 3.3). */
  strips: ConcertStrip[];
  /** Layout do concert (Fase 4.1). */
  layout?: LayoutConfig;
  /** Mappings do concert/set/patch (Fase 4.6). */
  mappings?: ConcertMapping[];
  /** Patches do concert (usado pelo undo/redo, Fase 2.5). */
  patches?: Preset[];
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
  | { action: 'new' | 'open' | 'generate-library' | 'save' | 'save-as' | 'close' | 'undo' | 'redo' | 'help' | 'about' }
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
  /** Faixa de velocity aceita por este strip (1..127). Ausente = 1..127. */
  velocityMin?: number;
  velocityMax?: number;
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
  /** Nível (dB) do send deste layer para o bus do patch (Master do Patch). */
  patchSendDb?: number;
  /** Arpejador MIDI do layer (Fase 7.2). Ausente = desligado. */
  arp?: ArpSettings;
  /** Sequenciador de bateria do layer (D5). Ausente = desligado. */
  drums?: DrumSettings;
  /** Programa interno do plugin a aplicar ao carregar (ex.: GM/SF2). */
  programIndex?: number;
  /** Banco do preset (SF2). */
  bank?: number;
  /** Arquivo SFZ/SF2 associado ao layer de sampler. */
  samplePath?: string;
  /**
   * Origem do layer: VST3 (padrão) ou o sampler nativo do Preseter.
   * No sampler, `samplePath` é o arquivo e `programIndex`/`bank` escolhem o preset.
   */
  sourceKind?: 'vst3' | 'sampler';
  /** Ajustes do sampler nativo (vozes, loop, envelope, filtro, velocity). */
  sampler?: {
    polyphony?: number;
    loop?: boolean;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    cutoff?: number;
    resonance?: number;
    velocity?: number;
    transpose?: number;
    fineTune?: number;
    gain?: number;
  };
  /** Sampler usado pelo layer; ausente = comportamento legado. */
  samplerKind?: 'sforzando' | 'juicysfplugin';
  /** Preset nomeado do acervo de VST presets a aplicar ao carregar. */
  presetId?: string;
  /**
   * Timbre MIDI externo (opcional). Quando presente, este strip representa um
   * dispositivo MIDI (porta/canal/banco/programa/controles) em vez de um plugin.
   */
  externalMidi?: ExternalMidiConfig;
}

/**
 * Layer usa o sampler nativo? Considera o campo moderno e também patches
 * antigos que carregam o plugin nativo pelo id/caminho.
 */
export function isNativeSamplerAssignment(
  assignment: Pick<PresetPluginAssignment, 'sourceKind' | 'pluginId' | 'path'>
): boolean {
  // O id/caminho do plugin é a identidade real. Se ele aponta para um VST,
  // um sourceKind residual de sampler não deve sequestrar o layer.
  if (assignment.pluginId || assignment.path) {
    return assignment.pluginId === 'preseter.sampler' || assignment.path === 'preseter.sampler';
  }
  return assignment.sourceKind === 'sampler';
}

export type ArpMode = 'up' | 'down' | 'updown' | 'random' | 'played';
export type ArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32';

/** Configuração do arpejador MIDI por layer. */
export interface ArpSettings {
  enabled: boolean;
  mode: ArpMode;
  rate: ArpRate;
  /** 1 a 4 oitavas. */
  octaves: number;
  /** 10 a 100%. */
  gate: number;
  /** 0 a 75%. */
  swing: number;
  hold: boolean;
}

export const DEFAULT_ARP: ArpSettings = {
  enabled: false,
  mode: 'up',
  rate: '1/16',
  octaves: 1,
  gate: 50,
  swing: 0,
  hold: false,
};

/** Configuração do sequenciador de bateria por layer (D5). */
export interface DrumSettings {
  /** "Sequenciador ligado": o patch quer o sequenciador rodando. */
  enabled: boolean;
  /**
   * "Iniciar com o patch": ao carregar o patch, liga o sequenciador
   * automaticamente. Se falso, ele carrega pausado e a interface da D7 inicia.
   */
  startWithPatch: boolean;
  /** Padrão de fábrica (D8) aplicado quando o patch não tem estado salvo. */
  patternId?: string;
  /** Programa do SF2 do kit (0 = acústico, 24 = eletrônico). */
  kitProgram?: number;
}

export const DEFAULT_DRUMS: DrumSettings = {
  enabled: false,
  startWithPatch: true,
};

/** O sequenciador deve ligar sozinho quando o patch é carregado? (D5) */
export function drumsStartOnLoad(settings: Partial<DrumSettings> | undefined): boolean {
  const resolved = { ...DEFAULT_DRUMS, ...settings };
  return resolved.enabled && resolved.startWithPatch;
}

/** Estado do arp retornado pelo motor. */
export interface EngineArpState extends ArpSettings {
  layerId: string;
}

/** Passo do sequenciador de bateria no protocolo do motor (D4/D5). */
export interface EngineDrumStep {
  on: boolean;
  velocity?: number;
}

/** Trilha do sequenciador: um pad (0..15) e os passos. */
export interface EngineDrumTrack {
  pad: number;
  mute?: boolean;
  /** Nível em dB (-60..12); vira o volume do pad. */
  level?: number;
  steps?: Array<EngineDrumStep | boolean | number>;
}

export interface EngineDrumPattern {
  stepsPerBar?: 8 | 12 | 16 | 32;
  bars?: 1 | 2 | 4;
  /** 0 a 75 (%). */
  swing?: number;
  tracks?: EngineDrumTrack[];
}

/** SF2/SFZ próprio de um pad do Preseter Drums. */
export interface DrumPadSource {
  path: string;
  bank: number;
  program: number;
  note: number;
}

/** `drums` do motor: padrão, passo atual e pads. */
export interface EngineDrumsState {
  enabled: boolean;
  currentStep: number;
  stepsPerBar: number;
  bars: number;
  swing: number;
  trackCount: number;
  totalSteps: number;
  kit: string;
  /** Arquivo do kit atual (vazio se o layer não tem kit). */
  kitPath?: string;
  kitBank?: number;
  kitProgram?: number;
  /** Volume geral do kit (dB). */
  gainDb: number;
  tracks: Array<{
    pad: number;
    mute: boolean;
    level: number;
    steps: Array<{ on: boolean; velocity: number }>;
  }>;
  pads: Array<{
    index: number;
    note: number;
    name: string;
    levelDb: number;
    muted: boolean;
    solo: boolean;
    /** Sample próprio do pad; ausente = usa o kit do layer. */
    source?: DrumPadSource | null;
  }>;
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
  /**
   * Preset do catálogo de efeitos (`src/shared/effects/catalog.json`) a aplicar
   * ao carregar o patch, quando não há estado salvo em `vstStates` para o slot.
   */
  presetId?: string;
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
  /** Aux criado/visível. Ausente em concerts antigos = inferir pelo uso. */
  enabled?: boolean;
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

/** Master do patch: o único strip por onde todos os layers passam. */
export interface PatchMasterSettings {
  volumeDb: number;
  pan: number;
  muted: boolean;
  inserts: Insert[];
  /** Níveis dos sends do bus do patch para os Aux 1..`MAX_AUX_BUSES`, em dB. */
  sends?: number[];
}

export interface LayerMixState extends LayerMixSettings {
  layerId: string;
  peakDb: number;
  /** Output (1 a `MAX_OUTPUT_BUSES`) do channel strip (Fase 3.2). */
  output: number;
  /** Níveis dos sends para os Aux 1..`MAX_AUX_BUSES`, em dB (Fase 3.2). */
  sends: number[];
  /** Nível (dB) do send do layer para o bus do patch. */
  patchSendDb?: number;
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

/**
 * Estado do bus do patch (Master do Patch) e dos seus sends para os Aux
 * (Master do Patch como bus). Todos os layers do patch passam por este barramento antes da
 * Output 1.
 */
export interface PatchBusMixState extends BusMixState {
  /** Níveis dos sends do bus do patch para os Aux 1..`MAX_AUX_BUSES`, em dB. */
  sends: number[];
}

export interface EngineMixState {
  layers: LayerMixState[];
  aux: BusMixState[];
  outputs: BusMixState[];
  /** Bus interno do Master do Patch (Master do Patch como bus). */
  patch: PatchBusMixState;
  master: MasterMixSettings & { peakDb: number };
}

/** Estado de um barramento (comando `buses`, Fase 3.2). */
export interface EngineBusState {
  bus: string;
  kind: 'aux' | 'output' | 'patch';
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

// ---- Channel strips por nível (Fase 3.3) -----------------------------------

/** Nível onde um channel strip foi definido. */
export type StripLevel = 'concert' | 'set' | 'patch';

/** Atributos de um channel strip que um set/patch pode sobrepor (Fase 3.3). */
export type StripAttribute =
  | 'volumeDb'
  | 'pan'
  | 'muted'
  | 'solo'
  | 'minNote'
  | 'maxNote'
  | 'velocityMin'
  | 'velocityMax'
  | 'output'
  | 'sends'
  | 'inserts';

export const STRIP_ATTRIBUTES: readonly StripAttribute[] = [
  'volumeDb',
  'pan',
  'muted',
  'solo',
  'minNote',
  'maxNote',
  'velocityMin',
  'velocityMax',
  'output',
  'sends',
  'inserts',
];

/** Valores que um set ou um patch define para um strip herdado (Fase 3.3). */
export interface StripOverride {
  volumeDb?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  minNote?: number;
  maxNote?: number;
  velocityMin?: number;
  velocityMax?: number;
  output?: number;
  sends?: number[];
  /** Substitui a cadeia de inserts definida no nível de cima. */
  inserts?: Insert[];
}

/** Channel strip definido no concert ou no set (Fase 3.3). */
export interface ConcertStrip extends Omit<PresetPluginAssignment, 'layerId'> {
  /** Identidade estável do strip; vira o `layerId` do layer no motor. */
  id: string;
}

/**
 * Channel strip resolvido para um patch (Fase 3.3): o valor final de cada
 * atributo e o nível que o forneceu (para a UI mostrar o que foi sobreposto).
 */
export interface EffectiveStrip {
  id: string;
  name: string;
  pluginId: string;
  path: string;
  role: 'instrument' | 'effect';
  level: StripLevel;
  volumeDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  minNote: number;
  maxNote: number;
  velocityMin: number;
  velocityMax: number;
  output: number;
  sends: number[];
  inserts: Insert[];
  /** Atributo → nível que forneceu o valor final. */
  sources: Partial<Record<StripAttribute, StripLevel>>;
}

export interface AudioStartOptions {
  inputs?: number;
  outputs?: number;
  type?: string;
  input?: string;
  output?: string;
  sampleRate?: number;
  bufferSize?: number;
  midi?: boolean;
  /** Usa os canais padrão do driver, como o Element. */
  useDefaultChannels?: boolean;
  /** Usa a taxa e o buffer atuais do dispositivo, sem forçar valores. */
  followDevice?: boolean;
}

export interface AudioDeviceSnapshot {
  running: boolean;
  asioSupported: boolean;
  asioDriverAvailable: boolean;
  asioUnavailableReason?: string;
  /** JACK foi compilado neste engine (Linux). */
  jackSupported?: boolean;
  /** Existe um servidor JACK/PipeWire utilizável agora. */
  jackAvailable?: boolean;
  jackUnavailableReason?: string;
  current: null | {
    type: string;
    name: string;
    sampleRate: number;
    bufferSize: number;
    inputChannels: number;
    outputChannels: number;
    outputLatencyMs: number;
    /** Taxas e tamanhos de buffer informados pelo dispositivo ativo. */
    availableSampleRates?: number[];
    availableBufferSizes?: number[];
    /** Falhas aproximadas de callback do motor (quando disponível). */
    xruns?: number;
    /** O driver tem painel próprio (ASIO4ALL, painéis de interfaces ASIO). */
    hasControlPanel?: boolean;
  };
  audioTypes: Array<{ type: string; outputs: string[]; inputs: string[] }>;
  midiInputs: Array<{ name: string; identifier: string; enabled: boolean }>;
}

/** Estado do modo de desempenho máximo (Configurações → Áudio). */
export interface AudioPerformanceStatus {
  enabled: boolean;
  supported: boolean;
  method: 'powercfg' | 'cpupower' | 'powerprofilesctl' | 'none';
  onAc: boolean;
  waitingForAc: boolean;
  planName: string;
  planGuid: string | null;
  governor?: string;
  processorMax: boolean;
  appPriority: 'normal' | 'high';
  enginePriority: 'normal' | 'high';
  enginePid: number | null;
  systemCpu: number;
  appCpu: number;
  message?: string;
}

export interface SavedAudioSettings extends AudioStartOptions {
  enabled: boolean;
}

export interface AudioSettingsSnapshot {
  devices: AudioDeviceSnapshot;
  settings: SavedAudioSettings;
}

/** Velocidade do scroll de listas/menus do Preseter. */
export type ScrollSpeed = 'normal' | 'slow' | 'slower';

/** Formato de gravação da saída do concert. */
export type RecordingFormat = 'wav' | 'mp3' | 'flac';
/** Bitrate do MP3, em kbps. */
export type RecordingBitrate = 128 | 192 | 320;

/** Resultado de iniciar/parar uma gravação. */
export interface RecordingResult {  ok: boolean;
  /** Caminho final (ou o WAV temporário, quando a conversão falha). */
  path?: string;
  error?: string;
}

/** Preferências gerais do app (arquivo preferences.json no userData). */
export interface AppPreferences {
  /** Corta o patch anterior assim que troca; padrão false (deixa as caudas acabarem). */
  silencePreviousPatch: boolean;
  /** Pastas extras de plugins VST2/VST3/LV2 escolhidas pelo usuário. */
  pluginFolders: string[];
  /** Plugins ocultados pelo usuário (ids ou caminhos); continuam carregáveis por patches salvos. */
  hiddenPluginIds: string[];
  /** Velocidade do scroll; padrão 'slow' (0,5×). */
  scrollSpeed: ScrollSpeed;
  /** Pasta onde a coleção salva SF2/SFZ/SF3 (padrão ~/PreseterSons). */
  soundsFolder?: string;
  /** Formato da gravação da saída; padrão 'wav'. */
  recordingFormat: RecordingFormat;
  /** Bitrate do MP3 (128/192/320); só usado quando o formato é mp3. Padrão 320. */
  recordingBitrate: RecordingBitrate;
  /** Pasta das gravações; vazio = pasta de Música (ou Documentos). */
  recordingFolder?: string;
  /**
   * Habilita timbres MIDI externos. Desligado por padrão: nenhum timbre
   * externo envia mensagens e o comportamento do app fica igual ao atual.
   */
  externalMidiEnabled: boolean;
  /** Teclado do PC toca notas (estilo Ableton). Desligado = atalhos normais. */
  computerKeyboardMidi: boolean;
  /** Mantém o processador no máximo (só na tomada) e prioriza o áudio. */
  performanceMode: boolean;
  /** Mostra a escolha de templates ao abrir o app. Desligado = abre pronto para criar patch. */
  showTemplatesOnStartup: boolean;
  /**
   * Varre os plugins VST no boot. Desligado = usa só o cache de
   * `known-plugins.xml`; o usuário pode escanear manualmente em Plugins VST.
   */
  scanPluginsOnStartup: boolean;
}

// Configuração de layout da interface
export interface LayoutConfig {
  elements: UiElement[];
  background: string | null;
  tempo: number;
}

// Elementos de interface
export type ElementType = 'button' | 'fader' | 'knob' | 'pedal' | 'toggle' | 'slider' | 'label' | 'pad' | 'meter-vertical' | 'midi-activity' | 'keyboard' | 'drawbar' | 'playback' | 'audio-input';

export interface UiElement {
  id: string;
  type: ElementType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Elementos com o mesmo groupId se deslocam juntos no canvas. */
  groupId?: string;
  // Seção do palco (undefined = canvas livre)
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
  /** Dono do plugin mapeado: layerId, "patch" ou "aux1".."aux4". */
  paramOwner?: string;
  /** Slot de insert (0..3); ausente = instrumento do layer. */
  paramSlot?: number;
  midiCommand?: MidiBinding;
  // Para pads de notas MIDI
  noteNumber?: number;
  velocity?: number;
  value?: number;
  /** Faixa mínima/máxima do parâmetro de destino (0..1) — Fase 4.3. */
  mappingMin?: number;
  mappingMax?: number;
  /** Jump, Pickup ou Relative ao mover o controle físico (Fase 4.4). */
  respondToHardwareMove?: 'jump' | 'pickup' | 'relative';
  // Exibição do rótulo (Text Labels do inspector)
  labelDisplay?: 'name' | 'value' | 'both';
  /** Label dinâmico: quando `patch-name`, mostra o nome do patch atual. */
  labelBinding?: 'patch-name';
  /** Alvo especial do controle (ex.: fader de volume do master). */
  target?: 'master-volume';
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
  /** Tipo de pedal contínuo/momentâneo (Sustain, Expression, Volume). */
  pedalKind?: 'sustain' | 'expression' | 'volume' | 'stomp';
  /** Pedal de efeito (`stomp`): dono e slot do insert controlado pelo footswitch. */
  stompOwner?: string;
  stompSlot?: number;
  /** Knobs dentro do pedal: parâmetro do mesmo insert, rótulo e faixa. */
  stompParams?: Array<{ parameterId: string; label: string; min: number; max: number; value?: number }>;
  /** Knob de send do bus do patch: 1 a `MAX_AUX_BUSES` (Master do Patch como bus). */
  patchSendAux?: number;
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

/** Mensagem de hardware bloqueada no motor (Don't Pass Thru, Fase 4.5). */
export interface MidiThruBlock {
  type: 'cc' | 'note' | 'pc' | 'pitch' | 'aftertouch';
  channel: number;
  /** CC = controller, note = nota, pc = programa; pitch/aftertouch ignoram. */
  number: number;
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
  | 'vst-presets-list'
  | 'vst-presets-rescan'
  | 'vst-presets-apply'
  | 'vst-presets-snapshot'
  | 'vst-presets-update'
  | 'vst-presets-delete'
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
