import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPreset } from '../../test/fixtures';
import type { Preset, PresetPluginAssignment } from '../../shared/types';
import { collectConcertPrepareItems } from './prepare';

function assignment(
  overrides: Partial<PresetPluginAssignment> = {}
): PresetPluginAssignment {
  return {
    pluginId: 'preseter.sampler',
    name: 'Piano',
    path: 'preseter.sampler',
    role: 'instrument',
    ...overrides,
  };
}

const sounds = 'C:/Sons';

describe('collectConcertPrepareItems', () => {
  it('deduplica programas de sampler e resolve caminho relativo', () => {
    const presets: Preset[] = [
      createPreset({
        id: 'p1',
        programNumber: 2,
        plugins: [assignment({ samplePath: 'Piano.sf2', bank: 0, programIndex: 0 })],
      }),
      createPreset({
        id: 'p2',
        programNumber: 1,
        plugins: [
          assignment({ samplePath: 'C:/Sons/Piano.sf2', bank: 0, programIndex: 0 }),
          assignment({ name: 'Strings', samplePath: 'Piano.sf2', bank: 0, programIndex: 5 }),
        ],
      }),
    ];

    const plan = collectConcertPrepareItems(presets, sounds);

    expect(plan.samplerFiles).toBe(1);
    expect(plan.samplerPrograms).toBe(2);
    expect(plan.patchCount).toBe(2);
    expect(plan.items.map((item) => item.kind)).toEqual(['sampler', 'sampler']);
    expect(plan.items[0]).toMatchObject({
      path: path.join(sounds, 'Piano.sf2'),
      bank: 0,
      program: 0,
    });
    expect(plan.items[1]).toMatchObject({
      path: path.join(sounds, 'Piano.sf2'),
      bank: 0,
      program: 5,
    });
  });

  it('coloca os nativos depois dos samplers e sem repetir', () => {
    const presets: Preset[] = [
      createPreset({
        id: 'p1',
        plugins: [
          assignment({
            pluginId: 'preseter.zyn',
            path: 'preseter.zyn',
            name: 'Zyn',
            samplePath: undefined,
          }),
          assignment({ samplePath: 'Piano.sf2' }),
        ],
      }),
      createPreset({
        id: 'p2',
        plugins: [
          assignment({
            pluginId: 'preseter.dexed',
            path: 'preseter.dexed',
            name: 'Dexed',
            samplePath: undefined,
          }),
          assignment({
            pluginId: 'preseter.zyn',
            path: 'preseter.zyn',
            name: 'Zyn',
            samplePath: undefined,
          }),
        ],
      }),
    ];

    const plan = collectConcertPrepareItems(presets, sounds);

    expect(plan.items.map((item) => item.kind)).toEqual(['sampler', 'native', 'native']);
    expect(plan.items.slice(1)).toEqual([
      expect.objectContaining({ plugin: 'preseter.zyn', label: 'Preseter Zyn' }),
      expect.objectContaining({ plugin: 'preseter.dexed', label: 'Preseter Dexed' }),
    ]);
  });

  it('ignora MIDI externo e sampler sem arquivo', () => {
    const plan = collectConcertPrepareItems(
      [
        createPreset({
          plugins: [
            assignment({ externalMidi: true, samplePath: 'Piano.sf2' }),
            assignment({ samplePath: undefined }),
          ],
        }),
      ],
      sounds
    );

    expect(plan.items).toEqual([]);
    expect(plan.patchCount).toBe(0);
  });

  it('prepara o kit do Preseter Drums e o instrumento nativo', () => {
    const plan = collectConcertPrepareItems(
      [
        createPreset({
          plugins: [
            assignment({
              pluginId: 'preseter.drums',
              path: 'preseter.drums',
              name: 'Bateria',
              samplePath: 'Kit.sf2',
              drums: { enabled: true, startWithPatch: true, kitProgram: 24 },
            }),
          ],
        }),
      ],
      sounds
    );

    expect(plan.samplerPrograms).toBe(1);
    expect(plan.items).toEqual([
      expect.objectContaining({
        kind: 'sampler',
        path: path.join(sounds, 'Kit.sf2'),
        bank: 128,
        program: 24,
      }),
      expect.objectContaining({ kind: 'native', plugin: 'preseter.drums' }),
    ]);
  });

  it('usa o kit padrão quando o patch de bateria não tem arquivo', () => {
    const plan = collectConcertPrepareItems(
      [
        createPreset({
          plugins: [
            assignment({
              pluginId: 'preseter.drums',
              path: 'preseter.drums',
              name: 'Bateria',
              samplePath: undefined,
            }),
          ],
        }),
      ],
      sounds
    );

    expect(plan.samplerPrograms).toBe(1);
    expect(plan.items[0]).toMatchObject({
      kind: 'sampler',
      path: path.join(sounds, 'MuseScore_General', 'MuseScore_General.sf2'),
      bank: 128,
      program: 0,
    });
  });
});
