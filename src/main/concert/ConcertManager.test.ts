import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { ConcertManager } from './ConcertManager';
import { createEmptyConcertFile, serializeConcertFile } from './ConcertFile';
import type { ConcertSyncPayload } from '../../shared/types';
import { createConcertSettings, createPreset, createSet } from '../../test/fixtures';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

let userData: string;
let tempRoot: string;

function useUserData(): void {
  vi.mocked(app.getPath).mockImplementation((name) =>
    name === 'userData' ? userData : path.join(tempRoot, name)
  );
}

beforeEach(() => {
  tempRoot = makeTempDir();
  userData = path.join(tempRoot, 'userData');
  useUserData();
});

afterEach(() => {
  removeTempDir(tempRoot);
});

function manager(): ConcertManager {
  return new ConcertManager();
}

function syncPayload(overrides: Partial<ConcertSyncPayload> = {}): ConcertSyncPayload {
  const state = manager().getState();
  return {
    name: state.name,
    tempo: state.tempo,
    sets: state.sets,
    settings: state.settings,
    strips: state.strips,
    layout: state.layout,
    mappings: state.mappings,
    patches: state.patches,
    ...overrides,
  };
}

describe('ConcertManager lifecycle', () => {
  it('starts with a clean empty concert and no session', () => {
    const concert = manager();
    expect(concert.getState()).toMatchObject({
      path: null,
      name: 'Meu Concert',
      tempo: 120,
      sets: [],
      patches: [],
      dirty: false,
      strips: [],
      mappings: [],
      lastPatchId: null,
    });
    expect(concert.getSessionConcertPath()).toBeNull();
    expect(concert.getRecent()).toEqual([]);
  });

  it('creates empty and keyboard template concerts', () => {
    const concert = manager();
    const changed = vi.fn();
    concert.on('changed', changed);

    const empty = concert.newConcert();
    expect(empty.name).toBe('Meu Concert');
    expect(empty.layout.elements.length).toBeGreaterThan(0);

    const keyboard = concert.newConcert('teclado');
    expect(keyboard.name).toBe('Meu Concert de Teclado');
    expect(keyboard.sets).toHaveLength(1);
    expect(keyboard.patches).toHaveLength(3);
    expect(keyboard.patches[0]).toMatchObject({ name: 'Piano', setId: keyboard.sets[0].id });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('opens a concert from disk, remembers it and marks it clean', () => {
    const filePath = path.join(tempRoot, 'show.preseter');
    fs.writeFileSync(filePath, serializeConcertFile(createEmptyConcertFile('Show')), 'utf8');
    const concert = manager();
    const changed = vi.fn();
    const recentChanged = vi.fn();
    concert.on('changed', changed);
    concert.on('recent-changed', recentChanged);

    const state = concert.openFromPath(filePath);

    expect(state.path).toBe(filePath);
    expect(state.name).toBe('Show');
    expect(state.dirty).toBe(false);
    expect(concert.getSessionConcertPath()).toBe(filePath);
    expect(concert.getRecent()[0]).toMatchObject({ path: filePath, name: 'Show' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(recentChanged).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(userData, 'recent-concerts.json'))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'session.json'))).toBe(true);
  });

  it('rejects an invalid concert file and does not replace the current one', () => {
    const filePath = path.join(tempRoot, 'bad.preseter');
    fs.writeFileSync(filePath, 'not json', 'utf8');
    const concert = manager();
    const before = concert.getState();

    expect(() => concert.openFromPath(filePath)).toThrow(/JSON/);
    expect(concert.getState()).toEqual(before);
  });

  it('saves to a new path and clears the dirty flag', () => {
    const concert = manager();
    concert.applyEditors({ ...syncPayload(), name: 'Dirty' });
    expect(concert.isDirty()).toBe(true);

    const filePath = path.join(tempRoot, 'nested', 'saved.preseter');
    const state = concert.saveTo(filePath);

    expect(state.path).toBe(filePath);
    expect(state.dirty).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.concert.name).toBe('Dirty');
    expect(saved.format).toBe('preseter.concert');
    expect(concert.getRecent()[0].path).toBe(filePath);
  });

  it('requires a path before saving a new concert', () => {
    expect(() => manager().saveTo()).toThrow(/ainda.*arquivo/);
  });

  it('remembers recent concerts and session state across instances', () => {
    const first = manager();
    const firstPath = path.join(tempRoot, 'first.preseter');
    first.saveTo(firstPath);
    first.setLastPatchId('patch-1');

    const second = manager();
    expect(second.getRecent().map((item) => item.path)).toEqual([firstPath]);
    expect(second.getSessionConcertPath()).toBe(firstPath);
    expect(second.getLastPatchId()).toBe('patch-1');
  });

  it('ignores invalid recent/session files and tolerates write failures', () => {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, 'recent-concerts.json'), 'not json', 'utf8');
    fs.writeFileSync(path.join(userData, 'session.json'), JSON.stringify({ concertPath: 3, lastPatchId: 4 }), 'utf8');
    const concert = manager();
    expect(concert.getRecent()).toEqual([]);
    expect(concert.getSessionConcertPath()).toBeNull();
    expect(concert.getLastPatchId()).toBeNull();
  });

  it('migrates legacy data and starts dirty', () => {
    const concert = manager();
    const state = concert.migrateLegacy(
      [
        createPreset({
          id: 'p',
          layout: {
            elements: [
              {
                id: 'x',
                type: 'knob',
                label: 'X',
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                color: '#fff',
                minValue: 0,
                maxValue: 1,
                orientation: 'vertical',
                isMomentary: false,
                pluginId: 'plugin',
              },
            ],
            background: null,
            tempo: 100,
          },
        }),
      ],
      { sets: [createSet()], name: 'Legacy', tempo: 100 }
    );

    expect(state.name).toBe('Legacy');
    expect(state.tempo).toBe(100);
    expect(state.patches).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });
});

