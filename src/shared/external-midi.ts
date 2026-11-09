/**
 * Timbre MIDI externo: mensagens genéricas para qualquer dispositivo MIDI.
 *
 * Este módulo é puro (sem Web MIDI, sem React, sem engine). Ele só monta os
 * bytes que o app deve enviar. A porta, o canal e os controles são definidos
 * pelo usuário por timbre; nada aqui conhece fabricante ou modelo.
 *
 * Canal: internamente 0..15 (a UI mostra 1..16), igual ao restante do app.
 */

export const MIDI_MAX_7BIT = 127;
export const MIDI_MAX_14BIT = 16383;

/** Atraso padrão depois do Program Change, para o aparelho trocar o programa. */
export const DEFAULT_PROGRAM_DELAY_MS = 30;

export type ExternalMidiControlMessage =
  | { type: 'cc'; cc: number; bits?: 7 | 14 }
  | { type: 'nrpn'; msb: number; lsb: number; bits?: 7 | 14 }
  | { type: 'rpn'; msb: number; lsb: number; bits?: 7 | 14 }
  | {
      type: 'sysex';
      /** Bytes completos, começando em F0 e terminando em F7. */
      template: number[];
      /** Posição do primeiro byte do valor dentro do template (1..length-2). */
      valueOffset: number;
      /** Quantidade de bytes de 7 bits usada para o valor. */
      valueBytes?: 1 | 2 | 3 | 4;
    };

/** Um controle de tela (knob/fader) que envia uma mensagem ao dispositivo. */
export interface ExternalMidiControl {
  id: string;
  name: string;
  /** Faixa da UI. Ausente = 0..máximo da mensagem. */
  min?: number;
  max?: number;
  default?: number;
  message: ExternalMidiControlMessage;
  /** Inverte a faixa (0 vira máximo e vice-versa). */
  invert?: boolean;
  /** Enviar ao carregar o patch. Ausente = true. */
  sendOnLoad?: boolean;
  /** Enviar ao girar o controle. Ausente = true. */
  sendOnChange?: boolean;
}

/** Programa interno do dispositivo (Banco + Program Change). */
export interface ExternalMidiProgram {
  bankMsb?: number;
  bankLsb?: number;
  pc?: number;
  /** Nome apenas para exibição. */
  name?: string;
}

/** Configuração MIDI de um timbre. */
export interface ExternalMidiConfig {
  /** Ausente = ligado. */
  enabled?: boolean;
  /** Nome da porta de saída MIDI. */
  portName: string;
  /** Canal 0..15 (a UI mostra 1..16). */
  channel: number;
  program?: ExternalMidiProgram;
  controls?: ExternalMidiControl[];
  /** Valores salvos dos controles, por id. */
  values?: Record<string, number>;
  /** Mensagens cruas enviadas depois do programa. */
  loadMessages?: number[][];
  /** Mensagens cruas enviadas antes do programa. */
  resetMessages?: number[][];
}

