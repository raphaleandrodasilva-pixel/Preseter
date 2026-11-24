import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { COLLECTION_SETS } from '../../shared/collection-presets';
import {
  LIBRARY_FORMAT,
  concertToCollectionSets,
  isSafeRelativePath,
  parseLibraryFile,
  safeFileName,
  type LibraryFile,
} from '../../shared/library/format';
import { EFFECTS as CATALOG_EFFECTS, findEffect } from '../../shared/effects/catalog';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';
import { parseConcertFile } from '../concert/ConcertFile';
import { buildCollectionConcert, findEffectPlugin } from '../collection/generateCollection';
import {
  describeMissing,
  generateLibrary,
  inspectLibrary,
  installedPlugins,
  listLibraries,
  needsBundledEffectsScan,
  readLibraryFile,
} from './LibraryService';

const ROOT = path.resolve('libraries');
const load = (id: string): LibraryFile => readLibraryFile(path.join(ROOT, id, 'biblioteca.json'));

const EFFECTS = [
  'Chorus', 'Phaser', 'Reverb', 'Delay', 'Equalizer', 'Compressor', 'Pulsator', 'Filter',
  'Stereo', 'Harmonics', 'Transients', 'Flanger', 'Crusher', 'Ringmodulator',
];
const plugins = [
  ...EFFECTS.map((name) => ({
    id: `calf-${name.toLowerCase()}`,
    name: `calfNXT ${name}`,
    path: `C:/plugins/calfnxt/calfNXT${name}.vst3`,
    isInstrument: false,
  })),
  { id: 'gx-amp', name: 'GxAmplifier-X', path: 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX', isInstrument: false },
  { id: 'gx-ts9', name: 'GxTubeScreamer', path: 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim', isInstrument: false },
];

function makeSounds (): string {
  const sounds = makeTempDir();
  for (const file of [
    'MuseScore_General/MuseScore_General.sf2',
    'Sonatina/Sonatina_Symphonic_Orchestra.sf2',
    'Salamander/SalamanderGrandPiano-master/Salamander Grand Piano V3.sfz',
  ]) {
    fs.mkdirSync(path.dirname(path.join(sounds, file)), { recursive: true });
    fs.writeFileSync(path.join(sounds, file), 'fake');
  }
  return sounds;
}

const minimal = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: LIBRARY_FORMAT,
  version: 1,
  id: 'teste',
  name: 'Teste',
  concerts: [{
    id: 'c1',
    name: 'Concert 1',
    sets: [{
      name: 'Set',
      patches: [{
        name: 'Patch',
        programNumber: 0,
        layers: [{ inst: 'NATIVE', db: -3, min: 0, max: 127, label: 'A', nativeInstrument: 'jx', programIndex: 1 }],
        ...patch,
      }],
    }],
  }],
});