describe('ConcertManager editing', () => {
  it('applies editor changes, updates timestamps and emits once', () => {
    const concert = manager();
    const changed = vi.fn();
    concert.on('changed', changed);
    const state = concert.getState();

    const changedState = concert.applyEditors({
      ...syncPayload(),
      name: 'Edited',
      tempo: 140,
      sets: [createSet()],
      settings: createConcertSettings({ notes: 'changed' }),
      strips: [{ id: 's', name: 'S', pluginId: 'p', path: 'p', role: 'instrument' }],
      layout: { ...state.layout, background: 'b.png' },
      mappings: [{ id: 'm', source: { type: 'cc', channel: 0, controllerNumber: 1 } }],
    });

    expect(changedState).toBe(true);
    const stateAfter = concert.getState();
    expect(stateAfter.name).toBe('Edited');
    expect(stateAfter.tempo).toBe(140);
    expect(stateAfter.sets).toHaveLength(1);
    expect(stateAfter.settings.notes).toBe('changed');
    expect(stateAfter.strips).toHaveLength(1);
    expect(stateAfter.layout.background).toBe('b.png');
    expect(stateAfter.mappings).toHaveLength(1);
    expect(stateAfter.dirty).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('returns false when the payload is unchanged and ignores missing optional fields', () => {
    const concert = manager();
    const changed = vi.fn();
    concert.on('changed', changed);
    const state = concert.getState();
    const payload: ConcertSyncPayload = {
      name: state.name,
      tempo: state.tempo,
      sets: state.sets,
      settings: state.settings,
      strips: state.strips,
      layout: state.layout,
      mappings: state.mappings,
      patches: state.patches,
    };
    expect(concert.applyEditors(payload)).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it('adds, updates and deletes patches', () => {
    const concert = manager();
    const preset = createPreset({ id: 'p1', programNumber: 2 });
    expect(concert.upsertPatch(preset)).toBe(true);
    expect(concert.getPresets()[0]).toBe(preset);
    expect(concert.upsertPatch({ ...preset })).toBe(false);
    expect(concert.upsertPatch({ ...preset, name: 'Updated' })).toBe(true);
    expect(concert.getPreset('p1')?.name).toBe('Updated');
    expect(concert.findByProgramNumber(2)?.id).toBe('p1');
    expect(concert.deletePatch('missing')).toBe(false);
    expect(concert.deletePatch('p1')).toBe(true);
    expect(concert.getPreset('p1')).toBeUndefined();
  });

  it('clears the last patch when the active patch is deleted', () => {
    const concert = manager();
    concert.upsertPatch(createPreset({ id: 'p1' }));
    concert.setLastPatchId('p1');
    expect(concert.getLastPatchId()).toBe('p1');
    concert.deletePatch('p1');
    expect(concert.getLastPatchId()).toBeNull();
  });

  it('duplicates existing patches and rejects unknown ids', () => {
    const concert = manager();
    concert.upsertPatch(createPreset({ id: 'p1', name: 'Original' }));
    const copy = concert.duplicatePreset('p1');
    expect(copy).toMatchObject({ name: 'Original (c\u00f3pia)' });
    expect(copy?.id).not.toBe('p1');
    expect(concert.getPreset(copy!.id)).toEqual(copy);
    expect(concert.duplicatePreset('missing')).toBeNull();
  });

  it('adds sets by replacing an existing id', () => {
    const concert = manager();
    const first = createSet({ id: 's1', name: 'One' });
    const second = createSet({ id: 's2', name: 'Two' });
    concert.addSet(first);
    concert.addSet(second);
    expect(concert.getSet('s1')).toEqual(first);
    expect(concert.getSet('s2')).toEqual(second);
    const replacement = createSet({ id: 's1', name: 'One replaced' });
    concert.addSet(replacement);
    expect(concert.getSet('s1')).toEqual(replacement);
    expect(concert.getSet('')).toBeUndefined();
    expect(concert.getSet('missing')).toBeUndefined();
  });

  it('does not rewrite the session when the last patch id is unchanged', () => {
    const concert = manager();
    concert.setLastPatchId('p1');
    const sessionPath = path.join(userData, 'session.json');
    const before = fs.statSync(sessionPath).mtimeMs;
    concert.setLastPatchId('p1');
    expect(fs.statSync(sessionPath).mtimeMs).toBe(before);
  });

  it('builds the persisted document from the current state', () => {
    const concert = manager();
    concert.upsertPatch(createPreset({ id: 'p1' }));
    const document = concert.buildDocument();
    expect(document.format).toBe('preseter.concert');
    expect(document.patches).toHaveLength(1);
    expect(document.concert.name).toBe('Meu Concert');
  });
});
