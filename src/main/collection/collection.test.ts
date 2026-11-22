import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  analyzeCollectionConcert,
  buildCollectionConcert,
  findEffectPlugin,
  nativeAssignmentFor,
  resolveEffectInserts,
} from './generateCollection';
import { N } from '../../shared/collection-presets';
import { findEffect } from '../../shared/effects/catalog';
import { COLLECTION_CATALOG, resolveCollectionItems } from '../../shared/collection';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

const plugins = [
  { id: 'sforzando', name: 'Sforzando', isInstrument: true },
  { id: 'fsvr', name: 'FSVR', isInstrument: true },
  { id: 'surge', name: 'Surge XT', isInstrument: true },
  { id: 'dexed', name: 'Dexed', isInstrument: true },
  { id: 'helm', name: 'Helm', isInstrument: true },
  { id: 'odin', name: 'Odin 2', isInstrument: true },
  // Efeitos nativos: o scan reporta o nome calfNXT e o caminho do bundle.
  {
    id: 'calf-chorus',
    name: 'calfNXT Chorus',
    path: 'C:/plugins/calfnxt/calfNXTChorus.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-phaser',
    name: 'calfNXT Phaser',
    path: 'C:/plugins/calfnxt/calfNXTPhaser.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-reverb',
    name: 'calfNXT Reverb',
    path: 'C:/plugins/calfnxt/calfNXTReverb.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-delay',
    name: 'calfNXT Delay',
    path: 'C:/plugins/calfnxt/calfNXTDelay.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-eq',
    name: 'calfNXT Equalizer',
    path: 'C:/plugins/calfnxt/calfNXTEqualizer.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-comp',
    name: 'calfNXT Compressor',
    path: 'C:/plugins/calfnxt/calfNXTCompressor.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-pulsator',
    name: 'calfNXT Pulsator',
    path: 'C:/plugins/calfnxt/calfNXTPulsator.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-filter',
    name: 'calfNXT Filter',
    path: 'C:/plugins/calfnxt/calfNXTFilter.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-stereo',
    name: 'calfNXT Stereo',
    path: 'C:/plugins/calfnxt/calfNXTStereo.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-harmonics',
    name: 'calfNXT Harmonics',
    path: 'C:/plugins/calfnxt/calfNXTHarmonics.vst3',
    isInstrument: false,
  },
  {
    id: 'calf-transients',
    name: 'calfNXT Transients',
    path: 'C:/plugins/calfnxt/calfNXTTransients.vst3',
    isInstrument: false,
  },
];

/** Cria a pasta de sons com as três bibliotecas usadas pela Factory 40. */
function makeSoundsFolder(): string {
  const sounds = makeTempDir();
  fs.mkdirSync(path.join(sounds, 'MuseScore_General'), { recursive: true });
  fs.writeFileSync(path.join(sounds, 'MuseScore_General', 'MuseScore_General.sf2'), 'fake');
  fs.mkdirSync(path.join(sounds, 'Sonatina'), { recursive: true });
  fs.writeFileSync(path.join(sounds, 'Sonatina', 'Sonatina_Symphonic_Orchestra.sf2'), 'fake');
  fs.mkdirSync(path.join(sounds, 'Salamander', 'SalamanderGrandPiano-master'), { recursive: true });
  fs.writeFileSync(
    path.join(sounds, 'Salamander', 'SalamanderGrandPiano-master', 'Salamander Grand Piano V3.sfz'),
    '// fake'
  );
  return sounds;
}

