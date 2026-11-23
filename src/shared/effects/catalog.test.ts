import { describe, expect, it } from 'vitest';
import { COLLECTION_SETS } from '../collection-presets';
import { effectKey, effectPresetValues, findEffect } from './catalog';

describe('catálogo de efeitos', () => {
  it('casa nome do scan, nome Preseter e key curta', () => {
    expect(effectKey('C:/plugins/calfnxt/calfNXTReverb.vst3')).toBe('reverb');
    expect(effectKey('calfNXTMbcomp.vst3')).toBe('mbcomp');
    expect(findEffect('Preseter Reverb')?.match).toBe('Reverb');
    expect(findEffect('calfNXT Reverb')?.match).toBe('Reverb');
    expect(findEffect('reverb')?.match).toBe('Reverb');
  });

  it('extrai os valores de um preset no formato do motor', () => {
    const values = effectPresetValues('C:/plugins/calfnxt/calfNXTReverb.vst3', 'hall');
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((entry) => Number.isSafeInteger(entry.index))).toBe(true);
    expect(values.every((entry) => entry.value >= 0 && entry.value <= 1)).toBe(true);
    // Ordenado por índice, para a aplicação ficar determinística.
    expect(values.map((entry) => entry.index)).toEqual(
      [...values.map((entry) => entry.index)].sort((a, b) => a - b)
    );
  });

  it('devolve lista vazia para preset ou efeito inexistente', () => {
    expect(effectPresetValues('C:/plugins/calfnxt/calfNXTReverb.vst3', 'nao-existe')).toEqual([]);
    expect(effectPresetValues('C:/plugins/outro/nada.vst3', 'hall')).toEqual([]);
    expect(effectPresetValues('C:/plugins/calfnxt/calfNXTReverb.vst3', undefined)).toEqual([]);
  });

  it('usa a versão -aux do preset em inserts de Aux', () => {
    const path = 'C:/plugins/calfnxt/calfNXTReverb.vst3';
    const valueOf = (values: Array<{ index: number; value: number }>, index: number) =>
      values.find((entry) => entry.index === index)?.value;

    const insert = effectPresetValues(path, 'hall');
    const aux = effectPresetValues(path, 'hall', { aux: true });

    // Seco (31) e Molhado (32): insert 0 / -10 dB; aux -60 / 0 dB.
    expect(valueOf(insert, 31)).toBeCloseTo(60 / 72, 5);
    expect(valueOf(insert, 32)).toBeCloseTo(50 / 72, 5);
    expect(valueOf(aux, 31)).toBe(0);
    expect(valueOf(aux, 32)).toBeCloseTo(60 / 72, 5);
    // Um id já terminado em -aux não ganha outro sufixo.
    expect(effectPresetValues(path, 'hall-aux', { aux: true })).toEqual(aux);
  });

  it('só cita presets existentes nos Aux da coleção', () => {
    const byAux = new Map([[1, 'preseter.reverb'], [2, 'preseter.delay']]);
    for (const [, patches] of COLLECTION_SETS) {
      for (const [name, , meta] of patches) {
        for (const [aux, presetId] of Object.entries(meta?.auxPresets ?? {})) {
          const effect = findEffect(byAux.get(Number(aux))!);
          expect(effect, `Aux ${aux} sem efeito`).toBeTruthy();
          expect(
            effect!.presets.some((preset) => preset.id === presetId),
            `${name}: Aux ${aux} cita "${presetId}", que não existe em ${effect!.id}`
          ).toBe(true);
        }
      }
    }
  });

  it('casa o LV2 do Guitarix pela URI e pelo nome do plugin', () => {
    const uri = 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim';
    const byUri = findEffect(uri);
    const byName = findEffect('GxTubeScreamer');
    expect(byUri?.displayName).toBe('Preseter Overdrive');
    expect(byName?.id).toBe(byUri?.id);
    expect(effectKey(uri)).toBe('gxts9');
    expect(byUri?.source).toBe('guitarix');
    expect(byUri?.originalEditor).toBe(false);
    expect(findEffect('Preseter Overdrive')?.id).toBe(byUri?.id);
    expect(findEffect('overdrive')?.id).toBe(byUri?.id);
    expect(findEffect('Preseter Amp')?.id).toBe('preseter.gx.amp');
    expect(byUri?.params.map((param) => param.label)).toEqual(['Nível', 'Timbre', 'Drive', 'Bypass']);
    expect(byUri?.presets.map((preset) => preset.label)).toContain('Crunch');
    const crunch = effectPresetValues(uri, 'crunch');
    expect(crunch.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
  });

  it('traz os cinco efeitos Guitarix com nomes Preseter', () => {
    const names = [
      ['GxTubeScreamer', 'Preseter Overdrive'],
      ['Gx_studiopre', 'Preseter Preamp'],
      ['GxCabinet', 'Preseter Cab'],
      ['GxAmplifier-X', 'Preseter Amp'],
      ['Gx_tremolo', 'Preseter Tremolo'],
    ];
    for (const [pluginName, displayName] of names) {
      const effect = findEffect(pluginName);
      expect(effect?.displayName).toBe(displayName);
      expect(effect?.source).toBe('guitarix');
      expect(effect?.params.length).toBeGreaterThan(0);
      expect(effect?.presets.length).toBeGreaterThanOrEqual(4);
    }
  });
});