describe('bibliotecas do Preseter', () => {
  it('lista só a Factory 64, válida', () => {
    const list = listLibraries(ROOT);
    expect(list.map((item) => item.id)).toEqual(['factory-64']);
    expect(list[0].error).toBeFalsy();
    expect(list[0].patches).toBe(64);
  });

  it('a Factory 64 tem 8 sets de 8, Program Change de 0 a 63 e nomes únicos', () => {
    const concert = load('factory-64').concerts[0];
    expect(concert.sets).toHaveLength(8);
    expect(concert.sets.every((set) => set.patches.length === 8)).toBe(true);
    const patches = concert.sets.flatMap((set) => set.patches);
    expect(patches.map((patch) => patch.programNumber)).toEqual(Array.from({ length: 64 }, (_, index) => index));
    expect(new Set(patches.map((patch) => patch.name)).size).toBe(64);
    // Os 40 timbres originais continuam com o mesmo nome.
    const names = new Set(patches.map((patch) => patch.name));
    for (const [, original] of COLLECTION_SETS) {
      for (const [name] of original) expect(names.has(name), name).toBe(true);
    }
  });

  it('a Factory 64 usa o Preseter Drums nas baterias e índices válidos do Zyn', () => {
    const patches = load('factory-64').concerts[0].sets.flatMap((set) => set.patches);
    const drums = patches.filter((patch) => patch.layers.some((layer) => layer.nativeInstrument === 'drums'));
    expect(drums.map((patch) => patch.name)).toEqual(['Acoustic Rock Kit', 'Electronic Drum Kit', 'Orchestral Percussion']);
    expect(drums.every((patch) => patch.layers[0].drums?.enabled)).toBe(true);
    const zyn = patches.flatMap((patch) => patch.layers).filter((layer) => layer.nativeInstrument === 'zyn');
    expect(zyn.length).toBeGreaterThan(0);
    for (const layer of zyn) expect(layer.programIndex).toBeLessThan(1318);
  });

  it('mantém as regras de áudio na Factory 64', () => {
    for (const concert of load('factory-64').concerts) {
      for (const patch of concert.sets.flatMap((set) => set.patches)) {
        if (patch.layers.length > 1) expect(patch.inserts ?? [], patch.name).toEqual([]);
        const chain = [...(patch.inserts ?? []), ...(patch.master ?? [])];
        if (patch.layers.some((layer) => layer.nativeInstrument === 'organ')) {
          expect(chain.some((ref) => findEffect(ref.effect)?.source === 'guitarix'), patch.name).toBe(false);
        }
      }
    }
  });

  it('a Factory 64 monta os 64 patches com os efeitos e sends pedidos', () => {
    const sounds = makeSounds();
    try {
      const library = load('factory-64');
      const result = buildCollectionConcert(plugins, {
        tempo: 100,
        soundsFolder: sounds,
        sets: concertToCollectionSets(library.concerts[0]),
      });
      expect(result.skipped).toEqual([]);
      expect(result.missing).toEqual([]);
      expect(result.file.patches).toHaveLength(64);
      const grand = result.file.patches.find((patch) => patch.name === 'Concert Grand');
      expect(grand?.plugins?.[0].inserts?.length).toBeGreaterThan(0);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('gera os concerts sem sobrescrever os existentes', () => {
    const sounds = makeSounds();
    const output = makeTempDir();
    try {
      const library = load('factory-64');
      const environment = { plugins, soundsFolder: sounds };
      expect(inspectLibrary(library, 'factory-64', environment)).toMatchObject({ total: 64, ready: 64, missing: [] });

      const first = generateLibrary(library, environment, output);
      expect(first.patches).toBe(64);
      expect(first.concerts).toHaveLength(1);
      expect(parseConcertFile(fs.readFileSync(first.concerts[0].path, 'utf8')).patches).toHaveLength(64);

      const original = fs.readFileSync(first.concerts[0].path, 'utf8');
      const second = generateLibrary(library, environment, output);
      expect(second.concerts[0].path).not.toBe(first.concerts[0].path);
      expect(fs.readFileSync(first.concerts[0].path, 'utf8')).toBe(original);
      expect(fs.readdirSync(first.folder).some((file) => file.endsWith('.tmp'))).toBe(false);
    } finally {
      removeTempDir(sounds);
      removeTempDir(output);
    }
  }, 30_000);

  it('informa o que falta e pula só o que depende disso', () => {
    const empty = makeTempDir();
    try {
      const status = inspectLibrary(load('factory-64'), 'factory-64', { plugins, soundsFolder: empty });
      expect(status.ready).toBeGreaterThan(0);
      expect(status.ready).toBeLessThan(64);
      expect(status.skipped).toHaveLength(64 - status.ready);
      expect(status.missing).toEqual(expect.arrayContaining(['Salamander Grand Piano V3']));
    } finally {
      removeTempDir(empty);
    }
  });

  it('aceita biblioteca nova com samples próprios', () => {
    const sounds = makeTempDir();
    const output = makeTempDir();
    try {
      fs.mkdirSync(path.join(sounds, 'Minha'));
      fs.writeFileSync(path.join(sounds, 'Minha', 'piano.sf2'), 'fake');
      const library = parseLibraryFile(JSON.stringify({
        ...minimal({
          layers: [{ inst: 'NATIVE', db: -3, min: 0, max: 127, label: 'P', sample: { library: 'minha', program: 0 } }],
        }),
        sampleLibraries: { minha: { path: 'Minha/piano.sf2', name: 'Minha Biblioteca' } },
      }));
      const result = generateLibrary(library, { plugins, soundsFolder: sounds }, output);
      expect(result.patches).toBe(1);
      const concert = parseConcertFile(fs.readFileSync(result.concerts[0].path, 'utf8'));
      expect(concert.patches[0].plugins?.[0].samplePath).toBe('Minha/piano.sf2');
    } finally {
      removeTempDir(sounds);
      removeTempDir(output);
    }
  });

  it('mostra efeito ausente com o nome Preseter e não o manda para a Loja', () => {
    const { missing, downloadable } = describeMissing(['calfNXT Reverb', 'Preseter Reverb', 'Salamander Grand Piano V3']);
    expect(missing).toEqual([findEffect('calfNXT Reverb')?.displayName, 'Salamander Grand Piano V3']);
    expect(missing.join(' ')).not.toMatch(/calf/i);
    expect(downloadable).toEqual(['Salamander Grand Piano V3']);
  });

  it('detecta quando o cache não tem os efeitos que acompanham o app', () => {
    const onlyGuitarix = plugins.filter((plugin) => plugin.id.startsWith('gx-'));
    expect(needsBundledEffectsScan(onlyGuitarix)).toBe(true);
    expect(needsBundledEffectsScan([])).toBe(true);

    const all = CATALOG_EFFECTS.map((effect) => ({
      id: effect.id,
      name: effect.displayName,
      path: effect.source === 'guitarix'
        ? `http://guitarix.sourceforge.net/plugins/${effect.bundle.replace(/\.lv2$/, '')}#x`
        : `D:/Programas/Preseter/plugins/${effect.bundle}`,
      isInstrument: false,
    }));
    expect(needsBundledEffectsScan(all)).toBe(false);
  });

  it('mostra os efeitos que faltam com o nome Preseter e não tenta baixá-los', () => {
    const sounds = makeSounds();
    try {
      const withoutEffects = plugins.filter((plugin) => !plugin.name.startsWith('calfNXT'));
      const askedToDownload: string[] = [];
      const status = inspectLibrary(load('factory-64'), 'factory-64', { plugins: withoutEffects, soundsFolder: sounds }, (labels) => {
        askedToDownload.push(...labels);
        return [];
      });
      expect(status.missing).toEqual(expect.arrayContaining(['Preseter Reverb', 'Preseter Delay']));
      expect(status.missing.join(' ')).not.toMatch(/calf/i);
      expect(askedToDownload).toEqual([]);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('encontra todos os efeitos pelo nome Preseter', () => {
    const scanned = CATALOG_EFFECTS.map((effect) => ({
      id: effect.id,
      name: effect.source === 'guitarix' ? effect.pluginNames?.[0] ?? effect.displayName : `calfNXT ${effect.match}`,
      path: effect.source === 'guitarix'
        ? `http://guitarix.sourceforge.net/plugins/${effect.bundle.replace(/\.lv2$/, '')}#x`
        : `D:/Programas/Preseter/plugins/${effect.bundle}`,
      isInstrument: false,
    }));
    for (const effect of CATALOG_EFFECTS) {
      expect(findEffectPlugin(scanned, effect.displayName)?.id, effect.displayName).toBe(effect.id);
    }
    expect(needsBundledEffectsScan(scanned)).toBe(false);
  });

  it('ignora plugin do cache cujo arquivo foi apagado', () => {
    const folder = makeTempDir();
    try {
      const existing = path.join(folder, 'Existe.vst3');
      fs.writeFileSync(existing, 'fake');
      const list = [
        { id: 'a', name: 'Existe', path: existing },
        { id: 'b', name: 'Apagado', path: path.join(folder, 'Apagado.vst3') },
        { id: 'c', name: 'LV2', path: 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX' },
      ];
      expect(installedPlugins(list).map((plugin) => plugin.id)).toEqual(['a', 'c']);
    } finally {
      removeTempDir(folder);
    }
  });

  it('recusa arquivos inválidos com a causa do erro', () => {
    expect(() => parseLibraryFile('não é json')).toThrow(/JSON/);
    expect(() => parseLibraryFile('{"format":"outro"}')).toThrow(/não é uma biblioteca/);
    expect(() => parseLibraryFile(JSON.stringify({ ...minimal(), version: 99 }))).toThrow(/atualize/);
    expect(() => parseLibraryFile(JSON.stringify(minimal({ programNumber: 200 })))).toThrow(/programNumber/);
    expect(() => parseLibraryFile(JSON.stringify(minimal({ inserts: [{ effect: 'Inexistente' }] })))).toThrow(/não existe/);
    expect(() => parseLibraryFile(JSON.stringify(minimal({ inserts: [{ effect: 'calfNXT Reverb', preset: 'nada' }] })))).toThrow(/preset/);
    expect(() => parseLibraryFile(JSON.stringify(minimal({
      layers: [{ inst: 'NATIVE', db: 0, min: 0, max: 127, label: 'x', sample: { library: 'nao-declarada' } }],
    })))).toThrow(/não declarada/);
  });

  it('não deixa a biblioteca apontar para fora da pasta de sons', () => {
    for (const bad of ['../fora.sf2', 'a/../../fora.sf2', 'C:\\Windows\\x.sf2', '/etc/x.sf2', '']) {
      expect(isSafeRelativePath(bad), bad).toBe(false);
    }
    expect(isSafeRelativePath('Minha/piano.sf2')).toBe(true);
    expect(() => parseLibraryFile(JSON.stringify({
      ...minimal(),
      sampleLibraries: { ruim: { path: '../../fora.sf2', name: 'Ruim' } },
    }))).toThrow(/relativo/);
  });

  it('gera nomes de arquivo seguros', () => {
    expect(safeFileName('A/B:C*')).toBe('A B C');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('...')).toBe('Biblioteca');
  });
});
