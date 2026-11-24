import { describe, expect, it } from 'vitest';
import { templateRequirements } from './template-requirements';

describe('dependências dos templates', () => {
  it('não exige mais o Dexed externo no Full Set', () => {
    const fullset = templateRequirements('fullset');
    expect(fullset.storeIds).not.toContain('dexed');
    expect(fullset.storeIds).toContain('sforzando');
  });

  it('templates nativos não exigem nada da Loja', () => {
    for (const id of ['vazio', 'teclado', 'worship', 'guitarra', 'midi-externo', 'show-10']) {
      expect(templateRequirements(id).storeIds).toEqual([]);
    }
  });
});
