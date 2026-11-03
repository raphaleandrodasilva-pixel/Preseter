import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCollectionConcert } from './generateCollection';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

const plugins = [
  { id: 'juicy', name: 'juicysfplugin', isInstrument: true },
  { id: 'surge', name: 'Surge XT', isInstrument: true },
  { id: 'dexed', name: 'Dexed', isInstrument: true },
  { id: 'helm', name: 'Helm', isInstrument: true },
  { id: 'odin', name: 'Odin 2', isInstrument: true },
];

describe('buildCollectionConcert', () => {
  it('creates the 8 sets and 40 patches in order', () => {
    const { file, skipped, missing } = buildCollectionConcert(plugins, { tempo: 100 });
    expect(file.sets.map((set) => set.name)).toEqual([
      'Pianos',
      'Teclas elétricas',
      'Órgãos',
      'Cordas e orquestra',
      'Pads',
      'Leads e sintetizadores',
      'Baixos',
      'Layers e splits',
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
    expect(file.patches.find((patch) => patch.name === 'Pad Ambiente')?.icon).toBe('pad');
    expect(
      file.patches.flatMap((patch) => patch.plugins ?? []).every((layer) => layer.mix?.volumeDb === 0)
    ).toBe(true);
  });

  it('uses fallbacks when an optional instrument is missing', () => {
    const { file, skipped } = buildCollectionConcert(
      plugins.filter((plugin) => plugin.id !== 'odin' && plugin.id !== 'helm'),
      { tempo: 100 }
    );
    expect(file.patches).toHaveLength(40);
    expect(skipped).toEqual([]);
    expect(file.patches.find((patch) => patch.name === 'Pad Ambiente')?.plugins?.[0]?.name).toMatch(/Surge/i);
  });

  it('anexa programa e SoundFont nos layers da coleção', () => {
    const sounds = makeTempDir();
    try {
      fs.mkdirSync(path.join(sounds, 'MuseScore_General'), { recursive: true });
      fs.writeFileSync(path.join(sounds, 'MuseScore_General', 'MuseScore_General.sf2'), 'fake');
      const allPlugins = [
        ...plugins,
        { id: 'mda-ep', name: 'mdaEPiano', isInstrument: true },
        { id: 'mda-jx', name: 'mdaJX10', isInstrument: true },
      ];
      const { file } = buildCollectionConcert(allPlugins, { soundsFolder: sounds });
      const piano = file.patches.find((patch) => patch.name === 'Piano de Cauda');
      expect(piano?.plugins?.[0]).toMatchObject({
        programIndex: 0,
        samplePath: path.join('MuseScore_General', 'MuseScore_General.sf2'),
      });
      const electric = file.patches.find((patch) => patch.name === 'Elétrico Clássico');
      expect(electric?.plugins?.[0].programIndex).toBe(1);
      expect(electric?.plugins?.[0].samplePath).toBeUndefined();
    } finally {
      removeTempDir(sounds);
    }
  });

  it('skips patches when a required instrument is missing', () => {    const { file, skipped, missing } = buildCollectionConcert(
      [{ id: 'juicy', name: 'juicysfplugin', isInstrument: true }],
      { tempo: 100 }
    );
    expect(file.patches.length).toBeLessThan(40);
    expect(skipped.length).toBeGreaterThan(0);
    expect(missing).toContain('Dexed');
  });
});