/** Um passo de envio; `delayMs` é esperado antes do próximo passo. */
export interface ExternalMidiStep {
  bytes: number[];
  delayMs?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function clampMidiChannel(channel: unknown): number {
  return clampInt(channel, 0, 15, 0);
}

function statusByte(channel: unknown, high: number): number {
  return high | (clampMidiChannel(channel) & 0x0f);
}

/** Maior valor aceito pela mensagem de um controle. */
export function externalMidiMessageMax(message: ExternalMidiControlMessage): number {
  switch (message.type) {
    case 'cc':
    case 'nrpn':
    case 'rpn':
      return (message.bits ?? 7) === 14 ? MIDI_MAX_14BIT : MIDI_MAX_7BIT;
    case 'sysex':
      return (1 << (7 * (message.valueBytes ?? 1))) - 1;
  }
}

function normalizeRange(
  message: ExternalMidiControlMessage,
  minValue: unknown,
  maxValue: unknown,
  defaultValue: unknown
): { min: number; max: number; default: number } {
  const messageMax = externalMidiMessageMax(message);
  const min = clampInt(minValue, 0, messageMax, 0);
  const max = clampInt(maxValue, min, messageMax, messageMax);
  const defaultValueClamped = clampInt(defaultValue, min, max, min);
  return { min, max, default: defaultValueClamped };
}

/** Faixa efetiva de um controle e o máximo da mensagem. */
export function externalMidiControlRange(control: ExternalMidiControl): {
  min: number;
  max: number;
  default: number;
  messageMax: number;
} {
  const range = normalizeRange(control.message, control.min, control.max, control.default);
  return { ...range, messageMax: externalMidiMessageMax(control.message) };
}

function mapControlValue(control: ExternalMidiControl, value: unknown): number {
  const { min, max, messageMax } = externalMidiControlRange(control);
  const raw = clampInt(value, min, max, min);
  const ratio = max > min ? (raw - min) / (max - min) : 0;
  const inverted = control.invert === true ? 1 - ratio : ratio;
  return Math.round(inverted * messageMax);
}

/** Control Change de 7 ou 14 bits (14 bits usa CC+32 para o LSB). */
export function buildCcMessages(
  cc: number,
  value: number,
  channel: number,
  bits: 7 | 14 = 7
): number[][] {
  const controller = clampInt(cc, 0, 127, 0);
  if (bits === 14) {
    if (controller > 95) {
      throw new RangeError('CC de 14 bits precisa estar entre 0 e 95 (o LSB usa CC+32).');
    }
    const clamped = clampInt(value, 0, MIDI_MAX_14BIT, 0);
    return [
      [statusByte(channel, 0xb0), controller, (clamped >> 7) & 0x7f],
      [statusByte(channel, 0xb0), controller + 32, clamped & 0x7f],
    ];
  }

  return [[statusByte(channel, 0xb0), controller, clampInt(value, 0, MIDI_MAX_7BIT, 0)]];
}

function buildParameterMessages(
  selectMsb: number,
  selectLsb: number,
  msb: number,
  lsb: number,
  value: number,
  channel: number,
  bits: 7 | 14
): number[][] {
  const messages: number[][] = [
    [statusByte(channel, 0xb0), selectMsb, clampInt(msb, 0, 127, 0)],
    [statusByte(channel, 0xb0), selectLsb, clampInt(lsb, 0, 127, 0)],
  ];

  if (bits === 14) {
    const clamped = clampInt(value, 0, MIDI_MAX_14BIT, 0);
    messages.push(
      [statusByte(channel, 0xb0), 6, (clamped >> 7) & 0x7f],
      [statusByte(channel, 0xb0), 38, clamped & 0x7f]
    );
  } else {
    messages.push([statusByte(channel, 0xb0), 6, clampInt(value, 0, MIDI_MAX_7BIT, 0)]);
  }

  return messages;
}

/** NRPN: CC99/CC98 selecionam o parâmetro; CC6/CC38 enviam o valor. */
export function buildNrpnMessages(
  msb: number,
  lsb: number,
  value: number,
  channel: number,
  bits: 7 | 14 = 7
): number[][] {
  return buildParameterMessages(99, 98, msb, lsb, value, channel, bits);
}

/** RPN: CC101/CC100 selecionam o parâmetro; CC6/CC38 enviam o valor. */
export function buildRpnMessages(
  msb: number,
  lsb: number,
  value: number,
  channel: number,
  bits: 7 | 14 = 7
): number[][] {
  return buildParameterMessages(101, 100, msb, lsb, value, channel, bits);
}

/**
 * SysEx com um valor embutido. O template precisa começar em F0 e terminar em
 * F7; o valor é gravado em `valueOffset` em bytes de 7 bits, MSB primeiro.
 */
export function buildSysexMessages(
  template: number[],
  valueOffset: number,
  valueBytes: 1 | 2 | 3 | 4,
  value: number
): number[][] {
  if (!Array.isArray(template) || template.length < 3) {
    throw new RangeError('O template SysEx precisa ter pelo menos 3 bytes.');
  }
  if (template[0] !== 0xf0 || template[template.length - 1] !== 0xf7) {
    throw new RangeError('O template SysEx precisa começar com F0 e terminar com F7.');
  }
  if (![1, 2, 3, 4].includes(valueBytes)) {
    throw new RangeError('O SysEx aceita de 1 a 4 bytes de valor.');
  }
  if (
    !Number.isInteger(valueOffset) ||
    valueOffset < 1 ||
    valueOffset + valueBytes > template.length - 1
  ) {
    throw new RangeError('A posição do valor não cabe no template SysEx.');
  }

  const bytes = template.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError('O template SysEx só aceita bytes de 0 a 255.');
    }
    return byte;
  });

  const max = (1 << (7 * valueBytes)) - 1;
  let remaining = clampInt(value, 0, max, 0);
  for (let index = valueBytes - 1; index >= 0; index -= 1) {
    bytes[valueOffset + index] = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
  }

  return [bytes];
}

