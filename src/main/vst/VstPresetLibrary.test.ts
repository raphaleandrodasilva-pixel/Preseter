import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VstPluginInfo } from '@shared/types';
import { VstPresetLibrary } from './VstPresetLibrary';
import type { VstManager } from './VstManager';
import { createPluginInfo } from '../../test/fixtures';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

function fakeVst(overrides: Partial<Record<keyof VstManager, unknown>> = {}): VstManager {
  return {
    scanPluginPrograms: vi.fn(async () => ({ programs: [] })),
    getPluginState: vi.fn(async () => null),
    setPluginProgram: vi.fn(async () => true),
    setPluginPresetFile: vi.fn(async () => true),
    setVst2FxpFile: vi.fn(async () => true),
    applyRawState: vi.fn(async () => true),
    ...overrides,
  } as unknown as VstManager;
}

function instrument(overrides: Partial<VstPluginInfo> = {}): VstPluginInfo {
  return createPluginInfo({ isInstrument: true, ...overrides });
}

function writeFile(filePath: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('VstPresetLibrary indexing', () => {
  let userData: string;
  let documents: string;

  beforeEach(() => {
    userData = makeTempDir('preseter-vst-library-');
    documents = makeTempDir('preseter-vst-documents-');
  });

  afterEach(() => {
    removeTempDir(userData);
    removeTempDir(documents);
  });

  function library(): VstPresetLibrary {
    return new VstPresetLibrary(userData, documents);
  }

  it('starts empty when no index exists and persists scans', async () => {
    const lib = library();
    expect(lib.getStatus()).toEqual({ scanning: false, scanned: 0, total: 0 });
    expect(lib.listResult()).toEqual({
      presets: [],
      status: { scanning: false, scanned: 0, total: 0 },
    });

    const plugin = instrument({ id: 'p1', name: 'Piano' });
    const vst = fakeVst({
      scanPluginPrograms: vi.fn(async () => ({
        programs: [
          { index: 0, name: 'Grand Piano' },
          { index: 1, name: 'Bright Lead' },
        ],
      })),
    });
    await lib.scan([plugin], vst);

    expect(vst.scanPluginPrograms).toHaveBeenCalledWith('p1');
    expect(lib.getStatus()).toMatchObject({ scanning: false, scanned: 1, total: 1 });
    expect(lib.listResult().presets).toHaveLength(2);
    expect(lib.listResult().presets[0]).toMatchObject({
      id: 'program:p1:0',
      name: 'Grand Piano',
      category: 'Piano',
      source: 'program',
      pluginId: 'p1',
      pluginName: 'Piano',
      pluginPath: 'C:/plugins/test.vst3',
      programIndex: 0,
      collection: 'Piano',
      favorite: false,
    });
    expect(lib.listResult().presets[1].category).toBe('Piano');

    const persisted = JSON.parse(
      fs.readFileSync(path.join(userData, 'vst-presets.json'), 'utf8')
    );
    expect(persisted.lastScan).toBeTypeOf('number');
    expect(persisted.plugins.p1.programCount).toBe(2);
    expect(persisted.presets).toHaveLength(2);
  });

  it('loads an existing index and tolerates corrupt data', () => {
    fs.writeFileSync(
      path.join(userData, 'vst-presets.json'),
      JSON.stringify({
        version: 1,
        plugins: {},
        presets: [{ id: 'snapshot:one', source: 'snapshot' }],
        overrides: {},
      })
    );
    expect(library().listResult().presets).toHaveLength(1);

    fs.writeFileSync(path.join(userData, 'vst-presets.json'), '{bad');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(library().listResult().presets).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('reuses cached programs unless forced or the plugin changed', async () => {
    const plugin = instrument({ id: 'p1', name: 'Piano', version: '1.0' });
    const first = vi.fn(async () => ({ programs: [{ index: 0, name: 'One' }] }));
    const lib = library();
    const vst = fakeVst({ scanPluginPrograms: first });
    await lib.scan([plugin], vst);
    expect(first).toHaveBeenCalledTimes(1);

    await lib.scan([plugin], vst);
    expect(first).toHaveBeenCalledTimes(1);
    expect(lib.listResult().presets).toHaveLength(1);

    await lib.scan([{ ...plugin, version: '2.0' }], vst);
    expect(first).toHaveBeenCalledTimes(2);

    await lib.scan([{ ...plugin, version: '2.0' }], vst, true);
    expect(first).toHaveBeenCalledTimes(3);
  });

  it('removes programs for plugins that are gone and non-instruments', async () => {
    const lib = library();
    const vst = fakeVst({
      scanPluginPrograms: vi.fn(async () => ({
        programs: [{ index: 0, name: 'One' }],
      })),
    });
    await lib.scan([instrument({ id: 'p1' }), instrument({ id: 'p2' })], vst);
    expect(lib.listResult().presets).toHaveLength(2);

    await lib.scan([instrument({ id: 'p2' }), instrument({ id: 'fx', isInstrument: false })], vst);
    expect(lib.listResult().presets.map((preset) => preset.pluginId)).toEqual(['p2']);
    expect(vst.scanPluginPrograms).toHaveBeenCalledTimes(2);
  });

  it('keeps scanning after a plugin program failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lib = library();
    const vst = fakeVst({
      scanPluginPrograms: vi.fn(async (id: string) => {
        if (id === 'bad') throw new Error('no programs');
        return { programs: [{ index: 0, name: 'Good' }] };
      }),
    });
    await lib.scan(
      [instrument({ id: 'bad', name: 'Bad Plug' }), instrument({ id: 'good' })],
      vst
    );

    expect(lib.getStatus()).toMatchObject({ scanning: false, scanned: 2, total: 2 });
    expect(lib.listResult().presets).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Bad Plug'),
      expect.any(Error)
    );
  });

  it('shares one in-flight scan', async () => {
    const lib = library();
    let resolve: ((value: { programs: Array<{ index: number; name: string }> }) => void) | undefined;
    const pending = new Promise<{ programs: Array<{ index: number; name: string }> }>(
      (done) => {
        resolve = done;
      }
    );
    const scan = vi.fn(() => pending);
    const vst = fakeVst({ scanPluginPrograms: scan });

    const first = lib.scan([instrument({ id: 'p1' })], vst);
    const second = lib.scan([instrument({ id: 'p1' })], vst);
    await vi.waitFor(() => expect(scan).toHaveBeenCalled());
    resolve?.({ programs: [] });
    await Promise.all([first, second]);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('indexes .vstpreset files using the containing plugin folder', async () => {
    const plugin = instrument({ id: 'piano', name: 'Piano', path: 'C:/piano.vst3' });
    writeFile(path.join(documents, 'VST3 Presets', 'Piano', 'Warm.vstpreset'));
    writeFile(path.join(documents, 'VST3 Presets', 'Other', 'Thing.vstpreset'));
    writeFile(path.join(documents, 'VST3 Presets', 'Other', 'note.txt'));

    const lib = library();
    await lib.scan([plugin], fakeVst());
    const presets = lib.listResult().presets;

    expect(presets).toHaveLength(2);
    expect(presets.find((preset) => preset.name === 'Warm')).toMatchObject({
      source: 'vstpreset',
      pluginId: 'piano',
      pluginName: 'Piano',
      collection: 'Piano',
      category: 'Piano',
    });
    expect(presets.find((preset) => preset.name === 'Thing')).toMatchObject({
      pluginId: '',
      pluginName: 'Other',
      collection: 'Other',
      category: 'Outros',
    });
  });

  it('indexes .fxp files from Documents/Preseter/Presets', async () => {
    const plugin = instrument({ id: 'piano', name: 'Piano', path: 'C:/piano.dll', format: 'VST' });
    const file = path.join(documents, 'Preseter', 'Presets', 'Piano', 'Warm.fxp');
    writeFile(file);

    const lib = library();
    await lib.scan([plugin], fakeVst());
    const preset = lib.listResult().presets.find((item) => item.source === 'fxp');

    expect(preset).toMatchObject({
      source: 'fxp',
      name: 'Warm',
      pluginId: 'piano',
      pluginName: 'Piano',
      collection: 'Piano',
      filePath: file,
    });
  });

  it('drops only sources that no longer exist', () => {
    const fxpFile = path.join(documents, 'Preseter', 'Presets', 'Piano', 'One.fxp');
    writeFile(fxpFile);
    fs.writeFileSync(
      path.join(userData, 'vst-presets.json'),
      JSON.stringify({
        version: 1,
        plugins: {},
        presets: [
          { id: 'program:one', source: 'program', pluginId: 'p1' },
          { id: 'snapshot:one', source: 'snapshot' },
          { id: 'fxp:one', source: 'fxp', filePath: fxpFile },
          { id: 'vital:one', source: 'vital' },
          { id: 'odin:one', source: 'odin' },
          { id: 'midi-program:one', source: 'midi-program' },
        ],
        overrides: {},
      })
    );

    const lib = library();
    expect(lib.listResult().presets.map((preset) => preset.id)).toEqual([
      'program:one',
      'snapshot:one',
      'fxp:one',
    ]);
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'vst-presets.json'), 'utf8'));
    expect(saved.presets.map((preset: { id: string }) => preset.id)).toEqual([
      'program:one',
      'snapshot:one',
      'fxp:one',
    ]);
  });

  it('hides file presets whose files disappeared but keeps snapshots', async () => {    const lib = library();
    const stateDir = path.join(userData, 'vst-presets');
    const stateFile = path.join(stateDir, 'states', 's.bin');
    writeFile(stateFile);
    const index = {
      version: 1,
      plugins: {},
      presets: [
        { id: 'vstpreset:gone', source: 'vstpreset', filePath: path.join(userData, 'gone.vstpreset') },
        { id: 'vital:gone', source: 'vital', filePath: path.join(userData, 'gone.vital') },
        { id: 'snapshot:one', source: 'snapshot', stateFile: 's.bin' },
      ],
      overrides: {},
    };
    fs.writeFileSync(path.join(userData, 'vst-presets.json'), JSON.stringify(index));
    expect(library().listResult().presets.map((preset) => preset.id)).toEqual([
      'snapshot:one',
    ]);
    expect(fs.existsSync(stateFile)).toBe(true);
  });
});

