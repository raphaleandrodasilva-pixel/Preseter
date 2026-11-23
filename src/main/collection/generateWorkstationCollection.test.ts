import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseConcertFile } from '../concert/ConcertFile';
import { COLLECTION_SETS, type EffectSpec } from '../../shared/collection-presets';
import {
  WORKSTATION_BANKS,
  positionCode,
  workstationBankSets,
} from '../../shared/collections/workstation/recipes';
import voices from '../../shared/collections/workstation/voices.json';
import { findEffect } from '../../shared/effects/catalog';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';
import {
  buildWorkstationConcert,
  uniqueConcertPath,
  writeWorkstationConcerts,
  WORKSTATION_FOLDER,
} from './generateWorkstationCollection';

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
  {
    id: 'gx-amp',
    name: 'GxAmplifier-X',
    path: 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX',
    isInstrument: false,
  },
  {
    id: 'gx-overdrive',
    name: 'GxTubeScreamer',
    path: 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim',
    isInstrument: false,
  },
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

const allPatches = () => WORKSTATION_BANKS.flatMap((bank) =>
  workstationBankSets(bank).flatMap(([, patches]) => patches.map((patch) => ({ bank, patch }))));

describe('coleção Workstation', () => {
  it('cobre as 128 posições de cada um dos 6 bancos', () => {
    expect(positionCode(1)).toBe('A01');
    expect(positionCode(17)).toBe('B01');
    expect(positionCode(128)).toBe('H16');

    for (const bank of WORKSTATION_BANKS) {
      const patches = workstationBankSets(bank).flatMap(([, list]) => list);
      expect(patches).toHaveLength(128);
      const programs = patches.map(([, , meta]) => meta?.programNumber).sort((a, b) => a! - b!);
      expect(programs).toEqual(Array.from({ length: 128 }, (_, index) => index));
      for (const [name, , meta] of patches) {
        expect(name.startsWith(positionCode(meta!.programNumber! + 1))).toBe(true);
      }
    }
  });

  it('não repete receita entre as 768 posições', () => {
    const signatures = allPatches().map(({ patch: [, layers, meta] }) =>
      JSON.stringify({ layers, inserts: meta?.inserts, master: meta?.master, sends: meta?.sends, aux: meta?.auxPresets }));
    expect(new Set(signatures).size).toBe(768);
  });

  it('usa só efeitos, presets e programas que existem', () => {
    const limits = { organ: 4, tines: 4, dx: 32, jx: 52, synth2: 58 } as Record<string, number>;
    const refs = (specs: EffectSpec[] = []) =>
      specs.map((spec) => (typeof spec === 'string' ? { effect: spec, preset: undefined } : spec));

    for (const { patch: [name, layers, meta] } of allPatches()) {
      const chain = [...refs(meta?.inserts), ...refs(meta?.master)];
      expect(chain.length, name).toBeLessThanOrEqual(4);
      if (layers.length > 1) expect(meta?.inserts ?? [], name).toEqual([]);
      for (const ref of chain) {
        const effect = findEffect(ref.effect);
        expect(effect, `${name}: ${ref.effect}`).toBeDefined();
        expect(effect?.presets.some((preset) => preset.id === ref.preset), `${name}: ${ref.effect}/${ref.preset}`).toBe(true);
        if (layers.some((layer) => layer.nativeInstrument === 'organ')) {
          expect(effect?.source, `${name}: efeito mono no órgão`).not.toBe('guitarix');
        }
      }
      for (const layer of layers) {
        const limit = layer.nativeInstrument ? limits[layer.nativeInstrument] : undefined;
        if (limit) expect(layer.programIndex ?? 0, name).toBeLessThan(limit);
        expect(layer.min, name).toBeLessThanOrEqual(layer.max);
        expect(layer.velocityMin ?? 1, name).toBeLessThanOrEqual(layer.velocityMax ?? 127);
      }
    }
  });

  it('não guarda nomes de fabricante nos dados', () => {
    const values = new Set(Object.values(voices).flat());
    for (const value of values) expect(value).toMatch(/^[A-Z][a-z]\/[A-Z0-9.&/ ]+$/);
    for (const { patch: [name] } of allPatches()) {
      expect(name).not.toMatch(/yamaha|motif/i);
    }
  });

  it('gera concerts válidos com o Program Change igual à posição', () => {
    const sounds = makeSounds();
    try {
      for (const bank of WORKSTATION_BANKS) {
        const { file, skipped, missing } = buildWorkstationConcert(bank, plugins, { soundsFolder: sounds });
        expect(skipped, bank).toEqual([]);
        expect(missing, bank).toEqual([]);
        expect(file.patches).toHaveLength(128);
        expect(new Set(file.patches.map((patch) => patch.programNumber)).size).toBe(128);
        expect(new Set(file.patches.map((patch) => patch.id)).size).toBe(128);
        expect(parseConcertFile(JSON.stringify(file)).patches).toHaveLength(128);
      }
    } finally {
      removeTempDir(sounds);
    }
  });

  it('pula o que depende de biblioteca ausente e informa o que falta', () => {
    const { file, skipped, missing } = buildWorkstationConcert('PRE1', plugins, {});
    expect(file.patches.length).toBeGreaterThan(0);
    expect(file.patches.length).toBeLessThan(128);
    expect(skipped.length).toBe(128 - file.patches.length);
    expect(missing).toEqual(expect.arrayContaining(['Salamander Grand Piano V3']));
  });

  it('grava um arquivo por banco sem sobrescrever os existentes', () => {
    const sounds = makeSounds();
    const output = makeTempDir();
    try {
      const first = writeWorkstationConcerts(output, plugins, { soundsFolder: sounds });
      expect(first.patches).toBe(768);
      expect(first.banks.every((bank) => bank.path && fs.existsSync(bank.path))).toBe(true);

      const original = fs.readFileSync(first.banks[0].path!, 'utf8');
      const second = writeWorkstationConcerts(output, plugins, { soundsFolder: sounds });
      expect(second.banks[0].path).not.toBe(first.banks[0].path);
      expect(fs.readFileSync(first.banks[0].path!, 'utf8')).toBe(original);
      expect(uniqueConcertPath(path.join(output, WORKSTATION_FOLDER), 'novo')).toMatch(/novo\.pst$/);
    } finally {
      removeTempDir(sounds);
      removeTempDir(output);
    }
  });

  it('não altera a Factory 40', () => {
    const names = COLLECTION_SETS.flatMap(([, patches]) => patches.map(([name]) => name));
    expect(names).toHaveLength(40);
    expect(names.some((name) => /^[A-H]\d{2} /.test(name))).toBe(false);
  });
});
