/**
 * Layout do painel do Preseter Synth2.
 *
 * Os `name` são exatamente os nomes publicados pelo EngineCore
 * (`EngineCore/Params.hpp`), que o motor expõe como nome dos parâmetros.
 * `range` só é necessário quando a faixa não é 0..127 (editores numéricos).
 */

export type Synth2ControlKind = 'knob' | 'toggle' | 'choice';

export interface Synth2Control {
  name: string;
  label: string;
  kind: Synth2ControlKind;
  choices?: string[];
  range?: [number, number];
}

export interface Synth2Section {
  title: string;
  controls: Synth2Control[];
}

const knob = (name: string, label: string, range?: [number, number]): Synth2Control => ({
  name, label, kind: 'knob', ...(range ? { range } : {}),
});
const toggle = (name: string, label: string): Synth2Control => ({ name, label, kind: 'toggle' });
const choice = (name: string, label: string, choices: string[]): Synth2Control => ({
  name, label, kind: 'choice', choices,
});

const LFO_DESTS = ['OSC2', 'OSC1+2', 'Filtro', 'Amp', 'P/W', 'FM', 'Pan'];
const LFO_TYPES = ['Saw', 'Tri', 'Square', 'S&H', 'Smooth', 'Sine'];
const FILTER_TYPES = ['LP12', 'LP24', 'HP12', 'BP12', 'LPDL'];
const EFFECT_TYPES = ['AD1', 'AD2', 'DD', 'DECI', 'RM', 'COMP', 'PH1', 'PH2', 'PH3', 'PH4'];