describe('collection catalog', () => {
  it('includes TetraOP, Charlatan 3 and Sforzando with the correct licenses', () => {
    const ids = COLLECTION_CATALOG.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['tetraop', 'charlatan3', 'sforzando']));

    const tetraop = COLLECTION_CATALOG.items.find((item) => item.id === 'tetraop');
    expect(tetraop).toMatchObject({ kind: 'vst3-zip', license: 'GPL-3.0' });
    expect(tetraop?.dataFolders?.map((folder) => folder.to)).toEqual([
      '%APPDATA%/TetraOP/presets',
      '%APPDATA%/TetraOP/wavetables',
    ]);

    const charlatan = COLLECTION_CATALOG.items.find((item) => item.id === 'charlatan3');
    expect(charlatan).toMatchObject({ kind: 'vst3-zip', license: 'Freeware' });
    expect(charlatan?.dataFolders).toHaveLength(1);

    const sforzando = COLLECTION_CATALOG.items.find((item) => item.id === 'sforzando');
    expect(sforzando).toMatchObject({ kind: 'installer', license: 'Freeware' });

    const fsvr = COLLECTION_CATALOG.items.find((item) => item.id === 'fsvr');
    expect(fsvr).toMatchObject({ kind: 'vst3-zip', license: 'GPL-3.0' });
  });

  it('resolve somente os itens e links do sistema atual', () => {
    const windows = resolveCollectionItems(COLLECTION_CATALOG.items, 'win32');
    const linux = resolveCollectionItems(COLLECTION_CATALOG.items, 'linux');

    const winIds = windows.map((item) => item.id);
    const linuxIds = linux.map((item) => item.id);
    expect(winIds).toContain('sforzando');
    expect(winIds).toContain('fsvr');
    expect(linuxIds).toContain('sforzando');
    expect(linuxIds).toContain('fsvr');
    expect(linuxIds).not.toContain('juicysfplugin');

    const winSurge = windows.find((item) => item.id === 'surge-xt');
    const linuxSurge = linux.find((item) => item.id === 'surge-xt');
    expect(winSurge?.url).toContain('win64');
    expect(linuxSurge).toMatchObject({
      kind: 'installer',
      url: expect.stringContaining('surge-xt-linux-x64'),
    });

    const linuxSforzando = linux.find((item) => item.id === 'sforzando');
    const winSforzando = windows.find((item) => item.id === 'sforzando');
    expect(linuxSforzando?.url).toContain('LINUX_plogue-sforzando');
    expect(winSforzando?.url).toContain('WIN_sforzando');

    const linuxTetra = linux.find((item) => item.id === 'tetraop');
    expect(linuxTetra?.url).toContain('tetraop-linux');
    expect(linuxTetra?.dataFolders?.[0].to).toContain('.config/TetraOP');

    const linuxCharlatan = linux.find((item) => item.id === 'charlatan3');
    expect(linuxCharlatan?.vst3Bundle).toEqual({
      source: 'Charlatan3.so',
      name: 'Charlatan3.vst3',
    });

    const linuxFs = linux.find((item) => item.id === 'fsvr');
    const winFs = windows.find((item) => item.id === 'fsvr');
    expect(linuxFs?.url).toContain('FSVR-Linux-VST3');
    expect(winFs?.url).toContain('FSVR-Windows-VST3');

    expect(linuxIds).toContain('setbfree');
    expect(winIds).not.toContain('setbfree');
  });
});

describe('instrumentos nativos no gerador', () => {
  it('monta DX10 e JX10 com id, programa, faixa e velocity', () => {
    const dx = nativeAssignmentFor(
      N('dx', -3, 12, 96, 'FM', 4, { velocityMin: 20, velocityMax: 100 }),
      'patch:layer:0',
      2
    );
    expect(dx).toMatchObject({
      pluginId: 'preseter.dx',
      path: 'preseter.dx',
      name: 'Preseter — FM',
      role: 'instrument',
      programIndex: 4,
      minNote: 12,
      maxNote: 96,
      velocityMin: 20,
      velocityMax: 100,
      mix: { volumeDb: -3, pan: 0, muted: false, solo: false },
    });

    const jx = nativeAssignmentFor(N('jx', 0, 0, 127, 'Pad', 27), 'patch:layer:1', 1);
    expect(jx).toMatchObject({
      pluginId: 'preseter.jx',
      path: 'preseter.jx',
      name: 'Preseter JX10',
      programIndex: 27,
      velocityMin: 1,
      velocityMax: 127,
    });
  });

  it('mantém o piano nativo como instrumento disponível, sem mexer no sampler', () => {
    const piano = nativeAssignmentFor(N('piano', 0, 0, 127, 'Piano'), 'patch:layer:0', 1);
    expect(piano?.pluginId).toBe('preseter.piano');
    expect(piano?.name).toBe('Preseter Piano');

    // Camada sem nativeInstrument e sem sample = plugin externo; não monta nativo.
    expect(nativeAssignmentFor({ inst: 'SURGE', db: 0, min: 0, max: 127, label: '' }, 'p', 1)).toBeNull();
  });
});

