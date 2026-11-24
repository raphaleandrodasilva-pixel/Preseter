import type { Insert, LayoutConfig, Preset, PresetPluginAssignment, UiElement } from './types';
import { DEFAULT_TEMPO } from './constants';
import { createDefaultKeyboardLayout } from './default-layout';
import type { CollectionLayerSpec, CollectionPatchMeta } from './collection-presets';
import { findEffect, type EffectDefinition, type EffectParam } from './effects/catalog';

type Family =
  | 'organ'
  | 'piano'
  | 'tines'
  | 'reeds'
  | 'dx'
  | 'jx'
  | 'dexed'
  | 'synth2'
  | 'sampler'
  | 'bass'
  | 'guitar'
  | 'strings'
  | 'drums'
  | 'generic';

export interface PatchLayoutInput {
  /** Id estável do patch (para os ids dos elementos). */
  slug: string;
  title: string;
  tempo: number;
  setName: string;
  patchName: string;
  layers: CollectionLayerSpec[];
  /** layerId do primeiro layer (dono dos parâmetros nativos e dos inserts). */
  layerId?: string;
  /** Inserts resolvidos do strip (slot 0..3). */
  layerInserts?: Insert[];
  /** Inserts resolvidos do Master do Patch. */
  masterInserts?: Insert[];
  meta?: CollectionPatchMeta;
}

const KEY_RANGES: Record<Family, [number, number]> = {
  organ: [36, 96],
  piano: [21, 108],
  tines: [28, 103],
  reeds: [28, 103],
  dx: [36, 96],
  jx: [36, 96],
  dexed: [36, 96],
  synth2: [36, 96],
  sampler: [36, 96],
  bass: [28, 67],
  guitar: [40, 88],
  strings: [36, 96],
  drums: [36, 96],
  generic: [24, 84],
};

const DRAWBAR_LABELS = ["16'", "5 1/3'", "8'", "4'", "2 2/3'", "2'", "1 3/5'", "1 1/3'", "1'"];

interface NativeControl {
  index: number;
  label: string;
  max?: number;
}

/** Parâmetros nativos confirmados no motor (P0, docs/LAYOUT-INSTRUMENTO.md). */
const NATIVE_CONTROLS: Partial<Record<Family, NativeControl[]>> = {
  tines: [
    { index: 1, label: 'Volume' },
    { index: 2, label: 'Decay' },
    { index: 3, label: 'Release' },
    { index: 4, label: 'Hardness' },
    { index: 6, label: 'Tremolo' },
    { index: 7, label: 'Tremolo Rate' },
  ],
  reeds: [
    { index: 0, label: 'Volume' },
    { index: 1, label: 'Tremolo' },
    { index: 2, label: 'Speaker' },
    { index: 4, label: 'Hammer' },
    { index: 5, label: 'Damper' },
  ],
  piano: [
    { index: 0, label: 'Decay' },
    { index: 1, label: 'Release' },
    { index: 2, label: 'Brilho' },
    { index: 3, label: 'Dinâmica' },
    { index: 4, label: 'Muffling' },
    { index: 6, label: 'Velocity' },
  ],
  dx: [
    { index: 0, label: 'Attack' },
    { index: 1, label: 'Decay' },
    { index: 2, label: 'Release' },
    { index: 3, label: 'Coarse' },
    { index: 10, label: 'Vibrato' },
    { index: 15, label: 'LFO Rate' },
  ],
  dexed: [
    { index: 0, label: 'Output' },
    { index: 1, label: 'Cutoff' },
    { index: 2, label: 'Resonance' },
    { index: 3, label: 'Algoritmo' },
  ],
  jx: [
    { index: 0, label: 'OSC Mix' },
    { index: 6, label: 'Cutoff' },
    { index: 7, label: 'Resonance' },
    { index: 11, label: 'Attack' },
    { index: 14, label: 'Release' },
    { index: 20, label: 'Vibrato' },
  ],
  synth2: [
    { index: 2, label: 'Detune' },
    { index: 19, label: 'Cutoff' },
    { index: 20, label: 'Resonance' },
    { index: 25, label: 'Attack' },
    { index: 28, label: 'Release' },
    { index: 30, label: 'Velocity' },
  ],
};

