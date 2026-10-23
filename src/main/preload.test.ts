import * as fs from 'node:fs';
import * as vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

/**
 * O preload roda em um contexto isolado no Electron e não exporta símbolos.
 * Compilamos o arquivo e o executamos em `vm` com um `require('electron')` falso
 * para verificar o contrato real exposto ao renderer.
 */
function loadPreload(): {
  api: Record<string, (...args: any[]) => any>;
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  expose: ReturnType<typeof vi.fn>;
} {
  const sourcePath = fileURLToPath(new URL('./preload.ts', import.meta.url));
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const invoke = vi.fn(async (...args: unknown[]) => args);
  const on = vi.fn();
  const expose = vi.fn();
  const module = { exports: {} as Record<string, unknown> };
  const sandbox = {
    require: (name: string) => {
      if (name !== 'electron') throw new Error(`Unexpected require: ${name}`);
      return {
        contextBridge: { exposeInMainWorld: expose },
        ipcRenderer: { invoke, on },
      };
    },
    module,
    exports: module.exports,
    console,
  };

  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  expect(expose).toHaveBeenCalledWith('electronAPI', expect.any(Object));
  const api = expose.mock.calls[0][1] as Record<string, (...args: any[]) => any>;
  return { api, invoke, on, expose };
}

describe('preload electronAPI', () => {
  it('exposes every documented channel and forwards arguments', () => {
    const { api, invoke } = loadPreload();
    expect(Object.keys(api).length).toBeGreaterThan(60);

    const checks: Array<[string, unknown[], string, unknown[]]> = [
      ['getAppVersion', [], 'get-app-version', []],
      ['midiProgramChange', [12, 3], 'midi-program-change', [12, 3]],
      [
        'midiInputProgramChange',
        [12, 3, 2, 'Keys'],
        'midi-input-program-change',
        [12, 3, 2, 'Keys'],
      ],
      [
        'vstLoad',
        ['C:/p.vst3', 'layer', 0, 127, true],
        'vst-load',
        ['C:/p.vst3', 'layer', 0, 127, true],
      ],
      [
        'vstPresetSaveSnapshot',
        [{ layerId: 'l', name: 'N' }],
        'vst-presets-snapshot',
        [{ layerId: 'l', name: 'N' }],
      ],
      ['presetFindByProgram', [4], 'preset-by-program', [4]],
      ['concertSave', [true], 'concert-save', [true]],
      ['windowSetFullscreen', [true], 'window-set-fullscreen', [true]],
      ['engineMidi', [[0x90, 60, 100]], 'engine-midi', [[0x90, 60, 100]]],
      ['midiThruSet', [{ channel: 1 }], 'midi-thru-set', [{ channel: 1 }]],
    ];

    for (const [name, args, channel, expected] of checks) {
      invoke.mockClear();
      api[name](...args);
      expect(invoke).toHaveBeenCalledWith(channel, ...expected);
    }
  });

  it('covers all invoke wrappers and event subscriptions', () => {
    const { api, invoke, on } = loadPreload();

    for (const [name, method] of Object.entries(api)) {
      if (name.startsWith('on')) continue;
      invoke.mockClear();
      method('a', 'b', 'c', 'd', 'e');
      expect(invoke, name).toHaveBeenCalledTimes(1);
      expect(typeof invoke.mock.calls[0][0], name).toBe('string');
    }

    for (const [name, method] of Object.entries(api)) {
      if (!name.startsWith('on')) continue;
      on.mockClear();
      const callback = vi.fn();
      method(callback);
      expect(on, name).toHaveBeenCalledTimes(1);
      const [channel, listener] = on.mock.calls[0];
      expect(typeof channel, name).toBe('string');
      listener({}, { marker: name });
      expect(callback, name).toHaveBeenCalledWith(
        name === 'onPluginUnloaded' ? '[object Object]' : { marker: name }
      );
    }
  });

  it('maps event names to renderer-safe payloads', () => {
    const { api, on } = loadPreload();
    const cases: Array<[string, string]> = [
      ['onMidiProgramChange', 'midi-program-change'],
      ['onMidiControlChange', 'midi-control-change'],
      ['onNoteOn', 'midi-note-on'],
      ['onNoteOff', 'midi-note-off'],
      ['onAppStatusChange', 'app-status-change'],
      ['onPresetList', 'preset-list'],
      ['onPresetLoaded', 'preset-loaded'],
      ['onLayoutChange', 'layout-change'],
      ['onVstScanned', 'vst-scanned'],
      ['onVstPresetsUpdated', 'vst-presets-updated'],
      ['onPluginLoaded', 'plugin-loaded'],
      ['onPluginUnloaded', 'plugin-unloaded'],
      ['onParameterChanged', 'parameter-changed'],
      ['onEngineCrashed', 'engine-crashed'],
      ['onEngineRecovered', 'engine-recovered'],
      ['onMenuAction', 'menu-action'],
    ];

    for (const [name, channel] of cases) {
      on.mockClear();
      api[name](vi.fn());
      expect(on).toHaveBeenCalledWith(channel, expect.any(Function));
    }
  });

  it('stringifies plugin ids for onPluginUnloaded', () => {
    const { api, on } = loadPreload();
    const callback = vi.fn();
    api.onPluginUnloaded(callback);
    const listener = on.mock.calls[0][1] as (event: unknown, id: unknown) => void;
    listener({}, 42);
    expect(callback).toHaveBeenCalledWith('42');
  });
});
