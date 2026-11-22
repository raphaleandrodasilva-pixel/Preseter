import { describe, expect, it } from 'vitest';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION } from '../../shared/constants';
import { buildTemplateConcert, CONCERT_TEMPLATES, listTemplates } from './templates';

describe('concert templates', () => {
  it('lists template summaries without implementation fields', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(7);
    expect(templates.map((template) => template.id)).toEqual([
      'vazio',
      'teclado',
      'worship',
      'show-10',
      'guitarra',
      'fullset',
      'midi-externo',
    ]);
    expect(templates[0]).toMatchObject({
      id: 'vazio',
      name: 'Vazio',
      description: expect.any(String),
    });
    expect(templates[0]).not.toHaveProperty('sets');
    expect(CONCERT_TEMPLATES).toHaveLength(7);
  });

  it('builds the 10-song show template with one set per song', () => {
    const file = buildTemplateConcert('show-10');
    expect(file.concert.name).toBe('Meu Show — 10 Músicas');
    expect(file.sets).toHaveLength(10);
    expect(file.sets.map((set) => set.name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `${String(index + 1).padStart(2, '0')} — Música ${index + 1}`)
    );
    expect(file.sets.map((set) => set.order)).toEqual(Array.from({ length: 10 }, (_, index) => index));
    expect(file.patches).toHaveLength(30);
    expect(file.patches.map((patch) => patch.programNumber)).toEqual(
      Array.from({ length: 30 }, (_, index) => index)
    );

    for (const set of file.sets) {
      const patches = file.patches.filter((patch) => patch.setId === set.id);
      expect(patches.map((patch) => patch.name)).toEqual(['Intro', 'Verso', 'Refrão']);
      expect(patches.map((patch) => patch.setOrder)).toEqual([0, 1, 2]);
      for (const patch of patches) {
        const types = patch.layout.elements.map((element) => element.type);
        expect(types).toContain('keyboard');
        expect(types).toContain('midi-activity');
        const ids = patch.layout.elements.map((element) => element.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(patch.plugins).toEqual([]);
      }
    }
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
      'fader',
      'knob',
      'midi-activity',
      'label',
      'knob',
      'knob',
      'knob',
      'knob',
      'keyboard',
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
    expect(file.patches.map((patch) => patch.icon)).toEqual(['piano', 'epiano', 'pad']);
    expect(file.patches.map((patch) => patch.setOrder)).toEqual([0, 1, 2]);
    expect(file.patches.every((patch) => patch.setId === file.sets[0].id)).toBe(true);
    expect(file.layout.elements.length).toBeGreaterThan(0);
    expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
    expect(file.layout.elements.filter((element) => element.type === 'pedal').length).toBeGreaterThanOrEqual(2);
  });

  it('carrega instrumentos nativos e layouts próprios nos templates', () => {
    const file = buildTemplateConcert('teclado');
    expect(file.patches.map((patch) => patch.plugins?.[0]?.pluginId)).toEqual([
      'preseter.piano',
      'preseter.tines',
      'preseter.jx',
    ]);
    expect(file.patches[0].layout.elements.find((element) => element.type === 'keyboard'))
      .toMatchObject({ keyboardLow: 21, keyboardHigh: 108 });

    const electric = file.patches[1];
    expect(electric.layout.elements.some(
      (element) => element.paramOwner === 'piano-eletrico:layer:0'
    )).toBe(true);

    const guitar = buildTemplateConcert('guitarra').patches[0];
    expect(guitar.plugins).toEqual([]);
    expect(guitar.layout.elements.some(
      (element) => element.paramOwner === 'patch' && element.paramSlot !== undefined
    )).toBe(true);
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
    expect(file.patches.map((patch) => patch.icon)).toEqual(['pad', 'pad-bright', 'piano', 'generic']);
  });

  it('builds the guitar template with the Guitarix master chain', () => {
    const file = buildTemplateConcert('guitarra');
    expect(file.concert.name).toBe('Meu Concert de Guitarra');
    expect(file.sets.map((set) => set.name)).toEqual(['Guitarra']);
    expect(file.patches.map((patch) => patch.name)).toEqual([
      'Guitarra Clean',
      'Guitarra Crunch',
      'Guitarra Lead',
    ]);

    const [clean, crunch, lead] = file.patches;
    expect(clean.master?.inserts.map((insert) => insert.path)).toEqual([
      'http://guitarix.sourceforge.net/plugins/gx_studiopre#studiopre',
      'http://guitarix.sourceforge.net/plugins/gx_cabinet#CABINET',
      'http://guitarix.sourceforge.net/plugins/gx_tremolo#_tremolo',
    ]);
    expect(clean.master?.inserts.map((insert) => insert.presetId)).toEqual(['bright', 'open', 'subtle']);
    expect(crunch.master?.inserts.map((insert) => insert.presetId)).toEqual(['crunch', 'crunch']);
    expect(lead.master?.inserts.map((insert) => insert.presetId)).toEqual(['lead', 'lead']);
    expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
  });

  it('builds the MIDI external template with one set, one patch and keyboard', () => {
    const file = buildTemplateConcert('midi-externo');
    expect(file.concert.name).toBe('Meu Concert MIDI');
    expect(file.sets).toHaveLength(1);
    expect(file.sets[0]).toMatchObject({ name: 'Externo', order: 0, expanded: true });
    expect(file.patches).toHaveLength(1);
    expect(file.patches[0]).toMatchObject({
      name: 'MIDI externo',
      notes: 'Timbre MIDI externo',
      programNumber: 0,
      plugins: [],
    });
    expect(file.patches[0].setId).toBe(file.sets[0].id);
    expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
  });

  it('builds the full set template with 8 sets and 40 patches', () => {
    const file = buildTemplateConcert('fullset');
    expect(file.concert.name).toBe('Full Set — 40 Patches');
    expect(file.sets.map((set) => set.name)).toEqual([
      'Pianos',
      'Teclas elétricas',
      'Órgãos',
      'Cordas e orquestra',
      'Pads',
      'Leads e sintetizadores',
      'Baixos',
      'Layers e splits',
    ]);
    expect(file.patches).toHaveLength(40);
    expect(file.patches.map((patch) => patch.programNumber)).toEqual(
      Array.from({ length: 40 }, (_, index) => index)
    );
    expect(file.patches.every((patch) => patch.plugins?.length === 0)).toBe(true);
    expect(file.patches.every((patch) => patch.notes)).toBe(true);
    expect(file.layout.elements.some((element) => element.type === 'keyboard')).toBe(true);
    expect(file.layout.elements.filter((element) => element.patchSendAux !== undefined).map((element) => element.patchSendAux))
      .toEqual([1, 2, 3, 4]);
    expect(file.patches[0].notes).toContain('MuseScore_General');
    expect(file.patches[33].name).toBe('Split Baixo + Piano');
    expect(file.patches[33].notes).toContain('(0–59)');
    expect(file.patches[33].notes).toContain('(60–127)');
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
