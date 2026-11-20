import { describe, expect, it } from 'vitest';
import {
  EFFECTS,
  PANEL_EFFECTS,
  effectDisplayName,
  findEffect,
  formatParam,
  isChoice,
  paramPosition,
  positionToNormalized,
  type EffectParam,
} from './catalog';

function param (overrides: Partial<EffectParam>): EffectParam {
  return {
    index: 0,
    id: 'p',
    name: 'P',
    engineName: 'P',
    label: 'P',
    unit: '',
    min: 0,
    max: 1,
    default: 0,
    scale: 'linear',
    precision: 2,
    toggle: false,
    group: 'Controles',
    collapsed: false,
    ...overrides,
  };
}

describe('catálogo de efeitos', () => {
  it('encontra o efeito pelo caminho, pelo nome do plugin e pelo nome Preseter', () => {
    expect(findEffect('C:/plugins/calfNXTReverb.vst3')?.displayName).toBe('Preseter Reverb');
    expect(findEffect('calfNXT Delay')?.displayName).toBe('Preseter Delay');
    expect(findEffect('Preseter Compressor')?.displayName).toBe('Preseter Compressor');
    expect(findEffect('C:/plugins/Outro.vst3')).toBeUndefined();
  });

  it('mantém o nome original quando o plugin não está no catálogo', () => {
    expect(effectDisplayName('C:/plugins/Outro.vst3', 'Outro FX')).toBe('Outro FX');
    expect(effectDisplayName('C:/plugins/calfNXTReverb.vst3', 'qualquer')).toBe('Preseter Reverb');
  });

  it('marca Analyzer e Tuner como editor original', () => {
    const analyzer = findEffect('calfNXTAnalyzer.vst3');
    const tuner = findEffect('calfNXT Tuner');
    expect(analyzer?.nativePanel).toBe(false);
    expect(tuner?.nativePanel).toBe(false);
    expect(PANEL_EFFECTS.length).toBe(EFFECTS.length - 2);
  });

  it('formata o valor real com a unidade e a precisão do plugin', () => {
    const room = param({ min: 2, max: 40, precision: 1, unit: 'm' });
    expect(formatParam(room, 0.5)).toBe('21.0 m');
    const ratio = param({ min: 1, max: 20, precision: 1, unit: ':1' });
    expect(formatParam(ratio, 0)).toBe('1.0:1');
    const plain = param({ precision: 0, unit: '' });
    expect(formatParam(plain, 1)).toBe('1');
  });

  it('acha parâmetros logarítmicos pela posição do knob', () => {
    const decay = param({ min: 0.4, max: 15, scale: 'log' });
    for (const normalized of [0, 0.1, 0.5, 0.9, 1]) {
      const position = paramPosition(decay, normalized);
      expect(positionToNormalized(decay, position)).toBeCloseTo(normalized, 6);
    }
    const linear = param({ min: 0, max: 10 });
    expect(paramPosition(linear, 0.25)).toBeCloseTo(0.25, 6);
  });

  it('reconhece toggles e escolhas', () => {
    expect(param({ min: 0, max: 1, precision: 0, toggle: true }).toggle).toBe(true);
    expect(isChoice(param({ min: 1, max: 8, precision: 0 }))).toBe(true);
    expect(isChoice(param({ min: 0, max: 20, precision: 0 }))).toBe(false);
    expect(isChoice(param({ min: 0, max: 1, precision: 2 }))).toBe(false);
  });

  it('traz presets de fábrica com valores normalizados', () => {
    const reverb = findEffect('calfNXTReverb.vst3');
    expect(reverb).toBeDefined();
    expect(reverb!.presets.length).toBeGreaterThan(3);
    expect(reverb!.presets.map((preset) => preset.label)).toContain('Hall');
    for (const preset of reverb!.presets) {
      for (const value of Object.values(preset.values)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
