import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';

type Handler = (event: unknown, ...args: any[]) => any;

let handlers: Map<string, Handler>;

function call(channel: string, ...args: unknown[]): any {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Handler not registered: ${channel}`);
  return handler({}, ...args);
}

beforeAll(async () => {
  // Evita que o bootstrap agende o engine e abra processos reais.
  vi.stubGlobal('setImmediate', vi.fn());
  await import('./index');
  await new Promise((resolve) => setTimeout(resolve, 0));

  handlers = new Map(
    (ipcMain.handle as unknown as { mock: { calls: Array<[string, Handler]> } }).mock.calls
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('main process IPC wiring', () => {
  it('registers the complete renderer contract', () => {
    expect(handlers.size).toBe(84);
    for (const channel of [
      'get-app-version',
      'midi-program-change',
      'vst-scan',
      'vst-presets-list',
      'engine-midi',
      'audio-settings-get',
      'preferences-get',
      'preset-list',
      'concert-get',
      'layout-change',
      'app-status-get',
      'ui-element-add',
      'open-plugin-dialog',
    ]) {
      expect(handlers.has(channel), channel).toBe(true);
    }
  });

  it('serves safe read-only state before any concert is opened', async () => {
    expect(call('preset-list')).toEqual([]);
    expect(call('vst-list')).toEqual([]);
    expect(call('vst-loaded')).toEqual([]);
    expect(call('concert-recent')).toEqual([]);
    expect(call('vst-presets-list')).toMatchObject({
      presets: [],
      status: { scanning: false, scanned: 0, total: 0 },
    });
    expect(call('concert-get')).toMatchObject({ name: expect.any(String) });
    expect(call('app-status-get')).toMatchObject({ tempo: 120 });
    expect(call('preferences-get')).toMatchObject({
      pluginFolders: expect.any(Array),
    });
    expect(call('concert-templates').length).toBeGreaterThan(0);
  });

  it('validates and acknowledges MIDI program changes', async () => {
    await expect(call('midi-program-change', 0, 0)).resolves.toMatchObject({
      program: 0,
      channel: 0,
      activated: false,
    });
    await expect(call('midi-input-program-change', 1, 15)).resolves.toBe(false);
    await expect(call('midi-program-change', 128, 0)).rejects.toThrow(/entre 0 e 127/);
    await expect(call('midi-program-change', 0, 16)).rejects.toThrow(/entre 0 e 15/);
  });

  it('merges app status changes and reports them back', () => {
    expect(call('app-status-change', { tempo: 140, isMetronomeOn: true })).toMatchObject({
      tempo: 140,
      isMetronomeOn: true,
    });
    expect(call('app-status-get')).toMatchObject({
      tempo: 140,
      isMetronomeOn: true,
    });
  });
});
