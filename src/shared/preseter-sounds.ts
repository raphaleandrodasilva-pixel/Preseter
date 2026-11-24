import type { NativeProgramInstrument } from './native-presets';

/**
 * Preseter Sounds: sons prontos de fábrica. Cada um é um instrumento nativo com
 * um programa, a cadeia de efeitos do strip (até 4) e os envios de Reverb (Aux 1)
 * e Delay (Aux 2), em dB.
 *
 * No Zyn, `program` é o nome mostrado pelo motor ("<pasta> · <arquivo>", sem o
 * prefixo "Fábrica/"): o índice é resolvido na leitura do banco, então o som não
 * muda de lugar se o banco ganhar presets novos.
 */
export interface PreseterSound {
  name: string;
  category: string;
  instrument: NativeProgramInstrument | 'zyn';
  program: number | string;
  effects: Array<{ effect: string; preset?: string }>;
  reverb?: number;
  delay?: number;
}

const FX = (name: string, preset?: string) => ({ effect: `Preseter ${name}`, ...(preset ? { preset } : {}) });
const M1 = 'the_mysterious_bank';
const M2 = 'the_mysterious_bank_2';
const M3 = 'the_mysterious_bank_3';
const M4 = 'the_mysterious_bank_4';

type Row = [name: string, instrument: PreseterSound['instrument'], program: number | string,
  effects: PreseterSound['effects'], reverb?: number, delay?: number];

const group = (category: string, rows: Row[]): PreseterSound[] =>
  rows.map(([name, instrument, program, effects, reverb, delay]) => ({
    name, category, instrument, program, effects,
    ...(reverb !== undefined ? { reverb } : {}),
    ...(delay !== undefined ? { delay } : {}),
  }));

