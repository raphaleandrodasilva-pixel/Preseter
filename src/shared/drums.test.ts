import { describe, expect, it } from 'vitest';
import { DEFAULT_DRUMS, drumsStartOnLoad } from './types';

describe('configuração do sequenciador de bateria (D5)', () => {
  it('só liga ao carregar o patch com "Sequenciador ligado" e "Iniciar com o patch"', () => {
    expect(DEFAULT_DRUMS).toEqual({ enabled: false, startWithPatch: true });
    expect(drumsStartOnLoad(undefined)).toBe(false);
    expect(drumsStartOnLoad({ enabled: true, startWithPatch: true })).toBe(true);
    expect(drumsStartOnLoad({ enabled: true, startWithPatch: false })).toBe(false);
    expect(drumsStartOnLoad({ enabled: false, startWithPatch: true })).toBe(false);
  });
});
