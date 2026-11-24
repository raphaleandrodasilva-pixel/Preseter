import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createEmptyConcertFile } from '../concert/ConcertFile';
import { parseLibraryFile } from '../../shared/library/format';
import type { Preset, PreseterConcertFile } from '../../shared/types';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';
import { generateLibrary, inspectLibrary } from './LibraryService';
import { buildLibraryFromConcert, resolveConcertSnapshot } from './exportLibrary';

const HOME = 'C:\\Users\\alguem';
const SOUNDS = `${HOME}\\PreseterSons`;
const SYNTH = { id: 'VST3-Synth-aaaa-1', name: 'Meu Synth', path: `${HOME}\\vst\\Synth.vst3`, format: 'VST3', isInstrument: true };
const REVERB = { id: 'VST3-calfNXT Reverb-aaaa-2', name: 'calfNXT Reverb', path: `${HOME}\\fx\\calfNXTReverb.vst3`, format: 'VST3', isInstrument: false };
const OTHER_SYNTH = { ...SYNTH, id: 'VST3-Synth-bbbb-1', path: 'D:/plugins/Synth.vst3' };
const OTHER_REVERB = { ...REVERB, id: 'VST3-calfNXT Reverb-bbbb-2', path: 'D:/plugins/calfNXTReverb.vst3' };

const samplerState = () => ({
  data: Buffer.from(JSON.stringify({ file: `${SOUNDS}\\Meu\\piano.sf2`, format: 'SF2', cutoff: 1234 }), 'utf8').toString('base64'),
  parameters: { 4: 0.42 },
  bypass: false,
});

function concert (): PreseterConcertFile {
  const file = createEmptyConcertFile('Palco Pró');
  const insert = { slot: 0, pluginId: REVERB.id, name: REVERB.name, path: REVERB.path, bypass: false };
  const patch: Preset = {
    id: 'patch-1',
    name: 'Piano e Synth',
    programNumber: 7,
    bankNumber: 2,
    midiChannel: 0,
    transpose: -2,
    shortcut: 'F2',
    notes: 'minha anotação',
    plugins: [
      {
        pluginId: 'preseter.sampler',
        layerId: 'l1',
        name: 'Sampler',
        path: 'preseter.sampler',
        role: 'instrument',
        sourceKind: 'sampler',
        samplePath: `${SOUNDS}\\Meu\\piano.sf2`,
        programIndex: 3,
        mix: { volumeDb: -4, pan: 0.2, muted: false, solo: false },
      },
      {
        pluginId: SYNTH.id,
        layerId: 'l2',
        name: SYNTH.name,
        path: SYNTH.path,
        role: 'instrument',
        minNote: 60,
        velocityMin: 90,
        inserts: [insert],
      },
    ],
    master: { volumeDb: -1, pan: 0, muted: false, inserts: [{ ...insert }] },
    vstStates: {
      loaded_l1: samplerState(),
      [`loaded_${SYNTH.id}`]: { data: Buffer.from('estado-do-synth').toString('base64'), parameters: {}, bypass: false },
      insert_l2_0: { data: Buffer.from('knob-do-reverb').toString('base64') },
    },
    layout: { elements: [{ id: 'e1', pluginPath: SYNTH.path, pluginId: SYNTH.id } as never], background: null, tempo: 120 },
    createdAt: 1,
    updatedAt: 1,
  };
  file.patches = [patch];
  file.mappings = [{ id: 'm1', patchId: 'patch-1', pluginPath: SYNTH.path, pluginId: SYNTH.id } as never];
  return file;
}

const exported = (document = concert()) => buildLibraryFromConcert(document, {
  plugins: [SYNTH, REVERB],
  soundsFolder: SOUNDS,
  homeDir: HOME,
});

function otherPc (withSample = true): string {
  const sounds = makeTempDir();
  if (withSample) {
    fs.mkdirSync(path.join(sounds, 'Meu'));
    fs.writeFileSync(path.join(sounds, 'Meu', 'piano.sf2'), 'fake');
  }
  return sounds;
}