describe('efeitos nativos na coleção', () => {
  it('resolve o efeito por nome, nome Preseter ou key curta', () => {
    expect(findEffectPlugin(plugins, 'calfNXT Reverb')?.id).toBe('calf-reverb');
    expect(findEffectPlugin(plugins, 'Preseter Reverb')?.id).toBe('calf-reverb');
    expect(findEffectPlugin(plugins, 'reverb')?.id).toBe('calf-reverb');
    expect(findEffectPlugin(plugins, 'C:/plugins/calfnxt/calfNXTChorus.vst3')?.id).toBe('calf-chorus');
    expect(findEffectPlugin(plugins, 'nao-existe')).toBeUndefined();
  });

  it('resolve o LV2 do Guitarix pelo nome Preseter, pelo nome do scan e pela key do bundle', () => {
    const guitarix = [
      {
        id: 'LV2-GxAmplifier-X-x',
        name: 'GxAmplifier-X',
        isInstrument: false,
        path: 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX',
      },
      {
        id: 'LV2-GxTubeScreamer-x',
        name: 'GxTubeScreamer',
        isInstrument: false,
        path: 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim',
      },
    ];

    expect(findEffectPlugin(guitarix, 'Preseter Amp')?.name).toBe('GxAmplifier-X');
    expect(findEffectPlugin(guitarix, 'amp')?.name).toBe('GxAmplifier-X');
    expect(findEffectPlugin(guitarix, 'GxTubeScreamer')?.name).toBe('GxTubeScreamer');
    expect(findEffectPlugin(guitarix, 'gxts9')?.name).toBe('GxTubeScreamer');
  });

  it('gera layouts por instrumento nos patches', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file } = buildCollectionConcert(plugins, { soundsFolder: sounds });

      const organ = file.patches.find((patch) => patch.name === 'Hammond Jazz');
      const drawbars = organ?.layout.elements.filter((element) => element.type === 'drawbar') ?? [];
      expect(drawbars).toHaveLength(9);
      expect(drawbars.map((element) => element.parameterId)).toEqual(
        Array.from({ length: 9 }, (_, index) => String(index))
      );
      expect(organ?.layout.elements.find((element) => element.type === 'keyboard'))
        .toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });

      const grand = file.patches.find((patch) => patch.name === 'Concert Grand');
      expect(grand?.layout.elements.find((element) => element.type === 'keyboard'))
        .toMatchObject({ keyboardLow: 21, keyboardHigh: 108 });

      // P6: os 40 patches com ids únicos, sem sobreposição e com parâmetros reais.
      expect(file.patches).toHaveLength(40);
      for (const patch of file.patches) {
        const elements = patch.layout.elements;
        const ids = elements.map((element) => element.id);
        expect(new Set(ids).size, `${patch.name}: ids repetidos`).toBe(ids.length);

        for (let i = 0; i < elements.length; i += 1) {
          for (let j = i + 1; j < elements.length; j += 1) {
            const a = elements[i];
            const b = elements[j];
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width
              && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(overlap, `${patch.name}: ${a.id} sobrepõe ${b.id}`).toBe(false);
          }
        }

        for (const element of elements) {
          if (!element.paramOwner) continue;
          expect(element.parameterId, `${patch.name}: ${element.label} sem parameterId`)
            .toBeTruthy();
        }

        if (patch.setId === organ?.setId) {
          expect(elements.filter((element) => element.type === 'drawbar')).toHaveLength(9);
        }
        expect(elements.some((element) => element.type === 'midi-activity')).toBe(true);
      }

      // Controles de efeito apontam para índices que existem no catálogo.
      const ambient = file.patches.find((patch) => patch.name === 'Ambient Texture');
      const stereo = ambient?.plugins?.[0]?.inserts?.find((insert) => insert.slot === 1);
      const stereoControls = ambient?.layout.elements.filter(
        (element) => element.paramSlot === 1 && element.paramOwner === ambient.plugins?.[0]?.layerId
      ) ?? [];
      expect(stereo).toBeDefined();
      expect(stereoControls.length).toBeGreaterThan(0);
      const stereoDefinition = findEffect(stereo?.path ?? '');
      expect(stereoDefinition).toBeDefined();
      const indexes = new Set(stereoDefinition?.params.map((param) => String(param.index)));
      expect(stereoControls.every((element) => indexes.has(element.parameterId ?? ''))).toBe(true);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('reconhece a família de cada patch e escolhe a zona certa', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file } = buildCollectionConcert(plugins, { soundsFolder: sounds });
      const keyboardOf = (name: string) => file.patches
        .find((patch) => patch.name === name)
        ?.layout.elements.find((element) => element.type === 'keyboard');
      const paramsOf = (name: string) => {
        const patch = file.patches.find((item) => item.name === name);
        const layerId = patch?.plugins?.[0]?.layerId;
        return patch?.layout.elements
          .filter((element) => element.paramOwner === layerId && element.paramSlot === undefined)
          .map((element) => element.parameterId) ?? [];
      };

      // Clavinet é sampler, não piano de 88 teclas.
      expect(keyboardOf('Clavinet Funk')).toMatchObject({ keyboardLow: 36, keyboardHigh: 96 });
      expect(paramsOf('Clavinet Funk')).toEqual(['0', '3', '4', '6']);
      expect(paramsOf('String Ensemble')).toEqual(['0', '3', '4', '6']);
      expect(paramsOf('Precision Bass')).toEqual(['0', '3', '4']);
      expect(keyboardOf('Precision Bass')).toMatchObject({ keyboardLow: 28, keyboardHigh: 67 });
      expect(keyboardOf('Acoustic Guitar Nylon')).toMatchObject({ keyboardLow: 40, keyboardHigh: 88 });

      // JX10: controles do sintetizador; Synth Bass também é JX, com teclado de baixo.
      expect(paramsOf('Analog Poly Synth')).toEqual(['0', '6', '7', '11', '14', '20']);
      expect(paramsOf('Synth Bass')).toEqual(['0', '6', '7', '11', '14', '20']);
      expect(keyboardOf('Synth Bass')).toMatchObject({ keyboardLow: 28, keyboardHigh: 67 });
      expect(paramsOf('Arpeggiator')).toEqual([
        '0', '6', '7', '11', '14', '20', '31', '32', '33', '34',
      ]);

      // Drums nativo não expõe parâmetros: sobra só o efeito do insert.
      expect(paramsOf('Electronic Drum Kit')).toEqual([]);
      expect(file.patches.find((patch) => patch.name === 'Electronic Drum Kit')
        ?.layout.elements.filter((element) => element.paramOwner).length).toBeGreaterThan(0);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('gera os inserts do strip e os sends do patch', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file, missing } = buildCollectionConcert(plugins, { soundsFolder: sounds });
      const rhodes = file.patches.find((patch) => patch.name === 'Rhodes Classic');

      expect(rhodes?.plugins?.[0]?.inserts?.map((insert) => insert.pluginId)).toEqual([
        'calf-chorus',
        'calf-phaser',
      ]);
      expect(rhodes?.plugins?.[0]?.inserts?.map((insert) => insert.slot)).toEqual([0, 1]);
      expect(rhodes?.plugins?.[0]?.inserts?.every((insert) => insert.bypass === false)).toBe(true);
      expect(rhodes?.master?.sends).toEqual([-16, -22, -60, -60]);
      expect(missing).toEqual([]);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('registra em missing e não quebra o patch quando o efeito falta', () => {
    const sounds = makeSoundsFolder();
    try {
      const semEfeitos = plugins.filter((plugin) => !plugin.name.startsWith('calfNXT'));
      const { file, missing } = buildCollectionConcert(semEfeitos, { soundsFolder: sounds });
      const rhodes = file.patches.find((patch) => patch.name === 'Rhodes Classic');

      expect(rhodes).toBeDefined();
      expect(rhodes?.plugins?.[0]?.inserts).toBeUndefined();
      // O send continua, pois é nível do bus e não depende do plugin.
      expect(rhodes?.master?.sends).toEqual([-16, -22, -60, -60]);
      expect(missing).toEqual(expect.arrayContaining(['calfNXT Chorus', 'calfNXT Phaser']));
    } finally {
      removeTempDir(sounds);
    }
  });

  it('habilita Aux 1 Reverb e Aux 2 Delay no concert gerado', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file } = buildCollectionConcert(plugins, { soundsFolder: sounds });
      const aux = file.concert.settings.buses.aux;

      expect(aux[0]).toMatchObject({ enabled: true, output: 1, volumeDb: 0 });
      expect(aux[0].inserts.map((insert) => insert.pluginId)).toEqual(['calf-reverb']);
      expect(aux[1]).toMatchObject({ enabled: true, output: 1 });
      expect(aux[1].inserts.map((insert) => insert.pluginId)).toEqual(['calf-delay']);
      expect(aux[2].enabled).toBe(false);
      expect(aux[3].enabled).toBe(false);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('deixa os Aux desabilitados quando os efeitos não estão no scan', () => {
    const sounds = makeSoundsFolder();
    try {
      const semEfeitos = plugins.filter((plugin) => !plugin.name.startsWith('calfNXT'));
      const { file, missing } = buildCollectionConcert(semEfeitos, { soundsFolder: sounds });
      const aux = file.concert.settings.buses.aux;

      expect(aux[0].enabled).toBe(false);
      expect(aux[1].enabled).toBe(false);
      expect(missing).toEqual(expect.arrayContaining(['calfNXT Reverb', 'calfNXT Delay']));
    } finally {
      removeTempDir(sounds);
    }
  });

  it('grava presetId nos inserts e auxPresets no patch', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file } = buildCollectionConcert(plugins, { soundsFolder: sounds });

      const rhodes = file.patches.find((patch) => patch.name === 'Rhodes Classic');
      expect(rhodes?.plugins?.[0]?.inserts?.map((insert) => insert.presetId)).toEqual([
        'subtle',
        'slow',
      ]);
      expect(rhodes?.auxPresets).toEqual({ 1: 'plate', 2: 'echo' });

      const modern = file.patches.find((patch) => patch.name === 'Modern Synth Lead');
      expect(modern?.plugins?.[0]?.inserts?.[0]).toMatchObject({
        name: 'calfNXT Stereo',
        presetId: 'wide',
      });
      expect(modern?.auxPresets).toEqual({ 1: 'plate', 2: 'pingpong' });

      const deep = file.patches.find((patch) => patch.name === 'Deep Synth Bass');
      expect(deep?.plugins?.[0]?.inserts?.map((insert) => insert.name)).toEqual(['calfNXT Harmonics']);
      expect(deep?.master?.sends).toBeUndefined();
    } finally {
      removeTempDir(sounds);
    }
  });

  it('resolveEffectInserts respeita o limite de 4 slots', () => {
    const missing = new Set<string>();
    const inserts = resolveEffectInserts(
      plugins,
      ['Chorus', 'Phaser', 'Reverb', 'Delay', 'Chorus'],
      missing
    );
    expect(inserts.map((insert) => insert.slot)).toEqual([0, 1, 2, 3]);
    expect(inserts).toHaveLength(4);
    expect(missing.size).toBe(0);
  });
});

