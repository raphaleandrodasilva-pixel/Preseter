import { describe, expect, it } from 'vitest';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION } from '../../shared/constants';
import { buildTemplateConcert, CONCERT_TEMPLATES, listTemplates } from './templates';

describe('concert templates', () => {
  it('lists template summaries without implementation fields', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(3);
    expect(templates.map((template) => template.id)).toEqual(['vazio', 'teclado', 'worship']);
    expect(templates[0]).toMatchObject({
      id: 'vazio',
      name: 'Vazio',
      description: expect.any(String),
    });
    expect(templates[0]).not.toHaveProperty('sets');
    expect(CONCERT_TEMPLATES).toHaveLength(3);
  });

  it('builds an empty concert with the default keyboard layout', () => {
    const file = buildTemplateConcert('vazio');
    expect(file.format).toBe(CONCERT_FILE_FORMAT);
    expect(file.version).toBe(CONCERT_FILE_VERSION);
    expect(file.concert.name).toBe('Meu Concert');
    expect(file.concert.tempo).toBe(120);
    expect(file.sets).toEqual([]);
    expect(file.patches).toEqual([]);
    expect(file.layout.elements.map((element) => element.type)).toEqual([
      'keyboard',
      'pedal',
      'pedal',
      'pedal',
    ]);
  });

  it('builds the keyboard template with one set and three patches in order', () => {
    const file = buildTemplateConcert('teclado');
    expect(file.concert.name).toBe('Meu Concert de Teclado');
    expect(file.sets).toHaveLength(1);
    expect(file.sets[0]).toMatchObject({ name: 'Teclado', order: 0, expanded: true });
    expect(file.patches).toHaveLength(3);
    expect(file.patches.map((patch) => patch.name)).toEqual([
      'Piano',
      'Piano El\u00e9trico',
      'Pads',
    ]);
    expect(file.patches.map((patch) => patch.programNumber)).toEqual([0, 1, 2]);
    expect(file.patches.map((patch) => patch.setOrder)).toEqual([0, 1, 2]);
    expect(file.patches.every((patch) => patch.setId === file.sets[0].id)).toBe(true);
    expect(file.layout.elements.length).toBeGreaterThan(0);
    expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
    expect(file.layout.elements.filter((element) => element.type === 'pedal').length).toBeGreaterThanOrEqual(3);
  });

  it('builds the worship template at 72 BPM', () => {
    const file = buildTemplateConcert('worship');
    expect(file.concert.name).toBe('Meu Concert Worship');
    expect(file.concert.tempo).toBe(72);
    expect(file.patches.map((patch) => patch.name)).toEqual([
      'Pad Suave',
      'Pad Brilhante',
      'Piano Worship',
      'Ambiente',
    ]);
    expect(file.patches.every((patch) => patch.layout.tempo === 72)).toBe(true);
    expect(file.patches[0].notes).toBe('Pad de fundo');
  });

  it('falls back to the empty template for unknown ids', () => {
    const file = buildTemplateConcert('unknown');
    expect(file.concert.name).toBe('Meu Concert');
    expect(file.sets).toEqual([]);
    expect(file.patches).toEqual([]);
  });

  it('creates unique ids across calls', () => {
    const first = buildTemplateConcert('teclado');
    const second = buildTemplateConcert('teclado');
    const firstIds = [first.concert.id, ...first.sets.map((set) => set.id), ...first.patches.map((patch) => patch.id)];
    const secondIds = [second.concert.id, ...second.sets.map((set) => set.id), ...second.patches.map((patch) => patch.id)];
    for (const id of firstIds) expect(secondIds).not.toContain(id);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });
});
