import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VstManager } from './VstManager';
import {
  buildNativePresets,
  resolveNativeProgram,
  scanZynPrograms,
  zynCollectionName,
  zynPresetName,
} from './nativePresets';
import { VstPresetLibrary } from './VstPresetLibrary';
import { PRESETER_SOUNDS } from '../../shared/preseter-sounds';
import { staticNativePrograms } from '../../shared/native-presets';
import { VST_PRESET_CATEGORIES, categorizePreset } from '../../shared/vst-presets';
import { findEffect } from '../../shared/effects/catalog';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

const ZYN_BANKS = path.resolve('vendor/zyn/banks');

describe('categorias de preset', () => {
  it('separa os nomes pela palavra mais específica', () => {
    expect(categorizePreset('Synth Bass 3')).toBe('Synth Bass');
    expect(categorizePreset('Fretless Bass')).toBe('Bass');
    expect(categorizePreset('Bright E.Piano')).toBe('E-Piano');
    expect(categorizePreset('Concert Piano')).toBe('Piano');
    expect(categorizePreset('Synth Brass 4')).toBe('Synth Brass');
    expect(categorizePreset('Brass Section')).toBe('Brass');
    expect(categorizePreset('AHH Choir 1')).toBe('Choir');
    expect(categorizePreset('Accordion 1')).toBe('Accordion & Harmonica');
    expect(categorizePreset('MARIMBA 2')).toBe('Bells & Mallets');
    expect(categorizePreset('DAVE KOTO')).toBe('World');
    expect(categorizePreset('Car Horn')).toBe('FX');
  });

  it('não confunde pedaços de palavras', () => {
    expect(categorizePreset('HARP 1')).toBe('Plucked');
    expect(categorizePreset('Champagne')).toBe('Outros');
    expect(categorizePreset('padding')).toBe('Synth Pad');
  });
});

describe('presets dos instrumentos nativos', () => {
  it('lê o Zyn na mesma ordem do motor (índices usados pela Factory 64)', () => {
    const zyn = scanZynPrograms(ZYN_BANKS);
    expect(zyn).toHaveLength(1318);
    const at = (index: number) => zyn[index].display;
    expect(at(1049)).toBe('Fábrica/Pads · 0065-Soft Pad');
    expect(at(1190)).toBe('Fábrica/the_mysterious_bank · 0001-strings_pad');
    expect(at(1263)).toBe('Fábrica/the_mysterious_bank_3 · 0011-portal2_lead');
    expect(at(1308)).toBe('Fábrica/the_mysterious_bank_4 · 0027-funky_lead');
  });

  it('mostra nomes e coleções legíveis', () => {
    expect(zynPresetName('0013-supersaw_wihout_release')).toBe('Supersaw Wihout Release');
    expect(zynPresetName('0065-Soft Pad')).toBe('Soft Pad');
    expect(zynCollectionName('the_mysterious_bank', false)).toBe('Zyn · Mysterious Bank 1');
    expect(zynCollectionName('the_mysterious_bank_4', false)).toBe('Zyn · Mysterious Bank 4');
    expect(zynCollectionName('Choir and Voice', false)).toBe('Zyn · Choir and Voice');
  });

  it('cobre o Dexed com os índices do motor', () => {
    const dexed = staticNativePrograms().filter((program) => program.instrument === 'dexed');
    expect(dexed).toHaveLength(1056);
    expect(dexed[87].name).toBe('E.-PIANO');
    expect(dexed[667].name).toBe('BELLS 3');
    expect(dexed[87].collection).toBe('Dexed · Synprez 02');
  });

  it('monta todos os nativos com categorias da lista', () => {
    const presets = buildNativePresets(ZYN_BANKS);
    const known = new Set(VST_PRESET_CATEGORIES);
    for (const preset of presets) expect(known.has(preset.category), `${preset.name}: ${preset.category}`).toBe(true);
    const zynPads = presets.filter((preset) => preset.pluginId === 'preseter.zyn' && preset.category === 'Synth Pad');
    expect(zynPads.length).toBeGreaterThan(50);
    expect(presets.find((preset) => preset.id === 'native:jx:29')).toMatchObject({ name: 'Synth Strings', category: 'Strings' });
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
  });

  it('confere o índice pelo nome que o motor informa', () => {
    const preset = { programIndex: 5, programName: 'Fábrica/Pads · 0065-Soft Pad' };
    expect(resolveNativeProgram(preset, ['a', 'Fábrica/Pads · 0065-Soft Pad'])).toBe(1);
    expect(resolveNativeProgram(preset, ['a', 'b'])).toBe(5);
    expect(resolveNativeProgram(preset, undefined)).toBe(5);
  });
});

