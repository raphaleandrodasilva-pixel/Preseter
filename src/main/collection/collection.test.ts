import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCollectionConcert, analyzeCollectionConcert } from './generateCollection';
import { COLLECTION_CATALOG, resolveCollectionItems } from '../../shared/collection';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

const plugins = [
  { id: 'sforzando', name: 'Sforzando', isInstrument: true },
  { id: 'fsvr', name: 'FSVR', isInstrument: true },
  { id: 'surge', name: 'Surge XT', isInstrument: true },
  { id: 'dexed', name: 'Dexed', isInstrument: true },
  { id: 'helm', name: 'Helm', isInstrument: true },
  { id: 'odin', name: 'Odin 2', isInstrument: true },
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
      ).toBe('surge');
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

  it('uses fallbacks when an optional instrument is missing', () => {
    const sounds = makeSoundsFolder();
    try {
      const { file, skipped } = buildCollectionConcert(
        plugins.filter((plugin) => plugin.id !== 'odin' && plugin.id !== 'helm'),
        { tempo: 100, soundsFolder: sounds }
      );
      expect(file.patches).toHaveLength(40);
      expect(skipped).toEqual([]);
      expect(file.patches.find((patch) => patch.name === 'Vintage Analog Lead')?.plugins?.[0]?.name).toMatch(/Surge/i);
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
        samplePath: 'MuseScore_General/MuseScore_General.sf2',
        programIndex: 4,
        bank: 0,
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
