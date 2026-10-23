import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineParameter, EnginePluginInfo, EngineLoadedPlugin } from '../../shared/engine-protocol';
import type { AudioDeviceSnapshot } from '../../shared/types';
import { VstManager } from './VstManager';
import type { EngineProcess } from './EngineProcess';
import { createAudioDeviceSnapshot, createEngineMixState } from '../../test/fixtures';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

type Handler = (command: string, args: Record<string, unknown>) => unknown;

const DUPLICATE_LAYER =
  'J\u00e1 existe um instrumento com este identificador de layer';

function enginePlugin(overrides: Partial<EngineLoadedPlugin> = {}): EngineLoadedPlugin {
  return {
    layerId: 'layer-1',
    id: 'plugin-1',
    name: 'Test Plugin',
    manufacturer: 'Maker',
    version: '1.0',
    category: 'Synth',
    format: 'VST3',
    path: 'C:/plugins/test.vst3',
    isInstrument: true,
    inputs: 0,
    outputs: 2,
    minNote: 0,
    maxNote: 127,
    pinned: false,
    parameterCount: 1,
    parameterCountTotal: 2,
    ...overrides,
  };
}

function scannedPlugin(overrides: Partial<EnginePluginInfo> = {}): EnginePluginInfo {
  return {
    id: 'scan-plugin-1',
    name: 'Scanned',
    manufacturer: 'Maker',
    version: '1.0',
    category: 'Synth',
    format: 'VST3',
    path: 'C:/plugins/scanned.vst3',
    isInstrument: true,
    inputs: 0,
    outputs: 2,
    ...overrides,
  };
}

function engineParameter(overrides: Partial<EngineParameter> = {}): EngineParameter {
  return {
    index: 0,
    id: 'param-0',
    name: 'Cutoff',
    label: 'Cutoff',
    value: 0.5,
    defaultValue: 0.5,
    text: '50%',
    stepCount: 0,
    automatable: true,
    ...overrides,
  };
}

function devices(running = true): AudioDeviceSnapshot {
  return createAudioDeviceSnapshot({ running });
}

function makeEngine(handler?: Handler): {
  engine: EngineProcess;
  request: ReturnType<typeof vi.fn>;
  emitter: EventEmitter;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    request: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  };
  const request = vi.fn(async (command: string, args: Record<string, unknown>) => {
    if (handler) {
      const result = await handler(command, args);
      if (result !== undefined) return result;
    }
    switch (command) {
      case 'scan':
        return { count: 0, plugins: [], failed: [], blacklisted: [] };
      case 'audioConfiguration':
        return devices(true);
      case 'audioStart':
        return devices(true);
      case 'params':
        return [];
      case 'mix':
      case 'setLayerMix':
      case 'setMasterMix':
      case 'setSend':
      case 'setLayerOutput':
        return createEngineMixState();
      case 'unload':
        return { unloaded: true };
      default:
        return {};
    }
  });
  emitter.request = request;
  emitter.shutdown = vi.fn(async () => undefined);
  return { engine: emitter as unknown as EngineProcess, request, emitter };
}

describe('VstManager scanning', () => {
  it('maps engine plugins to VST info and emits scanned', async () => {
    const { engine } = makeEngine((command) =>
      command === 'scan'
        ? { count: 1, plugins: [scannedPlugin()], failed: [], blacklisted: [] }
        : undefined
    );
    const manager = new VstManager(engine);
    const scanned = vi.fn();
    manager.on('scanned', scanned);

    const plugins = await manager.scanDefaultDirectories();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      id: 'scan-plugin-1',
      name: 'Scanned',
      path: 'C:/plugins/scanned.vst3',
      isLoaded: false,
      isInstrument: true,
      arch: 'unknown',
    });
    expect(manager.getScannedPlugins()).toBe(plugins);
    expect(scanned).toHaveBeenCalledWith(plugins);
  });

  it('returns the same promise for concurrent default scans', async () => {
    let resolveScan: ((value: unknown) => void) | undefined;
    const { engine, request } = makeEngine((command) => {
      if (command === 'scan') {
        return new Promise((resolve) => {
          resolveScan = resolve;
        });
      }
      return undefined;
    });
    const manager = new VstManager(engine);
    const first = manager.scanDefaultDirectories();
    const second = manager.scanDefaultDirectories();
    await vi.waitFor(() => expect(resolveScan).toBeTypeOf('function'));
    resolveScan!({ count: 0, plugins: [], failed: [], blacklisted: [] });
    await Promise.all([first, second]);
    expect(request.mock.calls.filter((call) => call[0] === 'scan')).toHaveLength(1);
  });

  it('waits for an in-flight scan before starting an explicit directory scan', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    let scanCalls = 0;
    const { engine, request } = makeEngine((command) => {
      if (command !== 'scan') return undefined;
      scanCalls += 1;
      if (scanCalls === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return { count: 0, plugins: [], failed: [], blacklisted: [] };
    });
    const manager = new VstManager(engine);
    const first = manager.scanDefaultDirectories();
    await vi.waitFor(() => expect(resolveFirst).toBeTypeOf('function'));
    const second = manager.scanDirectories(['C:/custom']);
    resolveFirst!({ count: 0, plugins: [], failed: [], blacklisted: [] });
    await Promise.all([first, second]);
    const scanRequests = request.mock.calls.filter((call) => call[0] === 'scan');
    expect(scanRequests).toHaveLength(2);
    expect(scanRequests[1][1]).toMatchObject({ paths: ['C:/custom'], rescan: false });
  });
});

