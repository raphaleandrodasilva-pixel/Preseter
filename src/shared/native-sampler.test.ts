import { describe, expect, it } from 'vitest';
import { isNativeSamplerAssignment, pickSamplerOptions } from './types';

describe('pickSamplerOptions', () => {
  it('copia só os ajustes conhecidos do sampler', () => {
    expect(pickSamplerOptions({
      loop: false,
      attack: 0.02,
      cutoff: 8000,
      plugin: 'C:/malicioso.vst3',
      path: '/tmp/x.so',
      samplePath: 'C:/segredo.sf2',
      release: '2',
      gain: Number.NaN,
    })).toEqual({ loop: false, attack: 0.02, cutoff: 8000 });
    expect(pickSamplerOptions(null)).toEqual({});
    expect(pickSamplerOptions(['loop'])).toEqual({});
  });
});

describe('isNativeSamplerAssignment', () => {
  it('reconhece o sampler pelo id ou caminho', () => {
    expect(isNativeSamplerAssignment({ pluginId: 'preseter.sampler', path: 'preseter.sampler' })).toBe(true);
    expect(isNativeSamplerAssignment({ pluginId: 'preseter.sampler', path: 'x' })).toBe(true);
    expect(isNativeSamplerAssignment({ pluginId: 'x', path: 'preseter.sampler' })).toBe(true);
  });

  it('não confunde VST com sampler por causa de sourceKind residual', () => {
    expect(isNativeSamplerAssignment({
      sourceKind: 'sampler',
      pluginId: 'tetraop',
      path: 'C:/VST3/TetraOP.vst3',
    })).toBe(false);
  });

  it('aceita fonte legada que só tem sourceKind', () => {
    expect(isNativeSamplerAssignment({ sourceKind: 'sampler' })).toBe(true);
    expect(isNativeSamplerAssignment({ sourceKind: 'vst3' })).toBe(false);
    expect(isNativeSamplerAssignment({})).toBe(false);
  });
});
