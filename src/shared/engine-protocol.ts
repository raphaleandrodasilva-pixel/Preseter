/**
 * Protocolo entre o app (Electron main) e o motor nativo `preseter-engine`.
 *
 * Transporte: JSON, uma mensagem por linha, via stdin/stdout do processo filho.
 * Veja engine/README.md para a descrição completa.
 */
import type {
  AudioDeviceSnapshot,
  BusMixUpdate,
  EngineBusState,
  EngineMixState,
  LayerMixUpdate,
  MasterMixUpdate,
  VstParameter,
} from './types';

// ---- Mensagens -------------------------------------------------------------

export interface EngineRequestBase {
  id: number;
  cmd: string;
}

export type EngineResponse<T = unknown> =
  | { id: number; ok: true; result: T }
  | { id: number; ok: false; error: string };

export type EngineEvent =
  | { event: 'ready'; version: string; os: string; formats: string }
  | { event: 'scan-progress'; plugin: string };

// ---- Dados -----------------------------------------------------------------

export interface EnginePluginInfo {
  /** Identificador estável (formato-nome-uid). Use em `load`. */
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  category: string;
  format: string;
  path: string;
  isInstrument: boolean;
  inputs: number;
  outputs: number;
}

export interface EngineLoadedPlugin {
  layerId: string;
  id: string;
  name: string;
  manufacturer: string;
  format: string;
  path: string;
  isInstrument: boolean;
  inputs: number;
  outputs: number;
  minNote: number;
  maxNote: number;
  /** Só parâmetros automatizáveis (o que `params` lista por padrão). */
  parameterCount: number;
  /** Inclui os ~2000 "MIDI CC" que o wrapper VST3 do JUCE cria. */
  parameterCountTotal: number;
}

export interface EngineParameter {
  /** Posição do parâmetro no plugin; é o que `setParam` espera. */
  index: number;
  id: string;
  name: string;
  label: string;
  /** Normalizado 0..1 */
  value: number;
  defaultValue: number;
  /** Valor formatado pelo plugin, ex.: "-6.0 dB" */
  text: string;
  /** 0 = contínuo */
  stepCount: number;
  automatable: boolean;
}

export interface EngineDevices extends AudioDeviceSnapshot {}

/** Estado completo de um plugin, serializado por `getStateInformation`. */
export interface EnginePluginStateChunk {
  layerId: string;
  /** Bytes do estado do plugin codificados em base64. */
  data: string;
}

/** Retorno ao aplicar um estado completo via `setStateInformation`. */
export interface EnginePluginStateApplied {
  layerId: string;
  /** Tamanho em bytes do estado aplicado. */
  bytes: number;
}

/** Estado da janela nativa de edição de um plugin. */
export interface EngineEditorState {
  layerId: string;
  open: boolean;
  /** Presente quando a janela é de um slot de insert (Fase 3.1). */
  slot?: number;
}

/** Estado de um slot de insert (efeito) de um channel strip (Fase 3.1). */
export interface EngineInsertState {
  /** Layer ou barramento (aux/output) dono do slot (Fase 3.2). */
  layerId: string;
  /** Slot do channel strip (0 a `MAX_INSERTS - 1`). */
  slot: number;
  loaded: boolean;
  bypass: boolean;
  id: string;
  name: string;
  manufacturer: string;
  format: string;
  path: string;
  inputs: number;
  outputs: number;
}

/** Resultado de efetivar uma troca de patch sem corte. */
export interface EnginePatchSwapCommitted {
  /** Layers do patch que passou a tocar. */
  active: string[];
  /** Layers do patch anterior que continuam soando as caudas. */
  lingering: string[];
}

export interface EngineScanResult {
  count: number;
  plugins: EnginePluginInfo[];
  failed: string[];
  blacklisted: string[];
}

// ---- Comandos (corpo além de id/cmd) ------------------------------------------