/** Arpejador do JX10 (índices 31..34 confirmados na P0). */
const ARP_CONTROLS: NativeControl[] = [
  { index: 31, label: 'Arp Modo' },
  { index: 32, label: 'Arp Oitavas' },
  { index: 33, label: 'Arp Taxa' },
  { index: 34, label: 'Arp Gate' },
];

/**
 * Parâmetros do sampler nativo (índices confirmados na P0):
 * 0 Ataque, 3 Release, 4 Filtro, 5 Ressonância, 6 Velocity, 10 Ganho.
 */
const SAMPLER_CONTROLS: Partial<Record<Family, NativeControl[]>> = {
  piano: [
    { index: 4, label: 'Brilho' },
    { index: 3, label: 'Release' },
    { index: 6, label: 'Dinâmica' },
    { index: 10, label: 'Volume' },
  ],
  sampler: [
    { index: 0, label: 'Ataque' },
    { index: 3, label: 'Release' },
    { index: 4, label: 'Brilho' },
    { index: 6, label: 'Dinâmica' },
  ],
  strings: [
    { index: 0, label: 'Ataque' },
    { index: 3, label: 'Release' },
    { index: 4, label: 'Brilho' },
    { index: 6, label: 'Dinâmica' },
  ],
  guitar: [
    { index: 0, label: 'Ataque' },
    { index: 3, label: 'Release' },
    { index: 4, label: 'Brilho' },
  ],
  bass: [
    { index: 0, label: 'Ataque' },
    { index: 3, label: 'Release' },
    { index: 4, label: 'Brilho' },
  ],
  drums: [
    { index: 3, label: 'Release' },
    { index: 4, label: 'Brilho' },
    { index: 10, label: 'Volume' },
  ],
};

/** Controles de efeito por shortName do catálogo (até 2 por insert). */
const EFFECT_CONTROLS: Record<string, Array<{ name: string; label: string }>> = {
  Chorus: [{ name: 'Mod Depth', label: 'Depth' }, { name: 'Mod Rate', label: 'Rate' }],
  Phaser: [{ name: 'Mod Depth', label: 'Depth' }, { name: 'Mod Rate', label: 'Rate' }],
  Pulsator: [{ name: 'Modulation', label: 'Depth' }, { name: 'Pulse Width', label: 'Width' }],
  Compressor: [{ name: 'Threshold', label: 'Threshold' }, { name: 'Ratio', label: 'Ratio' }],
  Harmonics: [{ name: 'Drive', label: 'Drive' }, { name: 'Blend', label: 'Blend' }],
  Transients: [{ name: 'Attack Boost', label: 'Attack' }, { name: 'Release Boost', label: 'Release' }],
  Stereo: [{ name: 'Amount', label: 'Width' }, { name: 'Spread', label: 'Spread' }],
  EQ: [{ name: 'B1 Gain', label: 'Low' }, { name: 'B1 Freq', label: 'Low Freq' }],
  Reverb: [{ name: 'Decay', label: 'Decay' }, { name: 'Wet', label: 'Wet' }],
  Delay: [{ name: 'Feedback', label: 'Feedback' }, { name: 'Wet', label: 'Wet' }],
  Overdrive: [{ name: 'Drive', label: 'Drive' }, { name: 'Tone', label: 'Tone' }],
  Amp: [{ name: 'Distortion', label: 'Gain' }, { name: 'Presence', label: 'Presence' }],
  Preamp: [{ name: 'Volume', label: 'Volume' }, { name: 'Treble', label: 'Treble' }],
  Cab: [{ name: 'Bass', label: 'Bass' }, { name: 'Treble', label: 'Treble' }],
  Tremolo: [{ name: 'Depth', label: 'Depth' }, { name: 'Freq', label: 'Rate' }],
};