describe('VstPresetLibrary snapshots and presets', () => {
  let userData: string;
  let documents: string;
  let lib: VstPresetLibrary;

  beforeEach(() => {
    userData = makeTempDir('preseter-vst-library-');
    documents = makeTempDir('preseter-vst-documents-');
    lib = new VstPresetLibrary(userData, documents);
  });

  afterEach(() => {
    removeTempDir(userData);
    removeTempDir(documents);
  });

  it('saves a snapshot state and returns the preset', async () => {
    const plugin = instrument({ id: 'p1', name: 'Piano' });
    const vst = fakeVst({
      getPluginState: vi.fn(async () => ({ data: Buffer.from('hello').toString('base64') })),
    });

    const preset = await lib.saveSnapshot({
      layerId: 'layer',
      plugin,
      name: '  My sound  ',
      vst,
    });
    expect(preset).toMatchObject({
      name: 'My sound',
      category: 'Piano',
      source: 'snapshot',
      pluginId: 'p1',
      collection: 'Meus presets',
      favorite: true,
    });
    expect(preset?.stateFile).toBeTypeOf('string');
    expect(
      fs.readFileSync(path.join(userData, 'vst-presets', 'states', preset!.stateFile!), 'utf8')
    ).toBe('hello');
    expect(lib.listResult().presets).toHaveLength(1);
  });

  it('imports .vstpreset files into the plugin folder and avoids overwriting', () => {
    const plugin = instrument({ id: 'p1', name: 'Piano' });
    const source = path.join(documents, 'externo', 'Warm.vstpreset');
    writeFile(source);

    const preset = lib.importPresetFile(source, plugin);
    const destination = path.join(documents, 'VST3 Presets', 'Piano', 'Warm.vstpreset');
    expect(fs.existsSync(destination)).toBe(true);
    expect(preset).toMatchObject({
      name: 'Warm',
      source: 'vstpreset',
      pluginId: 'p1',
      pluginName: 'Piano',
      filePath: destination,
      collection: 'Importados',
    });
    expect(lib.listResult().presets.some((item) => item.id === preset.id)).toBe(true);

    const second = lib.importPresetFile(source, plugin);
    expect(second.name).toBe('Warm (2)');
    expect(second.filePath).toBe(path.join(documents, 'VST3 Presets', 'Piano', 'Warm (2).vstpreset'));
  });

  it('rejects importing files that are not .vstpreset', () => {
    const source = path.join(documents, 'externo', 'Patch.fxp');
    writeFile(source);
    expect(() => lib.importPresetFile(source, instrument())).toThrow(/vstpreset/);
    expect(() =>
      lib.importPresetFile(path.join(documents, 'externo', 'missing.vstpreset'), instrument())
    ).toThrow(/encontrado/);
  });

  it('uses defaults for snapshot name and category', async () => {
    const plugin = instrument({ id: 'p1', name: 'Unknown Box' });
    const vst = fakeVst({
      getPluginState: vi.fn(async () => ({ data: 'AA==' })),
    });
    const preset = await lib.saveSnapshot({ layerId: 'l', plugin, name: '  ', vst });
    expect(preset?.name).toBe('Novo preset');
    expect(preset?.category).toBe('Outros');

    const custom = await lib.saveSnapshot({
      layerId: 'l',
      plugin,
      name: 'Custom',
      category: 'My category',
      vst,
    });
    expect(custom?.category).toBe('My category');
  });

  it('returns null when state is missing or cannot be written', async () => {
    const plugin = instrument();
    expect(
      await lib.saveSnapshot({ layerId: 'l', plugin, name: 'x', vst: fakeVst() })
    ).toBeNull();

    fs.mkdirSync(path.join(userData, 'vst-presets'), { recursive: true });
    fs.writeFileSync(path.join(userData, 'vst-presets', 'states'), 'not a directory');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const vst = fakeVst({ getPluginState: vi.fn(async () => ({ data: 'AA==' })) });
    expect(
      await lib.saveSnapshot({ layerId: 'l', plugin, name: 'x', vst })
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  async function presetOfType(
    type: 'program' | 'vstpreset' | 'snapshot' | 'fxp'
  ): Promise<string> {
    const plugin = instrument({ id: 'p1', name: 'Piano' });
    if (type === 'program') {
      await lib.scan(
        [plugin],
        fakeVst({
          scanPluginPrograms: vi.fn(async () => ({
            programs: [{ index: 7, name: 'Program' }],
          })),
        })
      );
      return lib.listResult().presets[0].id;
    }
    if (type === 'vstpreset') {
      const file = path.join(documents, 'VST3 Presets', 'Piano', 'P.vstpreset');
      writeFile(file);
      await lib.scan([plugin], fakeVst());
      return `vstpreset:${file}`;
    }
    if (type === 'fxp') {
      const file = path.join(documents, 'Preseter', 'Presets', 'Piano', 'P.fxp');
      writeFile(file);
      await lib.scan([plugin], fakeVst());
      return `fxp:${file}`;
    }
    const preset = await lib.saveSnapshot({
      layerId: 'l',
      plugin,
      name: 'Snapshot',
      vst: fakeVst({ getPluginState: vi.fn(async () => ({ data: 'AA==' })) }),
    });
    return preset!.id;
  }

  it('applies program, vstpreset, fxp and snapshot presets', async () => {
    const program = await presetOfType('program');
    const vst = fakeVst();
    expect(await lib.applyPreset(program, 'layer', vst)).toBe(true);
    expect(vst.setPluginProgram).toHaveBeenCalledWith('layer', 7);

    const filePreset = await presetOfType('vstpreset');
    expect(await lib.applyPreset(filePreset, 'layer', vst)).toBe(true);
    expect(vst.setPluginPresetFile).toHaveBeenCalledWith(
      'layer',
      path.join(documents, 'VST3 Presets', 'Piano', 'P.vstpreset')
    );

    const fxpPreset = await presetOfType('fxp');
    expect(await lib.applyPreset(fxpPreset, 'layer', vst)).toBe(true);
    expect(vst.setVst2FxpFile).toHaveBeenCalledWith(
      'layer',
      path.join(documents, 'Preseter', 'Presets', 'Piano', 'P.fxp')
    );

    const snapshot = await presetOfType('snapshot');
    expect(await lib.applyPreset(snapshot, 'layer', vst)).toBe(true);
    expect(vst.applyRawState).toHaveBeenCalledWith('layer', expect.any(String));
  });

  it('rejects unsupported or incomplete presets', async () => {
    await expect(lib.applyPreset('missing', 'l', fakeVst())).rejects.toThrow(/encontrado/);
    fs.writeFileSync(
      path.join(userData, 'vst-presets.json'),
      JSON.stringify({
        version: 1,
        plugins: {},
        presets: [
          { id: 'p:program', source: 'program' },
          { id: 'p:vstpreset', source: 'vstpreset' },
          { id: 'p:snapshot', source: 'snapshot' },
          { id: 'p:fxp', source: 'fxp' },
        ],
        overrides: {},
      })
    );
    lib = new VstPresetLibrary(userData, documents);
    await expect(lib.applyPreset('p:program', 'l', fakeVst())).rejects.toThrow(/Programa/);
    await expect(lib.applyPreset('p:vstpreset', 'l', fakeVst())).rejects.toThrow(/Arquivo/);
    await expect(lib.applyPreset('p:snapshot', 'l', fakeVst())).rejects.toThrow(/Estado/);
    await expect(lib.applyPreset('p:fxp', 'l', fakeVst())).rejects.toThrow(/Arquivo/);
  });

  it('reports a snapshot whose state file is missing or keeps it in sync', async () => {
    const snapshot = await presetOfType('snapshot');
    const preset = lib.listResult().presets.find((item) => item.id === snapshot)!;
    fs.rmSync(path.join(userData, 'vst-presets', 'states', preset.stateFile!));
    await expect(lib.applyPreset(snapshot, 'l', fakeVst())).rejects.toThrow(/n.*o existe/i);
  });

  it('updates category and favorite overrides, including after a rescan', async () => {
    const plugin = instrument({ id: 'p1', name: 'Piano' });
    const vst = fakeVst({
      scanPluginPrograms: vi.fn(async () => ({
        programs: [{ index: 0, name: 'One' }],
      })),
    });
    await lib.scan([plugin], vst);
    const id = lib.listResult().presets[0].id;

    expect(lib.updatePreset('missing', { favorite: true })).toBeNull();
    const updated = lib.updatePreset(id, { category: 'Custom', favorite: true });
    expect(updated).toMatchObject({ category: 'Custom', favorite: true });
    expect(lib.listResult().presets[0]).toMatchObject({
      category: 'Custom',
      favorite: true,
    });

    await lib.scan([plugin], vst, true);
    expect(lib.listResult().presets[0]).toMatchObject({
      category: 'Custom',
      favorite: true,
    });
  });

  it('deletes an .fxp file from disk and from the index', async () => {
    const id = await presetOfType('fxp');
    const preset = lib.listResult().presets.find((item) => item.id === id)!;
    const file = preset.filePath!;
    expect(fs.existsSync(file)).toBe(true);

    expect(lib.deletePreset(id)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(lib.listResult().presets.some((item) => item.id === id)).toBe(false);
  });

  it('deletes presets, state files and overrides', async () => {
    const snapshot = await presetOfType('snapshot');
    const preset = lib.listResult().presets.find((item) => item.id === snapshot)!;
    const statePath = path.join(userData, 'vst-presets', 'states', preset.stateFile!);
    expect(fs.existsSync(statePath)).toBe(true);

    expect(lib.deletePreset('missing')).toBe(false);
    expect(lib.deletePreset(snapshot)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(false);
    expect(lib.listResult().presets).toEqual([]);
  });
});