export interface EngineCommands {
  ping: { args: {}; result: { pong: true } };
  quit: { args: {}; result: null };
  devices: { args: {}; result: EngineDevices };
  audioConfiguration: { args: {}; result: EngineDevices };
  audioStart: {
    args: {
      inputs?: number;
      outputs?: number;
      type?: string;
      input?: string;
      output?: string;
      sampleRate?: number;
      bufferSize?: number;
      /** Padrão true: habilita todas as entradas MIDI. */
      midi?: boolean;
    };
    result: EngineDevices;
  };
  audioStop: { args: {}; result: null };
  mix: { args: {}; result: EngineMixState };
  setLayerMix: { args: LayerMixUpdate & { layerId: string }; result: EngineMixState };
  setMasterMix: { args: MasterMixUpdate; result: EngineMixState };
  midiEnable: { args: { identifier?: string; enabled?: boolean }; result: EngineDevices };
  plugins: { args: {}; result: { formats: string; plugins: EnginePluginInfo[] } };
  scan: { args: { paths?: string[]; rescan?: boolean }; result: EngineScanResult };
  load: {
    args: { plugin?: string; path?: string; layerId?: string; minNote?: number; maxNote?: number };
    result: EngineLoadedPlugin;
  };
  /** Carrega um instrumento em modo encadeado (troca de patch sem corte). */
  stageLoad: {
    args: { plugin?: string; path?: string; layerId?: string; minNote?: number; maxNote?: number };
    result: EngineLoadedPlugin;
  };
  /** Efetiva a troca: ativa o patch encadeado e silencia ou drena o anterior. */
  commitPatchSwap: { args: { silence?: boolean }; result: EnginePatchSwapCommitted };
  unload: { args: { layerId?: string }; result: { unloaded: boolean } };
  setLayerRange: {
    args: { layerId: string; minNote: number; maxNote: number };
    result: EngineLoadedPlugin;
  };
  layers: { args: {}; result: EngineLoadedPlugin[] };
  plugin: { args: {}; result: EngineLoadedPlugin | null };
  /** `all: true` inclui também os não automatizáveis. */
  params: { args: { all?: boolean; layerId?: string }; result: EngineParameter[] };
  getParam: { args: { index: number; layerId?: string }; result: EngineParameter };
  setParam: { args: { index: number; value: number; layerId?: string }; result: EngineParameter };
  /** Estado completo do plugin (chunk) em base64. `slot` busca um insert; sem ele, o instrumento. */
  getState: { args: { layerId?: string; slot?: number }; result: EnginePluginStateChunk };
  /** Aplica um estado completo (chunk) em base64. */
  setState: { args: { layerId?: string; data: string; slot?: number }; result: EnginePluginStateApplied };
  /** Abre (ou traz para a frente) a janela de edição do plugin. */
  openEditor: { args: { layerId?: string; slot?: number }; result: EngineEditorState };
  /** Fecha a janela de edição do plugin. */
  closeEditor: { args: { layerId?: string; slot?: number }; result: EngineEditorState };
  /** Slots de insert de um channel strip (Fase 3.1). */
  inserts: { args: { layerId?: string }; result: EngineInsertState[] };
  /** Carrega (substituindo) um efeito num slot de insert do channel strip. */
  setInsert: {
    args: { layerId?: string; slot: number; plugin?: string; path?: string; bypass?: boolean };
    result: EngineInsertState;
  };
  /** Remove o efeito de um slot de insert. */
  removeInsert: { args: { layerId?: string; slot: number }; result: EngineInsertState };
  /** Liga/desliga (bypass) o efeito de um slot, sem descarregá-lo. */
  setInsertBypass: { args: { layerId?: string; slot: number; bypass: boolean }; result: EngineInsertState };
  /** Estado dos barramentos Aux/Output do concert (Fase 3.2). */
  buses: { args: {}; result: EngineBusState[] };
  /** Altera um barramento: `bus` = "aux1".."aux4" / "output1".."output4". */
  setBusMix: { args: { bus: string } & BusMixUpdate; result: EngineBusState[] };
  /** Nível (dB) do send post-fader de um layer para o Aux `aux` (1..4). */
  setSend: { args: { layerId: string; aux: number; levelDb: number }; result: EngineMixState };
  /** Saída (Output 1..4) para onde o channel strip do layer manda o áudio. */
  setLayerOutput: { args: { layerId: string; output: number }; result: EngineMixState };
  noteOn: { args: { note: number; velocity?: number; channel?: number }; result: null };
  noteOff: { args: { note: number; velocity?: number; channel?: number }; result: null };
  midi: { args: { bytes: number[] }; result: null };
  panic: { args: {}; result: null };
}

export type EngineCommandName = keyof EngineCommands;

// ---- Conversões ----------------------------------------------------------------

/** Adapta um parâmetro do motor ao formato que a UI já usa (`VstParameter`). */
export function toVstParameter(p: EngineParameter): VstParameter {
  return {
    id: String(p.index),
    name: p.name,
    label: p.label,
    value: p.value,
    defaultValue: p.defaultValue,
    minValue: 0,
    maxValue: 1,
    stepCount: p.stepCount,
  };
}
