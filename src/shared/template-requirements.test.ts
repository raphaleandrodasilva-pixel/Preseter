import { describe, expect, it } from 'vitest';
import { templateRequirements } from './template-requirements';

describe('dependências dos templates', () => {
  it('Full Set pede só as bibliotecas do sampler nativo (instrumentos já portados)', () => {
    const fullset = templateRequirements('fullset');
    expect(fullset.storeIds).toEqual(['musescore-general', 'sonatina', 'salamander']);
    for (const ported of ['sforzando', 'mda', 'dexed', 'surge-xt', 'odin2', 'helm']) {
      expect(fullset.storeIds).not.toContain(ported);
    }
  });

  it('templates nativos não exigem nada da Loja', () => {
    for (const id of ['vazio', 'teclado', 'worship', 'guitarra', 'midi-externo', 'show-10']) {
      expect(templateRequirements(id).storeIds).toEqual([]);
    }
  });
});
