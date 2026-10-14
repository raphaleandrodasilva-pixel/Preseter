import { app } from 'electron';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';
import type { EngineCommandName, EngineCommands } from '../../shared/engine-protocol';

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class EngineProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private startup: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;

  async request<K extends EngineCommandName>(
    command: K,
    args: EngineCommands[K]['args'],
    timeoutMs = 20_000
  ): Promise<EngineCommands[K]['result']> {
    await this.start();
    const child = this.child;
    if (!child || !child.stdin.writable) {
      throw new Error('O processo do engine JUCE não está disponível.');
    }

    const id = this.nextId++;
    return new Promise<EngineCommands[K]['result']>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo esgotado ao executar "${command}" no engine JUCE.`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (result) => resolve(result as EngineCommands[K]['result']),
        reject,
        timeout,
      });

      try {
        child.stdin.write(`${JSON.stringify({ id, cmd: command, ...args })}\n`, (error) => {
          if (!error) return;
          const pending = this.pending.get(id);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(id);
          pending.reject(error);
        });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async shutdown(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child) return;

    this.stopping = (async () => {
      child.stdin.end();
      if (child.exitCode === null) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2_000);
          child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      if (child.exitCode === null) child.kill();
      this.child = null;
      this.startup = null;
    })();

    return this.stopping;
  }

  private async start(): Promise<void> {
    if (this.child && this.child.exitCode === null) {
      if (this.startup) await this.startup;
      return;
    }
    if (this.startup) return this.startup;

    const enginePath = this.findEngine();
    if (!enginePath) {
      throw new Error(
        'Não encontrei PreseterEngine. Compile o engine com CMake e Visual Studio 2022; ' +
          'em desenvolvimento, o executável esperado fica em engine/build/PreseterEngine_artefacts/Release.'
      );
    }

    const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;

    this.startup = new Promise<void>((resolve, reject) => {
      let ready = false;
      const readyTimeout = setTimeout(() => {
        if (ready) return;
        const error = new Error('O engine JUCE não enviou o evento ready em 10 segundos.');
        this.failPending(error);
        child.kill();
        reject(error);
      }, 10_000);

      createInterface({ input: child.stdout }).on('line', (line) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          console.warn('[Preseter] Saída não JSON do engine:', line);
          return;
        }

        if (message.event === 'ready') {
          ready = true;
          clearTimeout(readyTimeout);
          resolve();
          return;
        }
        if (message.event === 'scan-progress') return;

        const id = message.id;
        if (typeof id !== 'number') return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        if (message.ok === true) pending.resolve(message.result);
        else pending.reject(new Error(typeof message.error === 'string' ? message.error : 'Erro sem detalhe retornado pelo engine.'));
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const output = chunk.toString().trim();
        if (output) console.warn(`[Preseter engine] ${output}`);
      });

      child.on('error', (error) => {
        clearTimeout(readyTimeout);
        this.failPending(error);
        if (!ready) reject(error);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(readyTimeout);
        this.child = null;
        const error = new Error(`O engine JUCE encerrou (código ${code ?? 'null'}, sinal ${signal ?? 'null'}).`);
        this.failPending(error);
        if (!ready) reject(error);
      });
    }).finally(() => {
      this.startup = null;
    });

    await this.startup;
  }

  private findEngine(): string | null {
    const executable = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
    const candidates = [
      path.join(app.getAppPath(), 'engine', 'build', 'PreseterEngine_artefacts', 'Release', executable),
      path.join(app.getAppPath(), 'engine', 'build', 'PreseterEngine_artefacts', 'Debug', executable),
      path.join(process.resourcesPath, 'engine', executable),
    ];
    const explicitPath = process.env.PRESETER_ENGINE;
    if (explicitPath) candidates.unshift(explicitPath);
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private failPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