function detectFamily (setName: string, patchName: string, layers: CollectionLayerSpec[]): Family {
  const native = layers.map((layer) => layer.nativeInstrument).find(Boolean);
  if (native) {
    if (native === 'organ' || native === 'tines' || native === 'reeds' || native === 'piano'
      || native === 'dx' || native === 'jx' || native === 'dexed' || native === 'synth2' || native === 'drums') {
      return native;
    }
  }
  const name = patchName.toLowerCase();
  const set = setName.toLowerCase();
  const isSampler = layers.some((layer) => layer.sample);
  // O nome do patch manda; o set só desempata (ex.: "Acoustic Rock Kit").
  if (/órgão|orgao|organ/.test(name)) return 'organ';
  if (/bateria|drum|percuss|kit/.test(name) || /drum|percuss/.test(set)) return 'drums';
  if (/guitarra|violão|violao|guitar/.test(name)) return 'guitar';
  if (/baixo|bass/.test(name)) return 'bass';
  if (/violino|viola|cello|contrabaix|cordas|strings/.test(name)) return 'strings';
  if (isSampler && /piano|grand|upright/.test(name)) return 'piano';
  if (isSampler) return 'sampler';
  return 'generic';
}

function elementId (slug: string, suffix: string): string {
  return `collection_layout_${slug.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`;
}

interface ControlOptions {
  owner?: string;
  slot?: number;
  parameterId?: string;
  min?: number;
  max?: number;
  value?: number;
  color?: string;
  groupId?: string;
  type?: UiElement['type'];
  width?: number;
  height?: number;
}

function control (
  id: string,
  label: string,
  x: number,
  y: number,
  options: ControlOptions = {}
): UiElement {
  return {
    id,
    type: options.type ?? 'knob',
    label,
    x,
    y,
    width: options.width ?? 78,
    height: options.height ?? 100,
    color: options.color ?? '#0A84FF',
    minValue: options.min ?? 0,
    maxValue: options.max ?? 1,
    orientation: 'vertical',
    isMomentary: false,
    value: options.value ?? 0.5,
    ...(options.owner ? { paramOwner: options.owner } : {}),
    ...(options.slot !== undefined ? { paramSlot: options.slot } : {}),
    ...(options.parameterId ? { parameterId: options.parameterId } : {}),
    ...(options.groupId ? { groupId: options.groupId } : {}),
  };
}

function effectParam (effect: EffectDefinition, name: string): EffectParam | undefined {
  return effect.params.find((param) => param.name.toLowerCase() === name.toLowerCase());
}

function effectControls (
  slug: string,
  inserts: Insert[],
  owner: string,
  start: number,
  limit: number
): UiElement[] {
  const controls: UiElement[] = [];
  for (const insert of inserts) {
    if (controls.length >= limit) break;
    const effect = findEffect(insert.path);
    if (!effect) continue;
    const wanted = EFFECT_CONTROLS[effect.shortName] ?? [];
    for (const entry of wanted) {
      if (controls.length >= limit) break;
      const param = effectParam(effect, entry.name);
      if (!param) continue;
      const index = start + controls.length;
      const ownerTag = owner === 'patch' ? 'master' : 'layer';
      controls.push(control(
        elementId(slug, `fx_${ownerTag}_${insert.slot}_${param.index}`),
        `${effect.shortName} ${entry.label}`,
        208 + (index % 6) * 88,
        150 + Math.floor(index / 6) * 100,
        {
          owner,
          slot: insert.slot,
          parameterId: String(param.index),
        }
      ));
    }
  }
  return controls;
}

/**
 * Layout de um patch da coleção: base igual para todos + zona do instrumento
 * (até ~12 controles) + controles dos efeitos do próprio patch.
 */