describe('exportar concert como biblioteca', () => {
  it('não leva caminhos nem ids deste computador', () => {
    const { library, warnings } = exported();
    const text = JSON.stringify(library);
    expect(text).not.toContain('alguem');
    expect(text).not.toContain(SYNTH.id);
    expect(text).not.toContain(REVERB.id);
    expect(warnings).toEqual([]);
    expect(library.id).toBe('palco-pro');
    expect(Object.values(library.pluginRefs ?? {}).map((ref) => ref.name).sort()).toEqual(['Meu Synth', 'calfNXT Reverb']);
    expect(() => parseLibraryFile(text)).not.toThrow();
  });

  it('volta em outro computador com knobs, layers, atalhos e mappings', () => {
    const sounds = otherPc();
    try {
      const { library } = exported();
      const parsed = parseLibraryFile(JSON.stringify(library));
      const { file, skipped, missing } = resolveConcertSnapshot(parsed, parsed.concerts[0], {
        plugins: [OTHER_SYNTH, OTHER_REVERB],
        soundsFolder: sounds,
      });
      expect(skipped).toEqual([]);
      expect(missing).toEqual([]);

      const patch = file.patches[0];
      expect(patch).toMatchObject({ programNumber: 7, bankNumber: 2, transpose: -2, shortcut: 'F2', notes: 'minha anotação' });
      expect(patch.plugins?.[0]).toMatchObject({ samplePath: 'Meu/piano.sf2', programIndex: 3 });
      expect(patch.plugins?.[0].mix).toMatchObject({ volumeDb: -4, pan: 0.2 });
      expect(patch.plugins?.[1]).toMatchObject({ pluginId: OTHER_SYNTH.id, path: OTHER_SYNTH.path, minNote: 60, velocityMin: 90 });
      expect(patch.plugins?.[1].inserts?.[0]).toMatchObject({ pluginId: OTHER_REVERB.id, path: OTHER_REVERB.path });
      expect(patch.master?.inserts[0].path).toBe(OTHER_REVERB.path);

      expect(Buffer.from(patch.vstStates[`loaded_${OTHER_SYNTH.id}`].data, 'base64').toString()).toBe('estado-do-synth');
      expect(Buffer.from(patch.vstStates.insert_l2_0.data, 'base64').toString()).toBe('knob-do-reverb');
      const sampler = JSON.parse(Buffer.from(patch.vstStates.loaded_l1.data, 'base64').toString());
      expect(sampler).toMatchObject({ file: '', cutoff: 1234 });
      expect(patch.vstStates.loaded_l1.parameters).toEqual({ 4: 0.42 });
      expect(file.mappings[0]).toMatchObject({ pluginId: OTHER_SYNTH.id, pluginPath: OTHER_SYNTH.path });
    } finally {
      removeTempDir(sounds);
    }
  });

  it('funciona pelo mesmo caminho do botão Gerar Biblioteca', () => {
    const sounds = otherPc();
    const output = makeTempDir();
    try {
      const parsed = parseLibraryFile(JSON.stringify(exported().library));
      const environment = { plugins: [OTHER_SYNTH, OTHER_REVERB], soundsFolder: sounds };
      expect(inspectLibrary(parsed, 'external', environment)).toMatchObject({ total: 1, ready: 1, missing: [] });
      const result = generateLibrary(parsed, environment, output);
      expect(result.patches).toBe(1);
      expect(fs.existsSync(result.concerts[0].path)).toBe(true);
    } finally {
      removeTempDir(sounds);
      removeTempDir(output);
    }
  });

  it('pula o patch sem instrumento e mantém o patch sem o efeito ausente', () => {
    const sounds = otherPc();
    try {
      const parsed = parseLibraryFile(JSON.stringify(exported().library));
      const withoutSynth = resolveConcertSnapshot(parsed, parsed.concerts[0], { plugins: [OTHER_REVERB], soundsFolder: sounds });
      expect(withoutSynth.file.patches).toHaveLength(0);
      expect(withoutSynth.file.mappings).toHaveLength(0);
      expect(withoutSynth.missing).toContain('Meu Synth');

      const withoutReverb = resolveConcertSnapshot(parsed, parsed.concerts[0], { plugins: [OTHER_SYNTH], soundsFolder: sounds });
      expect(withoutReverb.file.patches).toHaveLength(1);
      expect(withoutReverb.file.patches[0].plugins?.[1].inserts).toEqual([]);
      expect(withoutReverb.missing).toContain('calfNXT Reverb');
    } finally {
      removeTempDir(sounds);
    }
  });

  it('avisa sobre sample fora da pasta de sons sem gravar o caminho', () => {
    const document = concert();
    document.patches[0].plugins![0].samplePath = 'E:\\Privado\\piano.sf2';
    const { library, warnings } = exported(document);
    expect(warnings.join(' ')).toContain('piano.sf2');
    expect(JSON.stringify(library)).not.toContain('Privado');
  });

  it('converte o caminho do sample nos dois sistemas', () => {
    const linux = concert();
    linux.patches[0].plugins![0].samplePath = '/home/alguem/PreseterSons/Meu/piano.sf2';
    const fromLinux = buildLibraryFromConcert(linux, {
      plugins: [SYNTH, REVERB],
      soundsFolder: '/home/alguem/PreseterSons',
      homeDir: '/home/alguem',
    }).library.concerts[0].snapshot as PreseterConcertFile;
    expect(fromLinux.patches[0].plugins?.[0].samplePath).toBe('Meu/piano.sf2');

    const unsafe = concert();
    unsafe.patches[0].plugins![0].samplePath = '../fora/piano.sf2';
    const fromUnsafe = exported(unsafe).library.concerts[0].snapshot as PreseterConcertFile;
    expect(fromUnsafe.patches[0].plugins?.[0].samplePath).toBe('Externos/piano.sf2');
  });

  it('recusa biblioteca que tenta carregar um plugin por caminho direto', () => {
    const { library } = exported();
    const snapshot = library.concerts[0].snapshot as PreseterConcertFile;
    snapshot.patches[0].plugins![1].path = 'C:\\malicioso\\plugin.vst3';
    expect(() => parseLibraryFile(JSON.stringify(library))).toThrow(/plugin/i);

    const second = exported().library;
    const secondSnapshot = second.concerts[0].snapshot as PreseterConcertFile;
    secondSnapshot.patches[0].plugins![1].inserts![0].path = '/tmp/malicioso.so';
    expect(() => parseLibraryFile(JSON.stringify(second))).toThrow(/plugin/i);

    const third = exported().library;
    (third.concerts[0].snapshot as PreseterConcertFile).patches[0].plugins![0].samplePath = '../../segredo.sf2';
    expect(() => parseLibraryFile(JSON.stringify(third))).toThrow(/sample/i);

    // Os ajustes do sampler vão para o motor: um `plugin` ali trocaria o que é carregado.
    const fourth = exported().library;
    (fourth.concerts[0].snapshot as PreseterConcertFile).patches[0].plugins![0].sampler =
      { loop: true, plugin: 'C:\\malicioso\\plugin.vst3' } as never;
    expect(() => parseLibraryFile(JSON.stringify(fourth))).toThrow(/sampler/i);

    const fifth = exported().library;
    (fifth.concerts[0].snapshot as PreseterConcertFile).patches[0].plugins![0].sampler =
      { loop: false, attack: 0.01, cutoff: 9000 };
    expect(() => parseLibraryFile(JSON.stringify(fifth))).not.toThrow();
  });

  it('recusa concert vazio', () => {
    expect(() => exported(createEmptyConcertFile('Vazio'))).toThrow(/não tem patches/);
  });
});