export const SYNTH2_SECTIONS: Synth2Section[] = [
  {
    title: 'OSC 1',
    controls: [
      choice('osc1 shape', 'Forma', ['Sine', 'Saw', 'Pulse', 'Triangle']),
      knob('osc pulse width', 'Pulse width'),
      knob('osc1 FM', 'FM'),
      knob('osc phase shift', 'Fase'),
      knob('osc key shift', 'Key shift', [-24, 24]),
      knob('osc1,2 fine tune', 'Fine tune'),
      knob('osc1 sub gain', 'Sub gain'),
      choice('osc1 sub shape', 'Sub forma', ['Sine', 'Triangle', 'Saw', 'Square']),
      choice('osc1 sub octave', 'Sub oitava', ['0 oct', '-1 oct']),
    ],
  },
  {
    title: 'OSC 2',
    controls: [
      choice('osc2 shape', 'Forma', ['Saw', 'Pulse', 'Triangle', 'Noise']),
      knob('osc2 pitch', 'Pitch'),
      knob('osc2 fine tune', 'Fine'),
      toggle('osc2 kbd track', 'Kbd track'),
      knob('osc mix', 'Mix 1↔2'),
      toggle('osc2 sync', 'Sync'),
      toggle('osc2 ring modulation', 'Ring'),
    ],
  },
  {
    title: 'MOD ENV',
    controls: [
      toggle('osc mod env on/off', 'Ligado'),
      knob('osc mod env amount', 'Amount'),
      knob('osc mod env attack', 'Attack'),
      knob('osc mod env decay', 'Decay'),
      choice('osc mod dest', 'Destino', ['OSC2', 'FM', 'P/W']),
    ],
  },
  {
    title: 'UNISON',
    controls: [
      toggle('unison mode', 'Ligado'),
      knob('unison voice num', 'Vozes', [2, 8]),
      knob('unison detune', 'Detune'),
      knob('osc1 detune', 'Detune OSC1'),
      knob('unison pan spread', 'Pan spread'),
      knob('unison pitch', 'Pitch', [0, 48]),
      knob('unison phase shift', 'Fase'),
    ],
  },
  {
    title: 'FILTRO',
    controls: [
      choice('filter type', 'Tipo', FILTER_TYPES),
      knob('filter freq', 'Freq'),
      knob('filter resonance', 'Resonance'),
      knob('filter amount', 'Amount'),
      knob('filter kbd track', 'Kbd track'),
      knob('filter saturation', 'Saturation'),
      toggle('filter velocity switch', 'Velocity'),
    ],
  },
  {
    title: 'EG DO FILTRO',
    controls: [
      knob('filter attack', 'Attack'),
      knob('filter decay', 'Decay'),
      knob('filter sustain', 'Sustain'),
      knob('filter release', 'Release'),
    ],
  },
  {
    title: 'EG DO AMP',
    controls: [
      knob('amp attack', 'Attack'),
      knob('amp decay', 'Decay'),
      knob('amp sustain', 'Sustain'),
      knob('amp release', 'Release'),
      knob('amp gain', 'Gain'),
      knob('amp velocity sens', 'Velocity'),
    ],
  },
  {
    title: 'LFO 1',
    controls: [
      toggle('lfo1 on/off', 'Ligado'),
      choice('lfo1 destination', 'Destino', LFO_DESTS),
      choice('lfo1 type', 'Tipo', LFO_TYPES),
      knob('lfo1 speed', 'Speed'),
      knob('lfo1 depth', 'Depth'),
      toggle('lfo1 tempo sync', 'Tempo sync'),
      toggle('lfo1 key sync', 'Key sync'),
    ],
  },
  {
    title: 'LFO 2',
    controls: [
      toggle('lfo2 on/off', 'Ligado'),
      choice('lfo2 destination', 'Destino', LFO_DESTS),
      choice('lfo2 type', 'Tipo', LFO_TYPES),
      knob('lfo2 speed', 'Speed'),
      knob('lfo2 depth', 'Depth'),
      toggle('lfo2 tempo sync', 'Tempo sync'),
      toggle('lfo2 key sync', 'Key sync'),
    ],
  },
  {
    title: 'WHEEL',
    controls: [
      knob('midi ctrl sens1', 'Sens 1'),
      knob('midi ctrl sens2', 'Sens 2'),
    ],
  },
  {
    title: 'PLAY',
    controls: [
      choice('play mode type', 'Modo', ['Poly', 'Mono', 'Legato']),
      knob('portament time', 'Portamento'),
      toggle('portament auto mode', 'Porta auto'),
      knob('pitch bend range', 'Bend range', [0, 24]),
      knob('pan', 'Pan'),
    ],
  },
  {
    title: 'ARPEGGIATOR',
    controls: [
      toggle('arpeggiator on/off', 'Ligado'),
      choice('arpeggiator type', 'Tipo', ['Up&Down', 'Up', 'Down', 'Random']),
      knob('arpeggiator oct range', 'Oitavas', [0, 3]),
      knob('arpeggiator beat', 'Beat'),
      knob('arpeggiator gate', 'Gate'),
    ],
  },
  {
    title: 'CHORUS',
    controls: [
      toggle('chorus on/off', 'Ligado'),
      choice('chorus type', 'Tipo', ['x1', 'x2', 'x2', 'x4']),
      knob('chorus delay time', 'Delay'),
      knob('chorus depth', 'Depth'),
      knob('chorus rate', 'Rate'),
      knob('chorus feedback', 'Feedback'),
      knob('chorus level', 'Level'),
    ],
  },
  {
    title: 'DELAY',
    controls: [
      toggle('delay on/off', 'Ligado'),
      choice('delay type', 'Tipo', ['ST', 'X', 'PP']),
      knob('delay time', 'Time'),
      knob('delay time spread', 'Spread'),
      knob('delay feedback', 'Feedback'),
      knob('delay dry/wet', 'Dry/wet'),
      knob('delay tone', 'Tone'),
    ],
  },
  {
    title: 'EQUALIZER',
    controls: [
      knob('equalizer tone', 'Tone'),
      knob('equalizer freq', 'Freq'),
      knob('equalizer level', 'Level'),
      knob('equalizer Q', 'Q'),
    ],
  },
  {
    title: 'EFFECT',
    controls: [
      toggle('effect on/off', 'Ligado'),
      choice('effect type', 'Tipo', EFFECT_TYPES),
      knob('effect control1', 'Ctrl 1'),
      knob('effect control2', 'Ctrl 2'),
      knob('effect level/mix', 'Level/mix'),
    ],
  },
  {
    title: 'CTRL ASSIGN',
    controls: [
      knob('midi ctrl src1', 'Fonte 1', [-1, 65535]),
      knob('midi ctrl assign1', 'Destino 1', [-1, 65535]),
      knob('midi ctrl src2', 'Fonte 2', [-1, 65535]),
      knob('midi ctrl assign2', 'Destino 2', [-1, 65535]),
    ],
  },
  {
    title: 'VOZES',
    controls: [
      knob('polyphony', 'Polifonia', [1, 32]),
      knob('volume', 'Volume', [0, 127]),
    ],
  },
];

/** Todos os parâmetros do painel (99 do patch + volume). */
export const SYNTH2_CONTROLS: Synth2Control[] = SYNTH2_SECTIONS.flatMap((section) => section.controls);
