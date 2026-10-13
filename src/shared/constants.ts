/**
 * Constantes e utilitários compartilhados
 */

export const APP_NAME = 'Preseter';
export const VERSION = '1.0.0';

// Configurações padrão
export const DEFAULT_PRESET_COUNT = 128;
export const DEFAULT_MIDI_CHANNEL = 0;
export const DEFAULT_TEMPO = 120;

// Diretórios
export const PLUGIN_DIRECTORIES = [
  'C:\\Program Files\\VST3',
  'C:\\Program Files (x86)\\VST3',
  // Adicione outros diretórios comuns de plugins
];

export const PRESETS_DIR = 'presets';
export const CONFIG_DIR = 'config';

// Cores padrão para elementos de UI
export const UI_COLORS = {
  primary: '#3B82F6',
  secondary: '#6366F1',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  dark: '#1F2937',
  darker: '#111827',
  light: '#F3F4F6',
};

// Mapeamento de mensagens MIDI
export enum MidiStatus {
  NoteOff = 0x80,
  NoteOn = 0x90,
  AfterTouch = 0xA0,
  ControlChange = 0xB0,
  ProgramChange = 0xC0,
  ChannelPressure = 0xD0,
  PitchBend = 0xE0,
}

// Função para criar mensagem MIDI
export function createMidiMessage(status: MidiStatus, channel: number, data1: number, data2?: number): number[] {
  const msg: number[] = [(status | channel), data1];
  if (data2 !== undefined) {
    msg.push(data2);
  }
  return msg;
}

// Função para validar número de programa MIDI
export function validateProgramNumber(program: number): number {
  return Math.max(0, Math.min(127, Math.floor(program)));
}
