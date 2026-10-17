import type { ElementType, Preset, UiElement } from '@shared/types';

export const snap8 = (value: number): number => Math.round(value / 8) * 8;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi: number): string {
  const n = Math.max(0, Math.min(127, Math.round(midi)));
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

export type PaletteCategory = 'panel' | 'meters' | 'grouped';

export interface GroupMember {
  type: ElementType;
  dx: number;
  dy: number;
  label: string;
}

export interface PaletteItem {
  key: string;
  type: ElementType;
  label: string;
  hint: string;
  category: PaletteCategory;
  orientation?: 'horizontal' | 'vertical';
  group?: GroupMember[];
}

export const PALETTE_CATEGORIES: { id: PaletteCategory | 'all'; label: string }[] = [
  { id: 'panel', label: 'Panel Controls' },
  { id: 'meters', label: 'Meters & MIDI' },
  { id: 'grouped', label: 'Grouped' },
  { id: 'all', label: 'All Controls' },
];

export const PALETTE_ITEMS: PaletteItem[] = [
  { key: 'knob', type: 'knob', label: 'Round Knob', hint: 'Contínuo 0–1', category: 'panel' },
  { key: 'fader-v', type: 'fader', label: 'Vertical Fader', hint: 'Contínuo vertical', category: 'panel', orientation: 'vertical' },
  { key: 'slider-h', type: 'slider', label: 'Horizontal Slider', hint: 'Contínuo horizontal', category: 'panel', orientation: 'horizontal' },
  { key: 'button', type: 'button', label: 'Button', hint: 'Disparo / PC / nota', category: 'panel' },
  { key: 'toggle', type: 'toggle', label: 'Toggle', hint: 'Liga / desliga', category: 'panel' },
  { key: 'pad', type: 'pad', label: 'Drum Pad', hint: 'Nota MIDI', category: 'panel' },
  { key: 'pedal', type: 'pedal', label: 'Pedal', hint: 'Momentâneo', category: 'panel' },
  { key: 'keyboard', type: 'keyboard', label: 'Keyboard', hint: 'Toca com mouse e MIDI', category: 'panel' },
  { key: 'label', type: 'label', label: 'Text Label', hint: 'Texto livre', category: 'panel' },
  { key: 'meter-v', type: 'meter-vertical', label: 'Vertical Meter', hint: 'Nível (Fase E)', category: 'meters', orientation: 'vertical' },
  { key: 'meter-h', type: 'meter-vertical', label: 'Horizontal Meter', hint: 'Nível (Fase E)', category: 'meters', orientation: 'horizontal' },
  { key: 'activity', type: 'midi-activity', label: 'MIDI Activity', hint: 'Pisca com MIDI (Fase C)', category: 'meters' },
  {
    key: 'group-adsr', type: 'knob', label: 'ADSR (4 knobs)', hint: 'Attack Decay Sustain Release', category: 'grouped',
    group: [
      { type: 'knob', dx: 0, dy: 0, label: 'Attack' },
      { type: 'knob', dx: 104, dy: 0, label: 'Decay' },
      { type: 'knob', dx: 208, dy: 0, label: 'Sustain' },
      { type: 'knob', dx: 312, dy: 0, label: 'Release' },
    ],
  },
  {
    key: 'group-pads', type: 'pad', label: 'Pads 2×2', hint: '4 drum pads', category: 'grouped',
    group: [
      { type: 'pad', dx: 0, dy: 0, label: 'Pad 1' },
      { type: 'pad', dx: 104, dy: 0, label: 'Pad 2' },
      { type: 'pad', dx: 0, dy: 104, label: 'Pad 3' },
      { type: 'pad', dx: 104, dy: 104, label: 'Pad 4' },
    ],
  },
];

export function findPaletteItem(key: string | null): PaletteItem | null {
  if (!key) return null;
  return PALETTE_ITEMS.find((item) => item.key === key) ?? null;
}

const DEFAULT_SIZES: Record<ElementType, { width: number; height: number }> = {
  button: { width: 132, height: 54 },
  fader: { width: 66, height: 180 },
  knob: { width: 96, height: 108 },
  pedal: { width: 88, height: 104 },
  toggle: { width: 112, height: 48 },
  slider: { width: 190, height: 56 },
  pad: { width: 96, height: 96 },
  label: { width: 160, height: 34 },
  keyboard: { width: 720, height: 220 },
  'meter-vertical': { width: 72, height: 170 },
  'midi-activity': { width: 128, height: 56 },
};

export function makeElement(
  type: ElementType,
  x: number,
  y: number,
  label: string,
  orientation?: 'horizontal' | 'vertical'
): UiElement {
  const size = DEFAULT_SIZES[type];
  return {
    id: `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: size.width,
    height: size.height,
    color: type === 'pedal' ? '#0A84FF' : '#9A9AA0',
    minValue: 0,
    maxValue: 1,
    orientation: orientation ?? (type === 'slider' ? 'horizontal' : 'vertical'),
    isMomentary: type === 'button' || type === 'pedal' || type === 'pad',
    value: 0.5,
  };
}

/** Descrição curta do mapeamento MIDI — usada na tabela do modo Edit. */
export function midiBindingDescription(element: UiElement, fallbackChannel: number): string {
  const binding = element.midiCommand;
  if (!binding) return '—';
  const ch = (binding.channel ?? fallbackChannel) + 1;
  switch (binding.type) {
    case 'cc':
      return `CC ${binding.controllerNumber ?? '?'} · canal ${ch}`;
    case 'note': {
      const note = element.noteNumber ?? binding.controllerNumber ?? 60;
      return `Nota ${noteName(note)} (${note}) · canal ${ch}`;
    }
    case 'pc':
      return `PC ${binding.programNumber ?? '?'} · canal ${ch}`;
    default:
      return `${binding.type} · canal ${ch}`;
  }
}

export function pluginBindingDescription(
  element: UiElement,
  draft: Preset,
  scannedParams: { path: string; params: { id: string; name: string }[] }[]
): string {
  if (!element.pluginPath) return '—';
  const plugin = (draft.plugins ?? []).find((p) => p.path === element.pluginPath);
  const pluginName = plugin?.name ?? element.pluginPath;
  if (!element.parameterId) return pluginName;
  const params = scannedParams.find((p) => p.path === element.pluginPath)?.params;
  const paramName = params?.find((p) => p.id === element.parameterId)?.name ?? element.parameterId;
  return `${pluginName} → ${paramName}`;
}