describe('VstManager loading', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tempRoot);
  });

  it('loads a plugin by path, prepares audio and parameters, and caches it', async () => {
    const parameter = engineParameter();
    const { engine, request } = makeEngine((command) => {
      if (command === 'load') return enginePlugin({ minNote: 10, maxNote: 90, pinned: true });
      if (command === 'params') return [parameter];
      return undefined;
    });
    const manager = new VstManager(engine);
    const loaded = vi.fn();
    manager.on('plugin-loaded', loaded);

    const plugin = await manager.loadPlugin('C:/plugins/test.vst3', 'layer-1', 10, 90, true);

    expect(plugin).toMatchObject({
      id: 'plugin-1',
      layerId: 'layer-1',
      name: 'Test Plugin',
      isLoaded: true,
      pinned: true,
      minNote: 10,
      maxNote: 90,
      parameters: [expect.objectContaining({ id: '0', name: 'Cutoff', value: 0.5 })],
    });
    expect(request).toHaveBeenCalledWith(
      'load',
      { path: 'C:/plugins/test.vst3', layerId: 'layer-1', minNote: 10, maxNote: 90, pinned: true },
      60_000
    );
    expect(request).toHaveBeenCalledWith('params', { layerId: 'layer-1' });
    expect(manager.getLoadedPlugins()).toEqual([plugin]);
    expect(loaded).toHaveBeenCalledWith(plugin);
  });

  it('uses the scanned plugin id and starts audio when needed', async () => {
    const { engine, request } = makeEngine((command, args) => {
      if (command === 'scan') return { count: 1, plugins: [scannedPlugin()], failed: [], blacklisted: [] };
      if (command === 'load') return enginePlugin({ path: String(args.path ?? 'C:/plugins/scanned.vst3') });
      if (command === 'audioConfiguration') return devices(false);
      if (command === 'audioStart') return devices(true);
      if (command === 'params') return [engineParameter()];
      return undefined;
    });
    const manager = new VstManager(engine);
    await manager.scanDefaultDirectories();
    await manager.loadPlugin('scan-plugin-1', 'layer-2');

    expect(request).toHaveBeenCalledWith('load', expect.objectContaining({ plugin: 'scan-plugin-1' }), 60_000);
    expect(request).toHaveBeenCalledWith('audioStart', { outputs: 2, inputs: 0 });
  });

  it('rejects 32-bit plugins on a 64-bit host', async () => {
    const exePath = path.join(tempRoot, 'x86.vst3');
    const buffer = Buffer.alloc(0x1000);
    buffer.write('MZ', 0, 'ascii');
    buffer.writeUInt32LE(0x40, 0x3c);
    buffer.write('PE\u0000\u0000', 0x40, 'ascii');
    buffer.writeUInt16LE(0x014c, 0x44);
    fs.writeFileSync(exePath, buffer);
    const { engine } = makeEngine((command) =>
      command === 'scan'
        ? { count: 1, plugins: [scannedPlugin({ path: exePath })], failed: [], blacklisted: [] }
        : undefined
    );
    const manager = new VstManager(engine);
    await manager.scanDefaultDirectories();
    expect(manager.getScannedPlugins()[0].arch).toBe('x86');
    await expect(manager.loadPlugin(exePath, 'layer-1')).rejects.toThrow(/32-bit/);
  });

  it('retries a duplicate layer by unloading the previous instance', async () => {
    let loadAttempts = 0;
    const { engine, request } = makeEngine((command, args) => {
      if (command === 'load') {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new Error(DUPLICATE_LAYER);
        return enginePlugin({ layerId: String(args.layerId) });
      }
      if (command === 'unload') return { unloaded: true };
      return undefined;
    });
    const manager = new VstManager(engine);
    const plugin = await manager.loadPlugin('C:/plugins/test.vst3', 'layer-1');
    expect(plugin.layerId).toBe('layer-1');
    expect(loadAttempts).toBe(2);
    expect(request).toHaveBeenCalledWith('unload', { layerId: 'layer-1' });
  });

  it('refuses to replace an already pinned layer', async () => {
    let loadAttempts = 0;
    const { engine } = makeEngine((command, args) => {
      if (command === 'load') {
        loadAttempts += 1;
        if (loadAttempts === 2) throw new Error(DUPLICATE_LAYER);
        return enginePlugin({ layerId: String(args.layerId), pinned: true });
      }
      return undefined;
    });
    const manager = new VstManager(engine);
    await manager.loadPlugin('C:/plugins/test.vst3', 'layer-1');
    await expect(manager.loadPlugin('C:/plugins/test.vst3', 'layer-1')).rejects.toThrow(DUPLICATE_LAYER);
    expect(loadAttempts).toBe(2);
  });

  it('unloads the layer and reports a preparation failure when audio setup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { engine, request } = makeEngine((command) => {
      if (command === 'load') return enginePlugin();
      if (command === 'audioConfiguration') throw new Error('audio down');
      if (command === 'unload') throw new Error('unload failed');
      return undefined;
    });
    const manager = new VstManager(engine);
    await expect(manager.loadPlugin('C:/plugins/test.vst3', 'layer-1')).rejects.toThrow(
      /preparar.*audio down/
    );
    expect(request).toHaveBeenCalledWith('unload', { layerId: 'layer-1' });
    expect(manager.getLoadedPlugins()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stages a load without committing the patch', async () => {
    const { engine, request } = makeEngine((command) => {
      if (command === 'stageLoad') return enginePlugin();
      return undefined;
    });
    const manager = new VstManager(engine);
    await manager.stageLoad('C:/plugins/test.vst3', 'layer-1');
    expect(request).toHaveBeenCalledWith(
      'stageLoad',
      { path: 'C:/plugins/test.vst3', layerId: 'layer-1', minNote: 0, maxNote: 127, pinned: false },
      60_000
    );
  });

  it('commits a patch swap and drops layers that are no longer active', async () => {
    const { engine } = makeEngine((command) => {
      if (command === 'load') return enginePlugin();
      if (command === 'commitPatchSwap') return { active: ['layer-1'], lingering: [] };
      return undefined;
    });
    const manager = new VstManager(engine);
    await manager.loadPlugin('C:/plugins/test.vst3', 'layer-1');
    const unloaded = vi.fn();
    manager.on('plugin-unloaded', unloaded);

    const result = await manager.commitPatchSwap(true);
    expect(result).toEqual({ active: ['layer-1'], lingering: [] });
    expect(manager.getLoadedPlugins()).toHaveLength(1);
    expect(unloaded).not.toHaveBeenCalled();
  });

  it('removes stale layers after a patch swap', async () => {
    let loadedId = 0;
    const { engine } = makeEngine((command, args) => {
      if (command === 'load') {
        loadedId += 1;
        return enginePlugin({ id: `plugin-${loadedId}`, layerId: String(args.layerId) });
      }
      if (command === 'commitPatchSwap') {
        return { active: ['layer-1'], lingering: ['layer-2'] };
      }
      return undefined;
    });
    const manager = new VstManager(engine);
    await manager.loadPlugin('C:/plugins/a.vst3', 'layer-1');
    await manager.loadPlugin('C:/plugins/b.vst3', 'layer-2');
    const unloaded = vi.fn();
    manager.on('plugin-unloaded', unloaded);
    await manager.commitPatchSwap(false);
    expect(manager.getLoadedPlugins().map((plugin) => plugin.layerId)).toEqual(['layer-1']);
    expect(unloaded).toHaveBeenCalledWith('layer-2');
  });
});