export const PRESETER_SOUNDS: PreseterSound[] = [
  ...group('Piano', [
    ['Stage Grand', 'piano', 4, [FX('EQ', 'piano'), FX('Compressor', 'piano')], -14],
    ['Dark Ballad Piano', 'piano', 5, [FX('EQ', 'piano'), FX('Compressor', 'piano')], -12],
    ['Dance Piano', 'piano', 3, [FX('Compressor', 'bus'), FX('EQ', 'presence')], -18, -26],
    ['School Upright', 'piano', 6, [FX('EQ', 'piano'), FX('Chorus', 'subtle')], -18],
    ['FM Grand', 'dexed', 989, [FX('EQ', 'piano'), FX('Compressor', 'piano')], -14],
    ['Synth Piano', 'zyn', 'SynthPiano · 0065-Synth Piano 1', [FX('Chorus', 'subtle'), FX('EQ', 'teclas')], -16, -24],
    ['Analog Piano', 'zyn', 'SynthPiano · 0033-Analog Piano 1', [FX('Chorus', 'vintage')], -16, -24],
    ['FM Harpsichord', 'dexed', 33, [FX('EQ', 'presence')], -14],
  ]),
  ...group('E-Piano', [
    ['Classic Tines', 'tines', 0, [FX('EQ', 'teclas'), FX('Chorus', 'subtle'), FX('Phaser', 'slow')], -16, -26],
    ['Stage Tines', 'tines', 1, [FX('EQ', 'teclas'), FX('Pulsator', 'classic')], -18],
    ['Mellow Tines', 'tines', 2, [FX('EQ', 'teclas'), FX('Chorus', 'vintage')], -16, -24],
    ['Bark Tines Drive', 'tines', 3, [FX('Harmonics', 'default'), FX('Compressor', 'bus'), FX('Phaser', 'slow')], -20],
    ['Wurly Classic', 'reeds', 0, [FX('EQ', 'teclas'), FX('Pulsator', 'slow')], -16, -24],
    ['Wurly Suitcase', 'reeds', 1, [FX('Chorus', 'vintage'), FX('Compressor', 'default')], -18],
    ['Wurly Bark', 'reeds', 3, [FX('Harmonics', 'default'), FX('Compressor', 'bus')], -20],
    ['DX Bright EP', 'dx', 0, [FX('Chorus', 'subtle'), FX('EQ', 'teclas')], -16, -24],
    ['DX Jazz EP', 'dx', 1, [FX('EQ', 'teclas')], -16],
    ['Eighties FM Piano', 'dexed', 87, [FX('Chorus', 'subtle'), FX('EQ', 'teclas')], -16, -22],
    ['FM Rhodes', 'dexed', 79, [FX('Chorus', 'subtle'), FX('Phaser', 'slow')], -16],
    ['Ice Rhodes', 'zyn', 'Rhodes · 0012-Ice Rhodes1', [FX('Chorus', 'wide'), FX('Stereo', 'wide')], -14, -24],
    ['Rhodes Space', 'zyn', 'Fantasy · 0042-Rhodes Space1', [FX('Chorus', 'wide')], -12, -20],
    ['80s Synth Rhodes', 'zyn', `${M4} · 0033-80s_rhodes`, [FX('Chorus', 'vintage'), FX('EQ', 'teclas')], -16, -24],
    ['Funk Clav', 'dx', 6, [FX('Compressor', 'default'), FX('Filter', 'envelope'), FX('Phaser', 'fast')], -22],
    ['FM Clavinet', 'dexed', 694, [FX('Compressor', 'default'), FX('Filter', 'envelope')], -22],
  ]),
  ...group('Organ', [
    ['Jazz Drawbars', 'organ', 0, [FX('EQ', 'organ')], -20],
    ['Gospel Full', 'organ', 1, [FX('EQ', 'organ'), FX('Compressor', 'bus')], -18],
    ['Rock Drive Organ', 'organ', 2, [FX('Compressor', 'bus'), FX('Harmonics', 'default')], -22],
    ['Combo Sixties', 'organ', 3, [FX('Phaser', 'slow'), FX('Chorus', 'vintage')], -20],
    ['Cathedral Pipes', 'zyn', 'Organ · 0033-Cathedral Organ1', [FX('EQ', 'organ')], -8],
    ['Soft Church Organ', 'zyn', 'Organ · 0041-Church Organ Soft', [FX('EQ', 'organ')], -10],
    ['Space Organ', 'zyn', `${M1} · 0023-space_organ`, [FX('Chorus', 'wide')], -12, -22],
    ['Mysterious Rock Organ', 'zyn', `${M1} · 0022-rock_organ`, [FX('Compressor', 'bus')], -20],
    ['Cool Organ', 'zyn', `${M3} · 0026-cool_organ`, [FX('Phaser', 'slow')], -18],
  ]),
  ...group('Accordion & Harmonica', [
    ['Musette Accordion', 'zyn', 'Organ · 0101-Accordion 1', [FX('EQ', 'teclas'), FX('Compressor', 'default')], -18],
    ['Accordion Pad', 'zyn', 'Organ · 0097-Accordion Pad 1', [FX('Chorus', 'subtle')], -14],
    ['Synth Accordion', 'zyn', 'Organ · 0099-Synth Accordion1', [FX('EQ', 'teclas')], -18],
  ]),
  ...group('Strings', [
    ['Warm Synth Strings', 'jx', 29, [FX('Chorus', 'ensemble'), FX('Stereo', 'wide')], -12],
    ['Smooth Strings', 'zyn', `${M1} · 0003-smooth_strings_pad`, [FX('Stereo', 'wide'), FX('EQ', 'pad-cordas')], -10],
    ['Trance Strings', 'zyn', `${M1} · 0004-trance_strings_pad`, [FX('Chorus', 'wide'), FX('Stereo', 'wide')], -10, -22],
    ['Mega String', 'zyn', `${M1} · 0005-mega_string`, [FX('Stereo', 'wide')], -10],
    ['Analog Strings', 'zyn', `${M2} · 0001-analog strings`, [FX('Chorus', 'ensemble'), FX('Stereo', 'wide')], -12],
    ['Soft Strings', 'zyn', `${M3} · 0001-soft_strings`, [FX('EQ', 'pad-cordas'), FX('Stereo', 'wide')], -10],
    ['Synth Strings Mysterious', 'zyn', `${M4} · 0005-synth_strings`, [FX('Chorus', 'ensemble')], -12],
    ['Dark Strings', 'zyn', 'Strings · 0034-Dark Strings', [FX('EQ', 'pad-cordas')], -10],
    ['Dual Strings', 'zyn', 'Strings · 0066-Dual Strings', [FX('Stereo', 'wide')], -10],
    ['Synth Violin', 'zyn', 'Strings · 0050-Synth Violin 1', [FX('EQ', 'pad-cordas')], -14],
    ['Vintage Poly Strings', 'dexed', 702, [FX('Chorus', 'ensemble'), FX('Stereo', 'wide')], -12],
    ['DX Violin', 'dx', 20, [FX('EQ', 'pad-cordas')], -14],
  ]),
  ...group('Choir', [
    ['Aah Choir', 'zyn', 'Choir and Voice · 0001-AHH Choir 1', [FX('EQ', 'vocal')], -8],
    ['Ooh Voice', 'zyn', 'Choir and Voice · 0004-Voice OOH', [FX('EQ', 'vocal')], -8],
    ['Choir Pad', 'zyn', 'Choir and Voice · 0005-Choir Pad1', [FX('Stereo', 'wide')], -8],
    ['Fantasy Choir', 'zyn', `${M2} · 0022-fantasy_choir`, [FX('Stereo', 'wide')], -8, -22],
    ['Space Choir', 'zyn', 'Fantasy · 0011-Space Choir1', [FX('Stereo', 'wide')], -8, -20],
    ['Glass Voices', 'zyn', 'Fantasy · 0014-Glass Voices', [FX('Chorus', 'wide')], -10, -22],
  ]),
  ...group('Brass', [
    ['JX Brass Section', 'jx', 37, [FX('Compressor', 'bus'), FX('EQ', 'presence')], -14],
    ['Soft Horn', 'jx', 36, [FX('EQ', 'default')], -14],
    ['DX Trumpet', 'dx', 16, [FX('Compressor', 'vocal')], -14],
    ['FM Brass', 'dexed', 135, [FX('Compressor', 'bus'), FX('EQ', 'presence')], -16],
  ]),
  ...group('Synth Brass', [
    ['Analog Brass', 'zyn', 'Brass · 0033-Analog Brass 1', [FX('Compressor', 'bus')], -16],
    ['Fat Brass', 'zyn', 'Brass · 0066-Fat Brass', [FX('Compressor', 'bus'), FX('Harmonics', 'default')], -16],
    ['Brass Pad', 'zyn', 'Brass · 0067-Brass Pad1', [FX('Chorus', 'ensemble')], -12],
    ['JX Synth Brass', 'jx', 38, [FX('Chorus', 'subtle'), FX('Compressor', 'bus')], -16],
    ['Poly Brass FM', 'dexed', 46, [FX('Chorus', 'wide')], -16],
  ]),
  ...group('Woodwinds', [
    ['Breathy Flute', 'zyn', 'Reed and Wind · 0007-Breathy1', [FX('EQ', 'default')], -12],
    ['Chorused Flute', 'zyn', 'Reed and Wind · 0068-Chorused Flute', [], -12, -24],
    ['Synth Clarinet', 'zyn', 'Reed and Wind · 0006-Clarinet', [], -14],
    ['Fat Reed', 'zyn', 'Reed and Wind · 0065-Fat Reed1', [FX('Compressor', 'vocal')], -16],
    ['FM Sax', 'dexed', 99, [FX('Compressor', 'vocal'), FX('EQ', 'presence')], -14, -24],
    ['Jazz Flute', 'dexed', 1019, [], -14],
    ['Bass Clarinet', 'jx', 34, [], -14],
    ['Synth Flute', 'zyn', `${M2} · 0024-synth_flute`, [FX('Chorus', 'subtle')], -12, -22],
  ]),
  ...group('Bells & Mallets', [
    ['Dreaming Bells', 'zyn', `${M3} · 0014-dreaming_bells`, [FX('Stereo', 'wide')], -12, -20],
    ['Mega Bell', 'zyn', `${M3} · 0016-mega_bell`, [FX('Stereo', 'wide')], -12, -22],
    ['Metal Bell', 'zyn', `${M4} · 0013-metal_bell`, [], -12],
    ['Bell Pad', 'zyn', 'Pads · 0097-Bell Pad', [FX('Stereo', 'wide')], -10],
    ['Fantasy Bell', 'zyn', 'SynthPiano · 0004-Fantasy Bell', [], -12, -22],
    ['Music Box', 'zyn', `${M2} · 0017-musicbox`, [FX('Stereo', 'wide')], -10, -22],
    ['Glass Bell', 'dexed', 40, [], -12],
    ['FM Bells', 'dexed', 667, [FX('Stereo', 'wide')], -12, -20],
    ['FM Celesta', 'dexed', 584, [], -12],
    ['FM Marimba', 'dexed', 982, [FX('Transients', 'pluck')], -16],
    ['FM Vibes', 'dexed', 917, [FX('Pulsator', 'slow')], -14],
    ['FM Xylophone', 'dexed', 786, [FX('Transients', 'pluck')], -16],
    ['Kalimba', 'dexed', 382, [], -16, -24],
    ['Steel Drums', 'jx', 45, [], -16, -24],
    ['Soft Chimes', 'dx', 4, [FX('Stereo', 'wide')], -12],
  ]),
  ...group('Plucked', [
    ['Plucked Synth', 'zyn', 'Plucked · 0001-Plucked 1', [FX('Stereo', 'wide')], -16, -20],
    ['Plucked Pad', 'zyn', 'Plucked · 0065-Plucked Pad1', [FX('Chorus', 'subtle')], -12],
    ['FM Harp', 'dexed', 459, [], -12],
    ['DX Harp', 'dx', 12, [], -12],
    ['Synth Pizzicato', 'jx', 28, [FX('Transients', 'pluck')], -14],
  ]),
  ...group('World', [
    ['FM Koto', 'dexed', 890, [], -16, -24],
    ['DX Koto', 'dx', 11, [], -16],
    ['DX Sitar', 'dx', 7, [FX('Chorus', 'subtle')], -18],
  ]),
  ...group('Guitar', [
    ['Jazz Box Guitar', 'zyn', `${M4} · 0039-jazz_guitar`, [FX('Compressor', 'default'), FX('Chorus', 'subtle')], -18],
    ['Synth Guitar', 'zyn', `${M3} · 0034-synth_guitar`, [FX('Compressor', 'default')], -16, -22],
    ['Heavy Synth Guitar', 'zyn', `${M2} · 0023-heavy_metal_guitar`, [FX('Compressor', 'default')], -20],
    ['Clean Synth Guitar', 'zyn', 'Guitar · 0065-Clean Guitar1', [FX('Chorus', 'subtle')], -18, -24],
    ['DX Jazz Guitar', 'dx', 13, [FX('Compressor', 'default')], -18],
    ['FM Pick Guitar', 'dexed', 858, [FX('Compressor', 'default')], -18],
  ]),
  ...group('Bass', [
    ['Fretless', 'jx', 25, [FX('Compressor', 'bass'), FX('EQ', 'baixo')]],
    ['Soft Pick Bass', 'jx', 24, [FX('Compressor', 'bass'), FX('EQ', 'baixo')]],
    ['Fingered Bass', 'zyn', `${M2} · 0003-fingered_bass`, [FX('Compressor', 'bass'), FX('EQ', 'baixo')]],
    ['DX Upright Bass', 'dx', 27, [FX('Compressor', 'bass')]],
    ['DX Electric Bass', 'dx', 22, [FX('Compressor', 'bass'), FX('Harmonics', 'bass')]],
  ]),
  ...group('Synth Bass', [
    ['Fat DnB Bass', 'zyn', `${M3} · 0024-fat_dnb_bass`, [FX('Compressor', 'bass'), FX('Harmonics', 'bass')]],
    ['Synth Bass Fat', 'zyn', `${M1} · 0011-synth_bass_fat`, [FX('Compressor', 'bass')]],
    ['Aggressive Bass', 'zyn', `${M1} · 0009-agressive_bass`, [FX('Compressor', 'bass'), FX('Harmonics', 'bass')]],
    ['Hard Bass', 'zyn', `${M4} · 0023-hard_bass`, [FX('Compressor', 'bass')]],
    ['Bass Pad', 'zyn', `${M4} · 0020-bass_pad_fat`, [FX('Compressor', 'bass')], -20],
    ['303 Saw Bass', 'jx', 15, [FX('Compressor', 'bass'), FX('Filter', 'acid')]],
    ['Wobble Bass', 'jx', 21, [FX('Compressor', 'bass')]],
    ['Analog Bass', 'jx', 17, [FX('Compressor', 'bass'), FX('Harmonics', 'bass')]],
    ['FM Synth Bass', 'zyn', 'Bass · 0035-FM Bass 1', [FX('Compressor', 'bass')]],
    ['Sine Sub', 'jx', 20, [FX('Compressor', 'bass')]],
  ]),
  ...group('Synth Lead', [
    ['Supersaw', 'zyn', `${M1} · 0013-supersaw`, [FX('Chorus', 'wide'), FX('Stereo', 'wide')], -16, -18],
    ['Supersaw Stack', 'zyn', `${M3} · 0010-supersaw`, [FX('Stereo', 'wide')], -16, -18],
    ['Superpulse', 'zyn', `${M1} · 0015-superpulse`, [FX('Chorus', 'subtle')], -16, -20],
    ['Portal Lead', 'zyn', `${M3} · 0011-portal2_lead`, [FX('Compressor', 'default'), FX('Stereo', 'wide')], -16, -14],
    ['Funky Lead', 'zyn', `${M4} · 0027-funky_lead`, [FX('Compressor', 'default')], -18, -22],
    ['French House Lead', 'zyn', `${M4} · 0028-daft_punk_lead`, [FX('Compressor', 'default'), FX('Phaser', 'slow')], -16, -18],
    ['Power Pulse Lead', 'zyn', `${M1} · 0030-power_pulsions_lead`, [FX('Compressor', 'default')], -16, -18],
    ['Wah Sine Lead', 'zyn', `${M1} · 0031-wah_sine`, [], -16, -20],
    ['Computer Lead', 'zyn', 'Synth · 0065-Computer Lead1', [], -16, -18],
    ['SuperSaw Classic', 'zyn', 'Misc · 0065-SuperSaw 1', [FX('Stereo', 'wide')], -16, -18],
    ['Hard Lead', 'jx', 9, [FX('Compressor', 'default')], -16, -16],
    ['Mono Glide', 'jx', 7, [], -18, -20],
  ]),
  ...group('Synth Pad', [
    ['At Saturnus', 'zyn', `${M3} · 0003-at_saturnus`, [FX('Chorus', 'wide'), FX('Stereo', 'wide')], -8, -14],
    ['Echoes', 'zyn', `${M3} · 0004-echoes`, [FX('Stereo', 'wide')], -10, -16],
    ['Padding', 'zyn', `${M3} · 0008-padding`, [FX('Chorus', 'ensemble')], -10],
    ['Resonant Pad', 'zyn', `${M3} · 0009-res_pad`, [FX('Phaser', 'slow')], -12, -22],
    ['Compad', 'zyn', `${M3} · 0007-compad`, [FX('Stereo', 'wide')], -10],
    ['In The Space', 'zyn', `${M3} · 0017-in_the_space`, [FX('Stereo', 'wide')], -8, -14],
    ['From Another Galaxy', 'zyn', `${M4} · 0008-from_another_galaxy`, [FX('Stereo', 'wide')], -8, -14],
    ['From Another Planet', 'zyn', `${M4} · 0009-from_another_planet`, [FX('Chorus', 'wide')], -8, -16],
    ['Nameless Pad', 'zyn', `${M4} · 0010-unamed_pad`, [FX('Stereo', 'wide')], -10],
    ['Resonant Strings Pad', 'zyn', `${M4} · 0001-res_strings_pad`, [FX('Chorus', 'ensemble')], -10],
    ['Sine Pad', 'zyn', `${M1} · 0016-sine_pad`, [FX('Chorus', 'subtle')], -10],
    ['Analog Pad', 'zyn', 'Pads · 0003-Analog Pad 1', [FX('Chorus', 'ensemble'), FX('Stereo', 'wide')], -10],
    ['Soft Pad', 'zyn', 'Pads · 0065-Soft Pad', [FX('Stereo', 'wide')], -10],
    ['Phased Pad', 'zyn', 'Synth · 0033-Phased Pad 1', [FX('Phaser', 'slow')], -12],
    ['Impossible Dream', 'zyn', 'Fantasy · 0033-ImpossibleDream1', [FX('Stereo', 'wide')], -8, -16],
    ['Very Soft Pad', 'jx', 27, [FX('Chorus', 'ensemble')], -10],
    ['Fifth Sweep Pad', 'jx', 0, [FX('Stereo', 'wide')], -10, -22],
    ['Echo Pad', 'jx', 1, [], -12, -18],
    ['Slow 3D Pad', 'dexed', 30, [FX('Stereo', 'wide')], -10],
  ]),
  ...group('Arp', [
    ['Mysterious Arp', 'zyn', `${M3} · 0029-new_arpeggio_3`, [], -16, -16],
    ['Sparkle Arp', 'zyn', `${M4} · 0011-arpeggio1`, [FX('Stereo', 'wide')], -16, -16],
    ['Glass Arpeggio', 'zyn', 'Arpeggios · 0068-Glass Arpeggio1', [], -14, -18],
    ['Soft Arpeggio', 'zyn', 'Arpeggios · 0039-Soft Arpeggio1', [], -14, -18],
  ]),
  ...group('FX', [
    ['The Rain', 'zyn', `${M1} · 0037-the_rain`, [], -10],
    ['Canyon Wind', 'zyn', `${M2} · 0030-canyon_wind`, [], -10],
    ['Falling Stars', 'zyn', `${M3} · 0038-falling_stars`, [], -10, -16],
    ['UFO', 'zyn', `${M2} · 0036-ufo`, [], -12, -18],
    ['Thunder', 'zyn', `${M1} · 0039-thunder`, [], -10],
  ]),
];