export function buildPatchLayout (input: PatchLayoutInput): LayoutConfig {
  const family = detectFamily(input.setName, input.patchName, input.layers);
  // Synth Bass também é JX10, mas a extensão de baixo ajuda na mão.
  const isBassName = /baixo|bass/i.test(input.patchName);
  const [low, high] = isBassName ? KEY_RANGES.bass : KEY_RANGES[family];
  const base = createDefaultKeyboardLayout(input.tempo, {
    title: input.title,
    keyboardLow: low,
    keyboardHigh: high,
  });

  const owner = input.layerId;
  const extras: UiElement[] = [];

  if (family === 'organ' && owner) {
    const groupId = elementId(input.slug, 'drawbars');
    for (let i = 0; i < 9; i += 1) {
      extras.push(control(
        elementId(input.slug, `drawbar_${i}`),
        DRAWBAR_LABELS[i],
        208 + i * 48,
        150,
        {
          type: 'drawbar',
          owner,
          parameterId: String(i),
          min: 0,
          max: 8,
          value: 0,
          color: '#C6A15B',
          width: 42,
          height: 100,
          groupId,
        }
      ));
    }
    const organExtras = [
      { index: 9, label: 'Percussão' },
      { index: 13, label: 'Vibrato/Chorus', max: 6 },
      { index: 16, label: 'Leslie', max: 3 },
    ];
    for (const [index, entry] of organExtras.entries()) {
      extras.push(control(
        elementId(input.slug, `organ_${entry.index}`),
        entry.label,
        208 + index * 88,
        270,
        {
          owner,
          parameterId: String(entry.index),
          max: entry.max ?? 1,
          value: entry.max ? 1 : 0.5,
        }
      ));
    }
  } else if (owner || (input.masterInserts?.length ?? 0) > 0) {
    const isSamplerLayer = input.layers.some((layer) => layer.sample);
    let nativeControls: NativeControl[] = [];
    if (owner) {
      if (isSamplerLayer) {
        nativeControls = SAMPLER_CONTROLS[family] ?? SAMPLER_CONTROLS.sampler ?? [];
      } else {
        nativeControls = [...(NATIVE_CONTROLS[family] ?? [])];
        if (family === 'jx' && input.layers.some((layer) => layer.arp?.enabled)) {
          nativeControls = [...nativeControls, ...ARP_CONTROLS];
        }
      }
    }
    nativeControls = nativeControls.slice(0, 12);
    const effectBudget = Math.max(0, 12 - nativeControls.length);
    const layerFx = owner
      ? effectControls(
          input.slug,
          input.layerInserts ?? [],
          owner,
          0,
          effectBudget
        )
      : [];
    const masterFx = effectControls(
      input.slug,
      input.masterInserts ?? [],
      'patch',
      layerFx.length,
      Math.max(0, effectBudget - layerFx.length)
    );
    const fx = [...layerFx, ...masterFx];

    nativeControls.forEach((entry, index) => {
      extras.push(control(
        elementId(input.slug, `native_${entry.index}`),
        entry.label,
        208 + (index % 6) * 88,
        150 + Math.floor(index / 6) * 100,
        {
          owner,
          parameterId: String(entry.index),
          max: entry.max ?? 1,
          value: 0.5,
        }
      ));
    });

    // Efeitos depois dos controles nativos, nas posições restantes.
    fx.forEach((element, index) => {
      const slot = nativeControls.length + index;
      extras.push({
        ...element,
        x: 208 + (slot % 6) * 88,
        y: 150 + Math.floor(slot / 6) * 100,
      });
    });
  }

  return {
    ...base,
    elements: [...base.elements, ...extras],
  };
}

export interface StompDefinition {
  label: string;
  params: NonNullable<UiElement['stompParams']>;
}

/**
 * Knobs de um pedal de efeito a partir do catálogo (Drive/Tone, Gain/Presence…).
 * Usado pela template e pelo inspetor ao vincular o pedal a um insert.
 */
export function stompDefinition (pathOrName: string, fallbackLabel = ''): StompDefinition {
  const effect = findEffect(pathOrName);
  if (!effect) return { label: fallbackLabel, params: [] };
  const wanted = EFFECT_CONTROLS[effect.shortName] ?? [];
  const params = wanted.slice(0, 3).flatMap((entry) => {
    const param = effectParam(effect, entry.name);
    return param
      ? [{ parameterId: String(param.index), label: entry.label, min: 0, max: 1, value: 0.5 }]
      : [];
  });
  return { label: effect.shortName, params };
}

export interface PedalboardLayoutInput {
  /** Id estável do patch (para os ids dos elementos). */
  slug: string;
  title: string;
  tempo: number;
  /** Dono dos inserts (normalmente `patch`, o Master do Patch). */
  owner: string;
  /** Inserts que viram pedais, na ordem dos slots. */
  inserts: Insert[];
  /** Inclui o controle de entrada de áudio (padrão true). */
  audioInput?: boolean;
}

/**
 * Layout de pedaleira: sem teclado, um pedal por insert do Master do Patch e
 * o controle da entrada de áudio. Usado pela template Guitarra (entrada ao
 * vivo: microfone, guitarra, baixo, violão).
 */