describe('Preseter Sounds', () => {
  it('todos os sons existem no banco, com efeitos e presets válidos', () => {
    const presets = buildNativePresets(ZYN_BANKS).filter((preset) => preset.source === 'sound');
    expect(presets).toHaveLength(PRESETER_SOUNDS.length);
    expect(PRESETER_SOUNDS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(PRESETER_SOUNDS.map((sound) => sound.name)).size).toBe(PRESETER_SOUNDS.length);
    const known = new Set(VST_PRESET_CATEGORIES);
    for (const sound of PRESETER_SOUNDS) {
      expect(known.has(sound.category), sound.name).toBe(true);
      expect(sound.effects.length, sound.name).toBeLessThanOrEqual(4);
      expect(sound.name).not.toMatch(/yamaha|roland|korg|oberheim|moog|polysix|juno|daft/i);
      for (const ref of sound.effects) {
        const effect = findEffect(ref.effect);
        expect(effect, `${sound.name}: ${ref.effect}`).toBeDefined();
        if (ref.preset) expect(effect?.presets.some((item) => item.id === ref.preset), `${sound.name}: ${ref.preset}`).toBe(true);
      }
    }
  });

  it('cobre todas as categorias de instrumento', () => {
    const categories = new Set(PRESETER_SOUNDS.map((sound) => sound.category));
    for (const category of ['Piano', 'E-Piano', 'Organ', 'Strings', 'Choir', 'Brass', 'Synth Brass', 'Woodwinds',
      'Bells & Mallets', 'Plucked', 'Guitar', 'Bass', 'Synth Bass', 'Synth Lead', 'Synth Pad', 'Arp', 'FX']) {
      expect(categories.has(category), category).toBe(true);
    }
  });
});

describe('VstPresetLibrary com os nativos', () => {
  let userData: string;
  let documents: string;

  beforeEach(() => {
    userData = makeTempDir('preseter-native-lib-');
    documents = makeTempDir('preseter-native-docs-');
  });

  afterEach(() => {
    removeTempDir(userData);
    removeTempDir(documents);
  });

  it('lista os nativos, aplica pelo nome e guarda o favorito', async () => {
    const lib = new VstPresetLibrary(userData, documents);
    lib.setNativeSources(ZYN_BANKS);
    const sound = lib.listResult().presets.find((preset) => preset.id === 'sound:Portal Lead');
    expect(sound).toMatchObject({ source: 'sound', pluginId: 'preseter.zyn', programIndex: 1263, collection: 'Preseter Sounds' });

    const setPluginProgram = vi.fn(async () => true);
    const names = Array.from({ length: 1318 }, (_, index) => `p${index}`);
    names[7] = sound?.programName ?? '';
    const vst = {
      setPluginProgram,
      getLoadedPlugins: () => [{ layerId: 'layer-1', programNames: names }],
    } as unknown as VstManager;
    expect(await lib.applyPreset('sound:Portal Lead', 'layer-1', vst)).toBe(true);
    expect(setPluginProgram).toHaveBeenCalledWith('layer-1', 7);

    expect(lib.updatePreset('sound:Portal Lead', { favorite: true })?.favorite).toBe(true);
    const reopened = new VstPresetLibrary(userData, documents);
    reopened.setNativeSources(ZYN_BANKS);
    expect(reopened.listResult().presets.find((preset) => preset.id === 'sound:Portal Lead')?.favorite).toBe(true);
    expect(reopened.deletePreset('sound:Portal Lead')).toBe(false);
  });
});