describe('VstManager plugin operations', () => {
  async function loadedManager(handler?: Handler) {
    const made = makeEngine((command, args) => {
      if (command === 'load') return enginePlugin({ layerId: String(args.layerId) });
      if (command === 'params') return [engineParameter()];
      if (handler) return handler(command, args);
      return undefined;
    });
    const manager = new VstManager(made.engine);
    await manager.loadPlugin('C:/plugins/test.vst3', 'layer-1');
    return { manager, ...made };
  }

  it('updates parameters and emits the change', async () => {
    const { manager, request } = await loadedManager((command) =>
      command === 'setParam'
        ? engineParameter({ value: 0.8 })
        : undefined
    );
    const changed = vi.fn();
    manager.on('parameter-changed', changed);
    expect(await manager.setParameter('layer-1', '0', 0.8)).toBe(true);
    expect(request).toHaveBeenCalledWith('setParam', { layerId: 'layer-1', index: 0, value: 0.8 });
    expect(manager.getLoadedPlugins()[0].parameters[0].value).toBe(0.8);
    expect(changed).toHaveBeenCalledWith({
      pluginId: 'plugin-1',
      layerId: 'layer-1',
      paramId: '0',
      value: 0.8,
    });
    expect(await manager.setParameter('layer-1', 'bad', 0.1)).toBe(false);
    expect(await manager.setParameter('missing', '0', 0.1)).toBe(false);
  });

  it('accepts param_ prefixes for parameter ids', async () => {
    const { manager } = await loadedManager((command) =>
      command === 'setParam' ? engineParameter({ value: 0.2 }) : undefined
    );
    expect(await manager.setParameter('plugin-1', 'param_0', 0.2)).toBe(true);
  });

  it('updates layer note and velocity ranges', async () => {
    const { manager } = await loadedManager((command) => {
      if (command === 'setLayerRange') return enginePlugin({ minNote: 12, maxNote: 80 });
      return undefined;
    });
    const ranged = await manager.setLayerRange('layer-1', 12, 80);
    expect(ranged).toMatchObject({ minNote: 12, maxNote: 80 });
    const velocity = await manager.setLayerVelocityRange('layer-1', 20, 100);
    expect(velocity).toMatchObject({ velocityMin: 20, velocityMax: 100 });
    await expect(manager.setLayerRange('missing', 0, 1)).rejects.toThrow(/n.*carregado/);
    await expect(manager.setLayerVelocityRange('missing', 0, 1)).rejects.toThrow(/n.*carregado/);
  });

  it('gets and sets complete plugin state', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'getState') return { layerId: 'layer-1', data: 'chunk' };
      if (command === 'setState') return { layerId: 'layer-1', bytes: 5 };
      return undefined;
    });
    expect(await manager.getPluginState('layer-1')).toEqual({
      data: 'chunk',
      parameters: { '0': 0.5 },
      bypass: false,
    });
    expect(await manager.getPluginState('missing')).toBeNull();
    expect(await manager.setPluginState('layer-1', { data: 'chunk' })).toBe(true);
    expect(request).toHaveBeenCalledWith('setState', { layerId: 'layer-1', data: 'chunk' });

    expect(await manager.setPluginState('layer-1', {})).toBe(true);
    expect(await manager.setPluginState('layer-1', { parameters: {} })).toBe(true);
    expect(await manager.setPluginState('layer-1', { parameters: { '0': 0.9 } })).toBe(true);
    expect(request).toHaveBeenCalledWith('setParam', { layerId: 'layer-1', index: 0, value: 0.9 });
    expect(await manager.setPluginState('missing', { data: 'x' })).toBe(false);
  });

  it('rejects invalid plugin states', async () => {
    const { manager } = await loadedManager();
    await expect(manager.setPluginState('layer-1', null)).rejects.toThrow(/objeto/);
    await expect(manager.setPluginState('layer-1', { bypass: true })).rejects.toThrow(/bypass/);
    await expect(manager.setPluginState('layer-1', { parameters: 'bad' })).rejects.toThrow(/objeto/);
    await expect(manager.setPluginState('layer-1', { parameters: { bad: 1 } })).rejects.toThrow(
      /Par.*metro inv/
    );
    await expect(manager.setPluginState('layer-1', { parameters: { '0': Number.NaN } })).rejects.toThrow(
      /Par.*metro inv/
    );
  });

  it('changes plugin programs and preset files, refreshing parameters', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'setProgram') return enginePlugin({ program: 3 });
      if (command === 'setPresetFile') return enginePlugin({ program: 4 });
      return undefined;
    });
    const loaded = vi.fn();
    manager.on('plugin-loaded', loaded);
    expect(await manager.setPluginProgram('layer-1', 3)).toBe(true);
    expect(await manager.setPluginPresetFile('layer-1', 'C:/preset.vstpreset')).toBe(true);
    expect(request).toHaveBeenCalledWith('setProgram', { layerId: 'layer-1', index: 3 });
    expect(request).toHaveBeenCalledWith('setPresetFile', {
      layerId: 'layer-1',
      path: 'C:/preset.vstpreset',
    });
    expect(manager.getLoadedPlugins()[0].program).toBe(4);
    expect(loaded).toHaveBeenCalledTimes(2);
    expect(await manager.setPluginProgram('missing', 1)).toBe(false);
    expect(await manager.setPluginPresetFile('missing', 'x')).toBe(false);
  });

  it('applies raw states', async () => {
    const { manager, request } = await loadedManager();
    expect(await manager.applyRawState('plugin-1', 'base64')).toBe(true);
    expect(request).toHaveBeenCalledWith('setState', { layerId: 'layer-1', data: 'base64' });
    expect(await manager.applyRawState('missing', 'base64')).toBe(false);
  });

  it('opens and closes editors and reports engine state', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'openEditor') return { open: true };
      if (command === 'closeEditor') return { open: false };
      return undefined;
    });
    expect(await manager.openPluginEditor('layer-1')).toBe(true);
    expect(await manager.closePluginEditor('layer-1')).toBe(true);
    expect(request).toHaveBeenCalledWith('openEditor', { layerId: 'layer-1' });
    expect(request).toHaveBeenCalledWith('closeEditor', { layerId: 'layer-1' });
    expect(await manager.openPluginEditor('missing')).toBe(false);
    expect(await manager.closePluginEditor('missing')).toBe(false);
  });

  it('unloads plugins by layer or plugin id', async () => {
    const { manager } = await loadedManager();
    expect(await manager.unloadPlugin('missing')).toBe(false);
    expect(await manager.unloadPlugin('plugin-1')).toBe(true);
    expect(manager.getLoadedPlugins()).toEqual([]);
  });

  it('returns false when the engine declines an unload', async () => {
    const { manager } = await loadedManager((command) =>
      command === 'unload' ? { unloaded: false } : undefined
    );
    expect(await manager.unloadPlugin('layer-1')).toBe(false);
  });

  it('forwards audio, MIDI, clock, mix, bus and recording operations', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'recordStart') return { recording: true };
      if (command === 'playbackLoad') return { loaded: true, playing: false, path: 'a.wav' };
      if (command === 'playbackPlay') return { loaded: true, playing: true, path: 'a.wav' };
      if (command === 'playbackStop') return { loaded: true, playing: false, path: 'a.wav' };
      if (command === 'playbackState') return { loaded: true, playing: false, path: 'a.wav' };
      if (command === 'middleware') return {};
      return undefined;
    });

    expect(await manager.setTranspose(2)).toBe(true);
    expect(await manager.setAudioInput({ volumeDb: -6 })).toEqual({});
    expect(await manager.getAudioInputState()).toEqual({});
    expect(await manager.setMidiThru([{ type: 'cc', channel: 0, number: 1 }])).toBe(true);
    expect(await manager.setHostClock(120, 4, 4, true)).toBe(true);
    expect(await manager.setMetronome(true, -12, true)).toBe(true);
    expect(await manager.startRecording('out.wav')).toBe(true);
    expect(await manager.stopRecording()).toBe(true);
    expect(await manager.loadPlayback('a.wav')).toMatchObject({ loaded: true });
    expect(await manager.playPlayback()).toMatchObject({ playing: true });
    expect(await manager.stopPlayback()).toMatchObject({ playing: false });
    expect(await manager.getPlaybackState()).toMatchObject({ loaded: true });
    expect(await manager.setPanLaw(-3, true)).toBe(true);
    expect(await manager.sendMidi([0x90, 60, 100])).toBe(true);
    expect(await manager.panic()).toBe(true);
    expect(await manager.getMixState()).toEqual(createEngineMixState());
    expect(await manager.setLayerMix('layer-1', { volumeDb: -6 })).toEqual(createEngineMixState());
    expect(await manager.setMasterMix({ muted: true })).toEqual(createEngineMixState());
    expect(await manager.getBuses()).toEqual({});
    expect(await manager.setBusMix('aux1', { pan: 1 })).toEqual({});
    expect(await manager.setSend('layer-1', 1, -6)).toEqual(createEngineMixState());
    expect(await manager.setLayerOutput('layer-1', 2)).toEqual(createEngineMixState());
    expect(await manager.stopAudio()).toBeUndefined();
    expect(await manager.shutdown()).toBeUndefined();
    expect(request).toHaveBeenCalledWith('setTranspose', { semitones: 2 });
    expect(request).toHaveBeenCalledWith('setPanLaw', { db: -3, compensated: true });
    expect(request).toHaveBeenCalledWith('midi', { bytes: [0x90, 60, 100] });
  });

  it('does not send MIDI when no plugin is loaded', async () => {
    const { engine, request } = makeEngine();
    const manager = new VstManager(engine);
    expect(await manager.sendMidi([0x90, 60, 100])).toBe(false);
    expect(request).not.toHaveBeenCalledWith('midi', expect.anything());
  });

  it('manages inserts and insert editors/state', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'setInsert') return { layerId: 'layer-1', slot: 0, loaded: true };
      if (command === 'removeInsert') return { layerId: 'layer-1', slot: 0, loaded: false };
      if (command === 'setInsertBypass') return { layerId: 'layer-1', slot: 0, bypass: true };
      if (command === 'inserts') return [];
      if (command === 'getState') return { layerId: 'layer-1', data: 'insert-state' };
      if (command === 'setState') return { layerId: 'layer-1', bytes: 1 };
      if (command === 'openEditor') return { open: true };
      if (command === 'closeEditor') return { open: false };
      return undefined;
    });

    expect(await manager.setInsert('layer-1', 0, 'C:/fx.vst3', true)).toMatchObject({ loaded: true });
    expect(await manager.removeInsert('layer-1', 0)).toMatchObject({ loaded: false });
    expect(await manager.setInsertBypass('layer-1', 0, true)).toMatchObject({ bypass: true });
    expect(await manager.getInserts('layer-1')).toEqual([]);
    expect(await manager.getInsertState('layer-1', 0)).toEqual({ data: 'insert-state' });
    expect(await manager.setInsertState('layer-1', 0, 'insert-state')).toBe(true);
    expect(await manager.openInsertEditor('layer-1', 0)).toBe(true);
    expect(await manager.closeInsertEditor('layer-1', 0)).toBe(true);
    expect(request).toHaveBeenCalledWith('setInsert', {
      layerId: 'layer-1',
      slot: 0,
      path: 'C:/fx.vst3',
      bypass: true,
    }, 60_000);
  });

  it('returns null when insert state cannot be read', async () => {
    const { manager } = await loadedManager((command) => {
      if (command === 'getState') throw new Error('not loaded');
      return undefined;
    });
    expect(await manager.getInsertState('layer-1', 0)).toBeNull();
  });

  it('reports scanned plugin programs', async () => {
    const { manager, request } = await loadedManager((command) => {
      if (command === 'pluginPrograms') {
        return { programs: [{ index: 0, name: 'Init' }], current: 0, count: 1 };
      }
      return undefined;
    });
    await expect(manager.scanPluginPrograms('C:/plugins/test.vst3')).resolves.toEqual({
      programs: [{ index: 0, name: 'Init' }],
      current: 0,
      count: 1,
    });
    expect(request).toHaveBeenCalledWith(
      'pluginPrograms',
      { path: 'C:/plugins/test.vst3' },
      60_000
    );
  });

  it('clears loaded plugins and emits engine-crashed', () => {
    const { engine, emitter } = makeEngine();
    const manager = new VstManager(engine);
    const crashed = vi.fn();
    manager.on('engine-crashed', crashed);
    emitter.emit('crashed', new Error('boom'));
    expect(crashed).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(manager.getLoadedPlugins()).toEqual([]);
  });
});