export function buildPedalboardLayout (input: PedalboardLayoutInput): LayoutConfig {
  const base = createDefaultKeyboardLayout(input.tempo, {
    title: input.title,
    keyboardLow: 0,
    keyboardHigh: 127,
  });
  const elements = base.elements.filter((element) => {
    if (element.type === 'keyboard' || element.type === 'midi-activity') return false;
    // Pedaleira não usa os pedais físicos de teclado (Expression/Sustain).
    if (element.type === 'pedal' && element.pedalKind !== 'stomp') return false;
    if (element.id.includes('_modulation')) return false;
    // Sem knobs de Aux: a template não configura Reverb/Delay nos Aux.
    if (element.patchSendAux !== undefined) return false;
    return true;
  });

  if (input.audioInput !== false) {
    elements.push({
      id: elementId(input.slug, 'audio_input'),
      type: 'audio-input',
      label: 'Entrada',
      x: 16,
      y: 250,
      width: 190,
      height: 240,
      color: '#FF9F0A',
      minValue: 0,
      maxValue: 1,
      orientation: 'vertical',
      isMomentary: false,
    });
  }

  const inserts = [...input.inserts].sort((a, b) => a.slot - b.slot);
  inserts.forEach((insert, index) => {
    const definition = stompDefinition(insert.path, insert.name);
    elements.push({
      id: elementId(input.slug, `stomp_${insert.slot}`),
      type: 'pedal',
      pedalKind: 'stomp',
      label: definition.label || insert.name,
      x: 220 + index * 235,
      y: 250,
      width: 210,
      height: 280,
      color: findEffect(insert.path)?.source === 'guitarix' ? '#E0A526' : '#0A84FF',
      minValue: 0,
      maxValue: 1,
      orientation: 'vertical',
      isMomentary: false,
      value: 1,
      stompOwner: input.owner,
      stompSlot: insert.slot,
      ...(definition.params.length > 0 ? { stompParams: definition.params } : {}),
    });
  });

  return { ...base, elements };
}

const NATIVE_LAYER_IDS: Array<NonNullable<CollectionLayerSpec['nativeInstrument']>> = [
  'organ', 'tines', 'reeds', 'piano', 'dx', 'jx', 'dexed', 'synth2', 'drums',
];

/** Traduz o assignment salvo do patch para a especificação usada pelo layout. */
function assignmentLayer (assignment: PresetPluginAssignment): CollectionLayerSpec {
  const native = assignment.pluginId.startsWith('preseter.')
    ? assignment.pluginId.slice('preseter.'.length)
    : '';
  const nativeInstrument = NATIVE_LAYER_IDS.find((id) => id === native);
  const isSampler = assignment.sourceKind === 'sampler' || assignment.pluginId === 'preseter.sampler';
  return {
    inst: 'NATIVE',
    db: assignment.mix?.volumeDb ?? 0,
    min: assignment.minNote ?? 0,
    max: assignment.maxNote ?? 127,
    label: assignment.name,
    ...(isSampler ? { sample: { library: 'musescore' as const } } : {}),
    ...(nativeInstrument ? { nativeInstrument } : {}),
  };
}

export interface PresetLayoutOptions {
  /** Nome do set (ajuda a reconhecer a família). */
  setName?: string;
  /** Tempo do concert; sem ele, usa o tempo salvo no patch. */
  tempo?: number;
}

/**
 * Regera o layout de um patch já salvo (ação explícita do usuário).
 * Não mexe em nome, plugins, inserts nem valores; devolve só o layout.
 */
export function buildPresetLayout (preset: Preset, options: PresetLayoutOptions = {}): LayoutConfig {
  const assignments = preset.plugins ?? [];
  const layers = assignments.map(assignmentLayer);
  return buildPatchLayout({
    slug: preset.id,
    title: preset.notes?.trim() || preset.name,
    tempo: options.tempo ?? preset.layout?.tempo ?? DEFAULT_TEMPO,
    setName: options.setName ?? '',
    patchName: preset.name,
    layers,
    layerId: assignments[0]?.layerId,
    layerInserts: assignments[0]?.inserts ?? [],
    masterInserts: preset.master?.inserts ?? [],
  });
}
