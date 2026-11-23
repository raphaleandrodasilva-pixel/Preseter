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

/** Remove ids e horários, que mudam a cada geração. */
const stable = (file: ReturnType<typeof buildCollectionConcert>['file']) => JSON.parse(
  JSON.stringify({ sets: file.sets, patches: file.patches })
    .replace(/"(id|setId)":"(set|preset)_[^"]+"/g, '"$1":"x"')
    .replace(/"(createdAt|updatedAt)":\d+/g, '"$1":0')
    .replace(/element_default_([a-z0-9]+)_[a-z0-9]+_[a-z0-9]+/g, 'element_default_$1')
);

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
  it('lista as bibliotecas prontas, todas válidas', () => {
    const list = listLibraries(ROOT);
    expect(list.map((item) => item.id).sort()).toEqual(['factory-40', 'factory-40-efeitos', 'workstation']);
    expect(list.every((item) => !item.error)).toBe(true);
    expect(list.find((item) => item.id === 'factory-40')?.patches).toBe(40);
    expect(list.find((item) => item.id === 'factory-40-efeitos')?.patches).toBe(40);
    expect(list.find((item) => item.id === 'workstation')?.patches).toBe(896);
  });

  it('a Factory 40 pelo arquivo gera o mesmo concert do gerador atual', () => {
    const sounds = makeSounds();
    try {
      const library = load('factory-40');
      const fromFile = buildCollectionConcert(plugins, {
        tempo: 100,
        soundsFolder: sounds,
        sets: concertToCollectionSets(library.concerts[0]),
      });
      const current = buildCollectionConcert(plugins, { tempo: 100, soundsFolder: sounds });
      expect(fromFile.skipped).toEqual(current.skipped);
      expect(fromFile.missing).toEqual(current.missing);
      expect(stable(fromFile.file)).toEqual(stable(current.file));
      expect(COLLECTION_SETS.flatMap(([, patches]) => patches)).toHaveLength(40);
    } finally {
      removeTempDir(sounds);
    }
  });

  it('a Workstation tem 128 Performances com várias camadas e nomes únicos', () => {
    const performances = load('workstation').concerts.find((concert) => concert.id === 'performances');
    const patches = performances?.sets.flatMap((set) => set.patches) ?? [];
    expect(patches).toHaveLength(128);
    expect(new Set(patches.map((patch) => patch.name)).size).toBe(128);
    expect(patches.map((patch) => patch.programNumber)).toEqual(Array.from({ length: 128 }, (_, index) => index));
    for (const patch of patches) {
      expect(patch.layers.length, patch.name).toBeGreaterThan(1);
      expect(patch.name).not.toMatch(/yamaha|motif/i);
    }
  });

  it('a Workstation tem 6 bancos com Program Change de 0 a 127, sem repetir receita', () => {
    const library = load('workstation');
    const banks = library.concerts.filter((concert) => concert.id !== 'performances');
    expect(banks.map((concert) => concert.name)).toEqual(
      ['PRE1', 'PRE2', 'PRE3', 'PRE4', 'PRE5', 'PRE6'].map((bank) => `Workstation ${bank}`)
    );
    const signatures = new Set<string>();
    for (const concert of banks) {
      const patches = concert.sets.flatMap((set) => set.patches);
      expect(patches.map((patch) => patch.programNumber).sort((a, b) => a - b))
        .toEqual(Array.from({ length: 128 }, (_, index) => index));
      for (const { name: _name, programNumber: _program, description: _description, ...recipe } of patches) {
        signatures.add(JSON.stringify(recipe));
        expect(_name).not.toMatch(/yamaha|motif/i);
      }
    }
    expect(signatures.size).toBe(768);
  });

  it('mantém as regras de áudio nas bibliotecas', () => {
    for (const id of ['factory-40-efeitos', 'workstation']) {
      for (const concert of load(id).concerts) {
        for (const patch of concert.sets.flatMap((set) => set.patches)) {
          if (patch.layers.length > 1) expect(patch.inserts ?? [], patch.name).toEqual([]);
          const chain = [...(patch.inserts ?? []), ...(patch.master ?? [])];
          if (patch.layers.some((layer) => layer.nativeInstrument === 'organ')) {
            expect(chain.some((ref) => findEffect(ref.effect)?.source === 'guitarix'), patch.name).toBe(false);
          }
        }
      }
    }
  });

  it('gera os concerts sem sobrescrever os existentes', () => {
    const sounds = makeSounds();
    const output = makeTempDir();
    try {
      const library = load('workstation');
      const environment = { plugins, soundsFolder: sounds };
      expect(inspectLibrary(library, 'workstation', environment)).toMatchObject({ total: 896, ready: 896, missing: [] });

      const first = generateLibrary(library, environment, output);
      expect(first.patches).toBe(896);
      expect(first.concerts).toHaveLength(7);
      for (const concert of first.concerts) {
        expect(parseConcertFile(fs.readFileSync(concert.path, 'utf8')).patches).toHaveLength(128);
      }

      const original = fs.readFileSync(first.concerts[0].path, 'utf8');
      const second = generateLibrary(library, environment, output);
      expect(second.concerts[0].path).not.toBe(first.concerts[0].path);
      expect(fs.readFileSync(first.concerts[0].path, 'utf8')).toBe(original);
      expect(fs.readdirSync(first.folder).some((file) => file.endsWith('.tmp'))).toBe(false);
    } finally {
      removeTempDir(sounds);
      removeTempDir(output);
    }
  });

  it('informa o que falta e pula só o que depende disso', () => {
    const empty = makeTempDir();
    try {
      const status = inspectLibrary(load('factory-40'), 'factory-40', { plugins, soundsFolder: empty });
      expect(status.ready).toBeGreaterThan(0);
      expect(status.ready).toBeLessThan(40);
      expect(status.skipped).toHaveLength(40 - status.ready);
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
      const status = inspectLibrary(load('factory-40'), 'factory-40', { plugins: withoutEffects, soundsFolder: sounds }, (labels) => {
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
