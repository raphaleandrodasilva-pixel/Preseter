import { describe, expect, it } from 'vitest';
import { FACTORY_DRUM_PATTERNS, findFactoryDrumPattern, toEngineDrumPattern } from './drum-patterns';

describe('padrões de fábrica do Drums (D8)', () => {
  it('tem ids únicos, nomes e resoluções suportadas', () => {
    const ids = new Set<string>();

    for (const pattern of FACTORY_DRUM_PATTERNS) {
      expect(ids.has(pattern.id)).toBe(false);
      ids.add(pattern.id);
      expect(pattern.name.trim().length).toBeGreaterThan(0);
      expect([8, 12, 16, 32]).toContain(pattern.stepsPerBar);
      expect([1, 2, 4]).toContain(pattern.bars);
      expect(pattern.swing).toBeGreaterThanOrEqual(0);
      expect(pattern.swing).toBeLessThanOrEqual(75);
    }

    expect(FACTORY_DRUM_PATTERNS.length).toBeGreaterThanOrEqual(6);
  });

  it('mantém cada trilha dentro do compasso e com velocity válida', () => {
    for (const pattern of FACTORY_DRUM_PATTERNS) {
      const total = pattern.stepsPerBar * pattern.bars;

      for (const track of pattern.tracks) {
        expect(track.pad).toBeGreaterThanOrEqual(0);
        expect(track.pad).toBeLessThanOrEqual(15);
        expect(track.steps).toHaveLength(total);
        for (const velocity of track.steps) {
          expect(velocity).toBeGreaterThanOrEqual(0);
          expect(velocity).toBeLessThanOrEqual(127);
        }
      }

      // Todo padrão tem bumbo e pelo menos um passo ligado.
      expect(pattern.tracks.some((track) => track.pad === 0)).toBe(true);
      expect(pattern.tracks.some((track) => track.steps.some((velocity) => velocity > 0))).toBe(true);
    }
  });

  it('cobre os estilos pedidos', () => {
    const names = FACTORY_DRUM_PATTERNS.map((pattern) => pattern.name.toLowerCase());
    for (const expected of ['rock', 'pop', 'funk', 'shuffle', 'balada', 'bossa', 'samba']) {
      expect(names.some((name) => name.includes(expected))).toBe(true);
    }
  });

  it('converte para o payload do motor (D9)', () => {
    const electro = findFactoryDrumPattern('electro');
    expect(electro).toBeDefined();
    const engine = toEngineDrumPattern(electro!);

    expect(engine.stepsPerBar).toBe(16);
    expect(engine.bars).toBe(1);
    expect(engine.tracks?.[0]).toMatchObject({ pad: 0 });
    expect(engine.tracks?.[0].steps?.[0]).toEqual({ on: true, velocity: 118 });
    expect(engine.tracks?.[0].steps?.[1]).toEqual({ on: false, velocity: 100 });
  });
});
