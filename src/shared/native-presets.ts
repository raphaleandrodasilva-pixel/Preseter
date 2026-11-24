import dexedFactory from './native-presets/dexed-factory.json';
import { categorizePreset } from './vst-presets';

/**
 * Programas de fábrica dos instrumentos nativos, na ordem do motor
 * (`getProgramName`). O Zyn é lido do disco (ver `main/vst/nativePresets.ts`).
 */
export type NativeProgramInstrument = 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx' | 'dexed';

/** Ordem do `NativeProcessor::getProgramName`. */
const ORGAN = ['Jazz', 'Gospel', 'Rock', 'Combo'];
const TINES = ['Suitcase', 'Stage', 'Mellow', 'Bark'];
const REEDS = ['Clássico', 'Suitcase', 'Stage', 'Bark'];

/** mda Piano, DX10 e JX10 (engine/third_party/mda-*). */
const PIANO = ['mda Piano', 'Plain Piano', 'Compressed Piano', 'Dance Piano', 'Concert Piano', 'Dark Piano', 'School Piano', 'Broken Piano'];
const DX10 = [
  'Bright E.Piano', 'Jazz E.Piano', 'E.Piano Pad', 'Fuzzy E.Piano', 'Soft Chimes', 'Harpsichord', 'Funk Clav', 'Sitar',
  'Chiff Organ', 'Tinkle', 'Space Pad', 'Koto', 'Harp', 'Jazz Guitar', 'Steel Drum', 'Log Drum',
  'Trumpet', 'Horn', 'Reed 1', 'Reed 2', 'Violin', 'Chunky Bass', 'E.Bass', 'Clunk Bass',
  'Thick Bass', 'Sine Bass', 'Square Bass', 'Upright Bass 1', 'Upright Bass 2', 'Harmonics', 'Scratch', 'Syn Tom',
];
const JX10 = [
  '5th Sweep Pad', 'Echo Pad [SA]', 'Space Chimes [SA]', 'Solid Backing', 'Velocity Backing [SA]', 'Rubber Backing [ZF]',
  '808 State Lead', 'Mono Glide', 'Detuned Techno Lead', 'Hard Lead [SA]', 'Bubble', 'Monosynth', 'Moogcury Lite',
  'Gangsta Whine', 'Higher Synth [ZF]', '303 Saw Bass', '303 Square Bass', 'Analog Bass', 'Analog Bass 2', 'Low Pulses',
  'Sine Infra-Bass', 'Wobble Bass [SA]', 'Squelch Bass', 'Rubber Bass [ZF]', 'Soft Pick Bass', 'Fretless Bass', 'Whistler',
  'Very Soft Pad', 'Pizzicato', 'Synth Strings', 'Synth Strings 2', 'Leslie Organ', 'Click Organ', 'Hard Organ',
  'Bass Clarinet', 'Trumpet', 'Soft Horn', 'Brass Section', 'Synth Brass', 'Detuned Syn Brass [ZF]', 'Power PWM',
  'Water Velocity [SA]', 'Ghost [SA]', 'Soft E.Piano', 'Thumb Piano', 'Steel Drums [ZF]', 'Car Horn', 'Helicopter',
  'Arctic Wind', 'Thip', 'Synth Tom', 'Squelchy Frog',
];

export interface NativeProgram {
  instrument: NativeProgramInstrument;
  index: number;
  /** Nome como o motor informa (usado para conferir o índice). */
  programName: string;
  /** Nome mostrado na biblioteca. */
  name: string;
  collection: string;
  category: string;
}

/** Nome e plugin de cada instrumento nativo com programas. */
export const NATIVE_PROGRAM_PLUGINS: Record<NativeProgramInstrument | 'zyn', { id: string; name: string; short: string }> = {
  organ: { id: 'preseter.organ', name: 'Preseter Organ', short: 'Organ' },
  tines: { id: 'preseter.tines', name: 'Preseter Tines', short: 'Tines' },
  reeds: { id: 'preseter.reeds', name: 'Preseter Wurly', short: 'Wurly' },
  piano: { id: 'preseter.piano', name: 'Preseter Piano', short: 'Piano' },
  dx: { id: 'preseter.dx', name: 'Preseter DX10', short: 'DX10' },
  jx: { id: 'preseter.jx', name: 'Preseter JX10', short: 'JX10' },
  dexed: { id: 'preseter.dexed', name: 'Preseter Dexed', short: 'Dexed' },
  zyn: { id: 'preseter.zyn', name: 'Preseter Zyn', short: 'Zyn' },
};

/** Tira o sufixo de autor (`[SA]`) e espaços sobrando. */
const cleanName = (name: string): string => name.replace(/\s*\[[A-Z]{2}\]\s*$/, '').replace(/\s+/g, ' ').trim();

/** Lista de programas de fábrica de todos os nativos, menos o Zyn. */
export function staticNativePrograms (): NativeProgram[] {
  const list: NativeProgram[] = [];
  const add = (
    instrument: NativeProgramInstrument,
    names: string[],
    category: (name: string) => string,
    collection: (name: string) => string = () => NATIVE_PROGRAM_PLUGINS[instrument].short
  ) => {
    names.forEach((programName, index) => {
      const name = cleanName(programName);
      list.push({ instrument, index, programName, name, collection: collection(programName), category: category(name) });
    });
  };

  add('organ', ORGAN, () => 'Organ');
  add('tines', TINES, () => 'E-Piano');
  add('reeds', REEDS, () => 'E-Piano');
  add('piano', PIANO, () => 'Piano');
  add('dx', DX10, (name) => categorizePreset(name, 'E-Piano'));
  add('jx', JX10, (name) => categorizePreset(name, 'Synth Lead'));
  add(
    'dexed',
    dexedFactory as string[],
    (name) => categorizePreset(name.slice(name.indexOf('·') + 1), 'Outros'),
    (programName) => `Dexed · ${programName.slice(0, programName.indexOf(' ·')).replace(/^Dexed /, 'Bank ')}`
  );
  // O Dexed mostra "Banco · Nome": a biblioteca mostra só o nome do programa.
  for (const program of list) {
    if (program.instrument === 'dexed') program.name = cleanName(program.programName.slice(program.programName.indexOf('·') + 1)) || 'Init';
  }
  return list;
}