/** Mensagens de um controle, já com a faixa da UI convertida para MIDI. */
export function buildControlMessages(
  control: ExternalMidiControl,
  value: unknown,
  channel: number
): number[][] {
  const mapped = mapControlValue(control, value);
  const message = control.message;

  switch (message.type) {
    case 'cc':
      return buildCcMessages(message.cc, mapped, channel, message.bits ?? 7);
    case 'nrpn':
      return buildNrpnMessages(message.msb, message.lsb, mapped, channel, message.bits ?? 7);
    case 'rpn':
      return buildRpnMessages(message.msb, message.lsb, mapped, channel, message.bits ?? 7);
    case 'sysex':
      return buildSysexMessages(
        message.template,
        message.valueOffset,
        message.valueBytes ?? 1,
        mapped
      );
  }
}

/** Banco (CC0/CC32) + Program Change, na ordem correta. */
export function buildProgramMessages(program: ExternalMidiProgram, channel: number): number[][] {
  const messages: number[][] = [];

  if (program.bankMsb !== undefined) {
    messages.push([statusByte(channel, 0xb0), 0, clampInt(program.bankMsb, 0, 127, 0)]);
  }
  if (program.bankLsb !== undefined) {
    messages.push([statusByte(channel, 0xb0), 32, clampInt(program.bankLsb, 0, 127, 0)]);
  }
  if (program.pc !== undefined) {
    messages.push([statusByte(channel, 0xc0), clampInt(program.pc, 0, 127, 0)]);
  }

  return messages;
}

function normalizeRawMessage(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const bytes: number[] = [];
  for (const byte of value) {
    if (!isFiniteNumber(byte) || byte < 0 || byte > 255) return undefined;
    bytes.push(Math.round(byte));
  }
  return bytes;
}

function hasPort(config: ExternalMidiConfig): boolean {
  return typeof config.portName === 'string' && config.portName.trim() !== '';
}

/**
 * Sequência de carregamento de um timbre externo:
 * reset → banco/PC → mensagens fixas → controles com `sendOnLoad`.
 * Retorna [] quando não há timbre externo, quando ele está desligado ou sem porta.
 */
export function buildExternalMidiLoadSteps(
  config: ExternalMidiConfig | null | undefined,
  values?: Record<string, number>
): ExternalMidiStep[] {
  if (!config || config.enabled === false || !hasPort(config)) return [];

  const channel = clampMidiChannel(config.channel);
  const steps: ExternalMidiStep[] = [];

  for (const message of config.resetMessages ?? []) {
    const bytes = normalizeRawMessage(message);
    if (bytes) steps.push({ bytes });
  }

  if (config.program) {
    const programMessages = buildProgramMessages(config.program, channel);
    for (let index = 0; index < programMessages.length; index += 1) {
      const step: ExternalMidiStep = { bytes: programMessages[index] };
      // Só espera depois do Program Change, não depois do banco.
      if (config.program.pc !== undefined && index === programMessages.length - 1) {
        step.delayMs = DEFAULT_PROGRAM_DELAY_MS;
      }
      steps.push(step);
    }
  }

  for (const message of config.loadMessages ?? []) {
    const bytes = normalizeRawMessage(message);
    if (bytes) steps.push({ bytes });
  }

  const effectiveValues = values ?? config.values ?? {};
  for (const control of config.controls ?? []) {
    if (control.sendOnLoad === false) continue;
    const value = effectiveValues[control.id] ?? control.default ?? control.min ?? 0;
    for (const bytes of buildControlMessages(control, value, channel)) {
      steps.push({ bytes });
    }
  }

  return steps;
}

/**
 * Mensagens de um controle ao vivo. Retorna [] quando o timbre não existe,
 * quando o controle não existe ou quando `sendOnChange` é false.
 */
export function buildExternalMidiLiveMessages(
  config: ExternalMidiConfig | null | undefined,
  controlId: string,
  value: number
): number[][] {
  if (!config || config.enabled === false || !hasPort(config)) return [];

  const control = config.controls?.find((item) => item.id === controlId);
  if (!control || control.sendOnChange === false) return [];

  return buildControlMessages(control, value, config.channel);
}

function normalizeProgram(value: unknown): ExternalMidiProgram | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const program: ExternalMidiProgram = {};

  if (isFiniteNumber(source.bankMsb)) program.bankMsb = clampInt(source.bankMsb, 0, 127, 0);
  if (isFiniteNumber(source.bankLsb)) program.bankLsb = clampInt(source.bankLsb, 0, 127, 0);
  if (isFiniteNumber(source.pc)) program.pc = clampInt(source.pc, 0, 127, 0);
  if (typeof source.name === 'string' && source.name.trim() !== '') {
    program.name = source.name.trim();
  }

  return Object.keys(program).length > 0 ? program : undefined;
}