describe('buildCollectionConcert', () => {
  it('creates the 8 sets and 40 patches in order', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file, skipped, missing } = buildCollectionConcert(plugins, { tempo: 100, soundsFolder: sounds });
      expect(file.sets.map((set) => set.name)).toEqual([
        'Pianos & Keys',
        'Organs',
        'Strings',
        'Brass',
        'Woodwinds',
        'Guitars & Bass',
        'Drums & Percussion',
        'Synthesizers',
      ]);
      expect(file.patches).toHaveLength(40);
      expect(file.patches.map((patch) => patch.programNumber)).toEqual(
        Array.from({ length: 40 }, (_, index) => index)
      );
      expect(skipped).toEqual([]);
      expect(missing).toEqual([]);
      expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
      expect(file.layout.elements.filter((element) => element.patchSendAux !== undefined)).toHaveLength(4);
      expect(file.layout.elements.filter((element) => element.type === 'pedal')).toHaveLength(2);
      expect(file.patches.every((patch) => patch.icon)).toBe(true);
      expect(file.patches.find((patch) => patch.name === 'Warm Analog Pad')?.icon).toBe('pad');
      expect(
        file.patches.find((patch) => patch.name === 'Synth Bass')?.plugins?.[0]?.pluginId
      ).toBe('preseter.jx');
      expect(
        file.patches.flatMap((patch) => patch.plugins ?? []).every((layer) => typeof layer.mix?.volumeDb === 'number')
      ).toBe(true);
      expect(
        file.patches.find((patch) => patch.name === 'Concert Grand')?.plugins?.[0]
      ).toMatchObject({ sourceKind: 'sampler', pluginId: 'preseter.sampler' });
    } finally {
      removeTempDir(sounds);
    }
  });

  it('gera os 40 patches sem depender de plugins externos de instrumento', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file, skipped } = buildCollectionConcert(
        plugins.filter((plugin) => plugin.isInstrument !== true),
        { tempo: 100, soundsFolder: sounds }
      );
      expect(file.patches).toHaveLength(40);
      expect(skipped).toEqual([]);
      expect(
        file.patches.find((patch) => patch.name === 'Vintage Analog Lead')?.plugins?.[0]
      ).toMatchObject({ pluginId: 'preseter.jx', path: 'preseter.jx' });
    } finally {
      removeTempDir(sounds);
    }
  });

  it('aponta cada timbre sampleado para a biblioteca e o programa certos', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file } = buildCollectionConcert(plugins, { soundsFolder: sounds });

      const piano = file.patches.find((patch) => patch.name === 'Concert Grand');
      expect(piano?.plugins?.[0]).toMatchObject({
        sourceKind: 'sampler',
        samplePath: 'Salamander/SalamanderGrandPiano-master/Salamander Grand Piano V3.sfz',
        programIndex: 0,
      });
      expect(piano?.plugins?.[0]?.sampler?.loop).toBe(false);

      const electric = file.patches.find((patch) => patch.name === 'Rhodes Classic');
      expect(electric?.plugins?.[0]).toMatchObject({
        pluginId: 'preseter.tines',
        path: 'preseter.tines',
        programIndex: 0,
      });

      const wurlitzer = file.patches.find((patch) => patch.name === 'Wurlitzer EP');
      expect(wurlitzer?.plugins?.[0]).toMatchObject({
        pluginId: 'preseter.reeds',
        path: 'preseter.reeds',
      });

      const organ = file.patches.find((patch) => patch.name === 'Hammond Gospel');
      expect(organ?.plugins?.[0]).toMatchObject({
        pluginId: 'preseter.organ',
        path: 'preseter.organ',
        programIndex: 1,
      });

      const strings = file.patches.find((patch) => patch.name === 'String Ensemble');
      expect(strings?.plugins).toHaveLength(4);
      expect(strings?.plugins?.[0]).toMatchObject({
        samplePath: 'Sonatina/Sonatina_Symphonic_Orchestra.sf2',
        programIndex: 2,
      });

      const drum = file.patches.find((patch) => patch.name === 'Acoustic Rock Kit');
      expect(drum?.midiChannel).toBe(0);
      expect(drum?.plugins?.[0]).toMatchObject({ programIndex: 0, bank: 128 });
      expect(Object.keys(drum?.vstStates ?? {})).toHaveLength(0);

      // D9: o kit eletrônico usa o instrumento nativo, com padrão e programa 24.
      const electronic = file.patches.find((patch) => patch.name === 'Electronic Drum Kit');
      expect(electronic?.plugins?.[0]).toMatchObject({
        pluginId: 'preseter.drums',
        programIndex: 0,
        drums: {
          enabled: true,
          startWithPatch: true,
          patternId: 'electro',
          kitProgram: 24,
        },
      });
      expect(Object.keys(electronic?.vstStates ?? {})).toHaveLength(0);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('skips patches when a required instrument is missing', () => {
    const { file, skipped, missing } = buildCollectionConcert(
      [{ id: 'sforzando', name: 'Sforzando', isInstrument: true }],
      { tempo: 100 }
    );
    expect(file.patches.length).toBeLessThan(40);
    expect(skipped.length).toBeGreaterThan(0);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('analisa a prontidão dos 40 timbres', () => {
    const sounds = makeSoundsFolder();
    try {
      const ready = analyzeCollectionConcert(plugins, { tempo: 100, soundsFolder: sounds });
      expect(ready.total).toBe(40);
      expect(ready.ready).toBe(40);
      expect(ready.blocked).toBe(0);
      expect(ready.readyToGenerate).toBe(true);

      const blocked = analyzeCollectionConcert(
        [{ id: 'sforzando', name: 'Sforzando', isInstrument: true }],
        { tempo: 100 }
      );
      expect(blocked.readyToGenerate).toBe(false);
      expect(blocked.blocked).toBeGreaterThan(0);
      expect(blocked.missing.length).toBeGreaterThan(0);
    } finally {
      removeTempDir(sounds);
    }
  });
});
