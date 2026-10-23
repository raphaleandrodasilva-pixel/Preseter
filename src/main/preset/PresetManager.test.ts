import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { PresetManager } from './PresetManager';
import { PRESETS_DIR } from '../../shared/constants';
import { createElement, createLayout, createPreset } from '../../test/fixtures';
import { makeTempDir, removeTempDir, writeJson } from '../../test/helpers/temp';

let tempRoot: string;
let userData: string;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  tempRoot = makeTempDir();
  userData = path.join(tempRoot, 'userData');
  vi.mocked(app.getPath).mockImplementation((name) =>
    name === 'userData' ? userData : path.join(tempRoot, name)
  );
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  removeTempDir(tempRoot);
});

function presetsDir(): string {
  return path.join(userData, PRESETS_DIR);
}

describe('PresetManager loading', () => {
  it('creates the presets directory and emits an empty load', () => {
    const manager = new PresetManager();
    const loaded = vi.fn();
    manager.on('loaded', loaded);
    expect(manager.loadPresets()).toEqual([]);
    expect(fs.existsSync(presetsDir())).toBe(true);
    expect(loaded).not.toHaveBeenCalled();
  });

  it('loads every valid JSON preset and skips invalid files', () => {
    const valid = createPreset({ id: 'p1', name: 'Valid', programNumber: 1 });
    writeJson(path.join(presetsDir(), 'p1.json'), valid);
    fs.writeFileSync(path.join(presetsDir(), 'bad.json'), '{', 'utf8');
    fs.writeFileSync(path.join(presetsDir(), 'ignored.txt'), 'x', 'utf8');
    const manager = new PresetManager();
    const loaded = vi.fn();
    manager.on('loaded', loaded);

    expect(manager.loadPresets()).toEqual([valid]);
    expect(manager.getPreset('p1')).toEqual(valid);
    expect(loaded).toHaveBeenCalledWith([valid]);
  });
});

describe('PresetManager CRUD', () => {
  it('creates presets with clamped programs and defaults', () => {
    const manager = new PresetManager();
    const preset = manager.createPreset('Lead', 999, 4);
    expect(preset).toMatchObject({
      name: 'Lead',
      programNumber: 127,
      midiChannel: 4,
      vstStates: {},
      layout: { elements: [], background: null, tempo: 120 },
    });
    expect(preset.id).toMatch(/^preset_/);

    const negative = manager.createPreset('Bass', -10);
    expect(negative.programNumber).toBe(0);
    expect(negative.midiChannel).toBe(0);
  });

  it('saves presets to disk, stamps updatedAt and emits', () => {
    const manager = new PresetManager();
    const preset = createPreset({ id: 'p1', updatedAt: 1 });
    const saved = vi.fn();
    manager.on('saved', saved);

    expect(manager.savePreset(preset)).toBe(true);
    expect(preset.updatedAt).toBeGreaterThan(1);
    expect(fs.existsSync(path.join(presetsDir(), 'p1.json'))).toBe(true);
    expect(manager.getPreset('p1')).toBe(preset);
    expect(saved).toHaveBeenCalledWith(preset);
  });

  it('returns presets sorted by program number', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'two', programNumber: 2 }));
    manager.savePreset(createPreset({ id: 'zero', programNumber: 0 }));
    manager.savePreset(createPreset({ id: 'one', programNumber: 1 }));
    expect(manager.getAllPresets().map((preset) => preset.id)).toEqual(['zero', 'one', 'two']);
  });

  it('finds presets by program number and id', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'p1', programNumber: 5 }));
    expect(manager.findByProgramNumber(5)?.id).toBe('p1');
    expect(manager.findByProgramNumber(6)).toBeUndefined();
    expect(manager.getPreset('missing')).toBeUndefined();
  });

  it('duplicates presets with a default or custom name', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'p1', name: 'Original' }));
    const copy = manager.duplicatePreset('p1');
    expect(copy).toMatchObject({ name: 'Original (Copy)' });
    expect(copy?.id).not.toBe('p1');
    expect(manager.getPreset(copy!.id)).toEqual(copy);

    const custom = manager.duplicatePreset('p1', 'Custom');
    expect(custom?.name).toBe('Custom');
    expect(manager.duplicatePreset('missing')).toBeNull();
  });

  it('deletes presets and their files, returning false for unknown ids', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'p1' }));
    const deleted = vi.fn();
    manager.on('deleted', deleted);
    expect(manager.deletePreset('p1')).toBe(true);
    expect(fs.existsSync(path.join(presetsDir(), 'p1.json'))).toBe(false);
    expect(manager.getPreset('p1')).toBeUndefined();
    expect(deleted).toHaveBeenCalledWith('p1');
    expect(manager.deletePreset('missing')).toBe(false);
  });

  it('updates layouts and VST states', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'p1' }));
    const layoutUpdated = vi.fn();
    const stateSaved = vi.fn();
    manager.on('layout-updated', layoutUpdated);
    manager.on('vst-state-saved', stateSaved);
    const layout = createLayout({ elements: [createElement()], tempo: 99 });
    const states = { layer: { value: 1 } };

    expect(manager.updatePresetLayout('p1', layout)).toBe(true);
    expect(manager.getPreset('p1')?.layout).toBe(layout);
    expect(layoutUpdated).toHaveBeenCalledWith({ presetId: 'p1', layout });

    expect(manager.saveVstState('p1', states)).toBe(true);
    expect(manager.getPreset('p1')?.vstStates).toBe(states);
    expect(stateSaved).toHaveBeenCalledWith({ presetId: 'p1', vstStates: states });

    expect(manager.updatePresetLayout('missing', layout)).toBe(false);
    expect(manager.saveVstState('missing', states)).toBe(false);
  });

  it('adds elements to a preset layout', () => {
    const manager = new PresetManager();
    manager.savePreset(createPreset({ id: 'p1' }));
    const element = createElement({ id: 'new' });
    expect(manager.addElementToPreset('p1', element)).toBe(true);
    expect(manager.getPreset('p1')?.layout.elements).toEqual([element]);
    expect(manager.addElementToPreset('missing', element)).toBe(false);
  });


});