function normalizeControlMessage(value: unknown): ExternalMidiControlMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;

  if (source.type === 'cc') {
    if (!isFiniteNumber(source.cc)) return undefined;
    const cc = clampInt(source.cc, 0, 127, 0);
    const bits: 7 | 14 = source.bits === 14 ? 14 : 7;
    if (bits === 14 && cc > 95) return undefined;
    return { type: 'cc', cc, bits };
  }

  if (source.type === 'nrpn' || source.type === 'rpn') {
    if (!isFiniteNumber(source.msb) || !isFiniteNumber(source.lsb)) return undefined;
    const msb = clampInt(source.msb, 0, 127, 0);
    const lsb = clampInt(source.lsb, 0, 127, 0);
    const bits: 7 | 14 = source.bits === 14 ? 14 : 7;
    return source.type === 'nrpn'
      ? { type: 'nrpn', msb, lsb, bits }
      : { type: 'rpn', msb, lsb, bits };
  }

  if (source.type === 'sysex') {
    if (!Array.isArray(source.template)) return undefined;
    const template: number[] = [];
    for (const byte of source.template) {
      if (!isFiniteNumber(byte) || byte < 0 || byte > 255) return undefined;
      template.push(Math.round(byte));
    }
    if (template.length < 3 || template[0] !== 0xf0 || template[template.length - 1] !== 0xf7) {
      return undefined;
    }

    const valueBytes: 1 | 2 | 3 | 4 =
      source.valueBytes === 2 || source.valueBytes === 3 || source.valueBytes === 4
        ? source.valueBytes
        : 1;
    const valueOffset = isFiniteNumber(source.valueOffset) ? Math.round(source.valueOffset) : 1;
    if (valueOffset < 1 || valueOffset + valueBytes > template.length - 1) return undefined;

    return { type: 'sysex', template, valueOffset, valueBytes };
  }

  return undefined;
}

function normalizeControl(value: unknown): ExternalMidiControl | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;

  const id = typeof source.id === 'string' ? source.id.trim() : '';
  if (!id) return undefined;

  const message = normalizeControlMessage(source.message);
  if (!message) return undefined;

  const range = normalizeRange(message, source.min, source.max, source.default);
  const control: ExternalMidiControl = {
    id,
    name: typeof source.name === 'string' && source.name.trim() !== '' ? source.name.trim() : id,
    min: range.min,
    max: range.max,
    default: range.default,
    message,
  };

  if (source.invert === true) control.invert = true;
  if (source.sendOnLoad === false) control.sendOnLoad = false;
  if (source.sendOnChange === false) control.sendOnChange = false;

  return control;
}

function normalizeValues(
  value: unknown,
  controls: ExternalMidiControl[]
): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || controls.length === 0) return undefined;
  const source = value as Record<string, unknown>;
  const values: Record<string, number> = {};

  for (const control of controls) {
    const raw = source[control.id];
    if (!isFiniteNumber(raw)) continue;
    const range = externalMidiControlRange(control);
    values[control.id] = clampInt(raw, range.min, range.max, range.default);
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

/**
 * Normaliza uma configuração vinda de um patch salvo (ou de JSON externo).
 * Retorna undefined quando não há timbre externo válido, preservando o
 * comportamento de patches antigos.
 */
export function normalizeExternalMidiConfig(value: unknown): ExternalMidiConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;

  const portName = typeof source.portName === 'string' ? source.portName.trim() : '';
  if (!portName) return undefined;

  const config: ExternalMidiConfig = {
    portName,
    channel: clampMidiChannel(source.channel),
  };
  if (source.enabled === false) config.enabled = false;

  const program = normalizeProgram(source.program);
  if (program) config.program = program;

  const controls: ExternalMidiControl[] = [];
  if (Array.isArray(source.controls)) {
    for (const item of source.controls) {
      const control = normalizeControl(item);
      if (control) controls.push(control);
    }
  }
  if (controls.length > 0) config.controls = controls;

  const values = normalizeValues(source.values, controls);
  if (values) config.values = values;

  const loadMessages = Array.isArray(source.loadMessages)
    ? source.loadMessages
        .map((message) => normalizeRawMessage(message))
        .filter((message): message is number[] => message !== undefined)
    : [];
  if (loadMessages.length > 0) config.loadMessages = loadMessages;

  const resetMessages = Array.isArray(source.resetMessages)
    ? source.resetMessages
        .map((message) => normalizeRawMessage(message))
        .filter((message): message is number[] => message !== undefined)
    : [];
  if (resetMessages.length > 0) config.resetMessages = resetMessages;

  return config;
}
