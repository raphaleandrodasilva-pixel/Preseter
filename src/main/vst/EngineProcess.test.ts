import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineProcess } from './EngineProcess';

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  createInterface: vi.fn(),
  existsSync: vi.fn(),
  readline: null as EventEmitter | null,
  emitReady: true,
}));

vi.mock('child_process', () => ({ spawn: state.spawn }));
vi.mock('readline', () => ({ createInterface: state.createInterface }));
vi.mock('fs', () => ({ existsSync: state.existsSync }));

interface FakeChild extends EventEmitter {
  stdin: {
    writable: boolean;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
}

function createChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.exitCode = 1;
  });
  child.stdin = {
    writable: true,
    write: vi.fn((_data: string, callback?: (error?: Error | null) => void) => {
      callback?.(null);
      return true;
    }),
    end: vi.fn(() => {
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
      });
    }),
  };
  return child;
}

const originalResourcesPath = process.resourcesPath;
const originalEngineEnv = process.env.PRESETER_ENGINE;
let child: FakeChild;

beforeAll(() => {
  (process as unknown as { resourcesPath: string }).resourcesPath = 'C:/resources';
});

afterAll(() => {
  (process as unknown as { resourcesPath: string }).resourcesPath = originalResourcesPath;
  if (originalEngineEnv === undefined) delete process.env.PRESETER_ENGINE;
  else process.env.PRESETER_ENGINE = originalEngineEnv;
});

beforeEach(() => {
  child = createChild();
  state.spawn.mockReset();
  state.spawn.mockReturnValue(child);
  state.existsSync.mockReset();
  state.existsSync.mockImplementation(
    (candidate: string) => candidate === 'C:/engine/PreseterEngine.exe'
  );
  process.env.PRESETER_ENGINE = 'C:/engine/PreseterEngine.exe';
  state.emitReady = true;
  state.readline = child.stdout;
  state.createInterface.mockReset();
  state.createInterface.mockImplementation(({ input }: { input: EventEmitter }) => {
    state.readline = input;
    if (state.emitReady) {
      queueMicrotask(() => input.emit('line', JSON.stringify({ event: 'ready' })));
    }
    return input;
  });
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function lastRequest(): { id: number; cmd: string } {
  const call = child.stdin.write.mock.calls.at(-1);
  if (!call) throw new Error('no write');
  return JSON.parse(call[0] as string);
}

function respond(id: number, message: Record<string, unknown>): void {
  child.stdout.emit('line', JSON.stringify({ id, ...message }));
}

describe('EngineProcess startup and requests', () => {
  it('fails clearly when the engine executable cannot be found', async () => {
    state.existsSync.mockReturnValue(false);
    delete process.env.PRESETER_ENGINE;
    const engine = new EngineProcess();
    await expect(engine.request('mix', {})).rejects.toThrow(/PreseterEngine/);
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it('spawns the explicit engine, writes JSON and resolves a response', async () => {
    const engine = new EngineProcess();
    const promise = engine.request('mix', {});
    await tick();
    const request = lastRequest();
    expect(request.cmd).toBe('mix');
    expect(state.spawn).toHaveBeenCalledWith(
      'C:/engine/PreseterEngine.exe',
      [],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    );
    respond(request.id, { ok: true, result: { layers: [] } });
    await expect(promise).resolves.toEqual({ layers: [] });
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('reuses a running child for subsequent requests', async () => {
    const engine = new EngineProcess();
    const first = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: true, result: {} });
    await first;

    const second = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: true, result: { layers: ['a'] } });
    await expect(second).resolves.toEqual({ layers: ['a'] });
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('ignores non-JSON output, scan progress and unknown responses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const engine = new EngineProcess();
    const promise = engine.request('mix', {});
    await tick();
    child.stdout.emit('line', 'not json');
    child.stdout.emit('line', JSON.stringify({ event: 'scan-progress' }));
    child.stdout.emit('line', JSON.stringify({ ok: true, result: {} }));
    child.stdout.emit('line', JSON.stringify({ id: 999, ok: true, result: {} }));
    respond(lastRequest().id, { ok: true, result: { layers: [] } });
    await expect(promise).resolves.toEqual({ layers: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects when the engine returns an error or an error without detail', async () => {
    const engine = new EngineProcess();
    const withMessage = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: false, error: 'engine says no' });
    await expect(withMessage).rejects.toThrow('engine says no');

    const withoutMessage = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: false });
    await expect(withoutMessage).rejects.toThrow(/sem detalhe/);
  });

  it('times out a request that receives no response', async () => {
    const engine = new EngineProcess();
    await expect(engine.request('mix', {}, 5)).rejects.toThrow(/Tempo esgotado/);
  });

  it('rejects when stdin is not writable', async () => {
    const engine = new EngineProcess();
    child.stdin.writable = false;
    await expect(engine.request('mix', {})).rejects.toThrow(/n.*dispon/);
  });

  it('rejects when the stdin write reports an error', async () => {
    const engine = new EngineProcess();
    child.stdin.write.mockImplementation((_data: string, callback?: (error?: Error | null) => void) => {
      callback?.(new Error('write failed'));
      return false;
    });
    await expect(engine.request('mix', {})).rejects.toThrow('write failed');
  });
});

describe('EngineProcess lifecycle', () => {
  it('rejects pending requests and emits crashed when a ready engine exits', async () => {
    const engine = new EngineProcess();
    const crashed = vi.fn();
    engine.on('crashed', crashed);
    const promise = engine.request('mix', {});
    await tick();

    child.exitCode = 1;
    child.emit('exit', 1, null);

    await expect(promise).rejects.toThrow(/encerrou/);
    expect(crashed).toHaveBeenCalledTimes(1);
    expect(crashed.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('does not emit crashed when startup fails before ready', async () => {
    state.emitReady = false;
    const engine = new EngineProcess();
    const crashed = vi.fn();
    engine.on('crashed', crashed);
    const promise = engine.request('mix', {}, 10);

    child.emit('exit', 1, null);
    await expect(promise).rejects.toThrow(/encerrou/);
    expect(crashed).not.toHaveBeenCalled();
  });

  it('shuts down the child and is idempotent', async () => {
    const engine = new EngineProcess();
    const promise = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: true, result: {} });
    await promise;

    const first = engine.shutdown();
    const second = engine.shutdown();
    await Promise.all([first, second]);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('kills a child that does not exit after stdin closes', async () => {
    const engine = new EngineProcess();
    const first = engine.request('mix', {});
    await tick();
    respond(lastRequest().id, { ok: true, result: {} });
    await first;
    child.stdin.end.mockImplementation(() => undefined);
    const shutdown = engine.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await shutdown;
    expect(child.kill).toHaveBeenCalled();
  }, 5000);

  it('does nothing when shutdown is called before startup', async () => {
    const engine = new EngineProcess();
    await expect(engine.shutdown()).resolves.toBeUndefined();
    expect(state.spawn).not.toHaveBeenCalled();
  });
});
