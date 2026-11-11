import { spawnSync } from 'child_process';
import * as os from 'os';
import { powerMonitor } from 'electron';
import type { AudioPerformanceStatus } from '../../shared/types';

const HIGH_PERFORMANCE_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const GUID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type Priority = 'normal' | 'high';
type PerformanceMethod = AudioPerformanceStatus['method'];

interface Options {
  /** PID do processo do motor, ou null quando ainda não iniciou. */
  getEnginePid: () => number | null;
  /** Plataforma; útil para testes. */
  platform?: NodeJS.Platform;
}

interface CommandResult {
  ok: boolean;
  output: string;
  missing: boolean;
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  const error = result.error as NodeJS.ErrnoException | undefined;
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
    missing: error?.code === 'ENOENT',
  };
}

function runPowercfg(args: string[]): CommandResult {
  return runCommand('powercfg', args);
}

function activeScheme(): { guid: string | null; name: string } {
  const result = runPowercfg(['/getactivescheme']);
  const guid = GUID_PATTERN.exec(result.output)?.[1] ?? null;
  const nameMatch = /\(([^)]+)\)\s*$/.exec(result.output);
  return { guid, name: nameMatch?.[1] ?? guid ?? 'Desconhecido' };
}

function setPriority(pid: number | null, priority: Priority): boolean {
  if (!pid) return false;
  try {
    os.setPriority(
      pid,
      priority === 'high'
        ? os.constants.priority.PRIORITY_HIGH
        : os.constants.priority.PRIORITY_NORMAL
    );
    return true;
  } catch {
    return false;
  }
}

function parseGovernor(output: string): string | null {
  const quoted = /governor[^\n]*?["“]([a-z0-9_-]+)["”]/i.exec(output);
  if (quoted) return quoted[1];
  const plain = /governor[^\n]*?:\s*([a-z0-9_-]+)/i.exec(output);
  if (plain) return plain[1];
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/**
 * Modo de desempenho máximo:
 * - Windows: plano temporário com processador em 100% e core parking off;
 * - Linux: governor `performance` via cpupower (pkexec) ou power-profiles-daemon;
 * - prioridade alta para o Preseter e o motor;
 * - restaura o estado anterior ao desligar/fechar.
 */
export class PerformanceMode {
  private enabled = false;
  private applied = false;
  private method: PerformanceMethod = 'none';
  private originalPlanGuid: string | null = null;
  private tempPlanGuid: string | null = null;
  private previousGovernor: string | null = null;
  private governor: string | null = null;
  private processorMax = false;
  private appPriority: Priority = 'normal';
  private enginePriority: Priority = 'normal';
  private message = '';
  private powerListenersAttached = false;
  private lastAppCpu = process.cpuUsage();
  private lastAppCpuAt = Date.now();
  private lastSystemCpu = os.cpus();
  /** Evita rodar `powercfg`/`cpupower` a cada segundo no painel de diagnóstico. */
  private schemeCache: { guid: string | null; name: string; at: number } | null = null;
  private governorCache: { value: string | null; at: number } | null = null;

  constructor(private readonly options: Options) {}

  initialize(enabled: boolean): void {
    this.method = this.detectMethod();
    this.enabled = enabled && this.method !== 'none';
    this.attachPowerListeners();
    if (this.method === 'powercfg') this.cleanupStalePlans();
    if (this.enabled) this.apply();
    else if (enabled && this.method === 'none') {
      this.message = this.platform() === 'linux'
        ? 'cpupower não encontrado. Instale linux-tools-common/linux-tools-generic ou o pacote cpupower da sua distro.'
        : 'O modo de desempenho não está disponível neste sistema.';
    }
  }

  setEnabled(enabled: boolean): AudioPerformanceStatus {
    this.enabled = enabled && this.method !== 'none';
    if (this.enabled) {
      this.message = '';
      this.apply();
    } else {
      if (enabled) {
        this.message = this.platform() === 'linux'
          ? 'cpupower não encontrado. Instale linux-tools-common/linux-tools-generic ou o pacote cpupower da sua distro.'
          : 'O modo de desempenho não está disponível neste sistema.';
      }
      this.restore(true);
    }
    return this.getStatus();
  }

  /** Reaplica prioridades quando o motor inicia depois do app. */
  refresh(): void {
    if (!this.enabled) return;
    if (powerMonitor.isOnBatteryPower()) return;
    if (!this.applied) this.apply();
    else this.applyPriorities();
  }

  dispose(): void {
    this.restore(true);
  }

  getStatus(): AudioPerformanceStatus {
    const onAc = !powerMonitor.isOnBatteryPower();
    const supported = this.method !== 'none';
    let planName = 'Desconhecido';
    let planGuid: string | null = null;

    if (this.method === 'powercfg') {
      const scheme = this.currentScheme();
      planName = scheme.name;
      planGuid = scheme.guid;
    } else if (this.method === 'cpupower') {
      const current = this.currentGovernor();
      this.governor = current;
      planName = current ? `Governor: ${current}` : 'cpupower';
      this.processorMax = current === 'performance';
    } else if (this.method === 'powerprofilesctl') {
      const current = this.currentProfile();
      this.governor = current;
      planName = current ? `Perfil: ${current}` : 'power-profiles-daemon';
      this.processorMax = current === 'performance';
    } else {
      planName = 'Indisponível';
    }

    return {
      enabled: this.enabled,
      supported,
      method: this.method,
      onAc,
      waitingForAc: this.enabled && !onAc,
      planName,
      planGuid,
      governor: this.governor ?? undefined,
      processorMax: this.processorMax,
      appPriority: this.appPriority,
      enginePriority: this.enginePriority,
      enginePid: this.options.getEnginePid(),
      systemCpu: this.sampleSystemCpu(),
      appCpu: this.sampleAppCpu(),
      message: this.message || undefined,
    };
  }

  private platform(): NodeJS.Platform {
    return this.options.platform ?? process.platform;
  }

  private detectMethod(): PerformanceMethod {
    if (this.platform() === 'win32') return 'powercfg';
    if (this.platform() !== 'linux') return 'none';

    const cpupower = runCommand('cpupower', ['frequency-info', '-g']);
    if (!cpupower.missing) return 'cpupower';

    const profiles = runCommand('powerprofilesctl', ['get']);
    if (!profiles.missing) return 'powerprofilesctl';
    return 'none';
  }

  private currentScheme(): { guid: string | null; name: string } {
    const now = Date.now();
    if (this.schemeCache && now - this.schemeCache.at < 5000) {
      return { guid: this.schemeCache.guid, name: this.schemeCache.name };
    }
    const scheme = activeScheme();
    this.schemeCache = { ...scheme, at: now };
    return scheme;
  }

  private currentGovernor(): string | null {
    const now = Date.now();
    if (this.governorCache && now - this.governorCache.at < 2000) {
      return this.governorCache.value;
    }
    const result = runCommand('cpupower', ['frequency-info', '-g']);
    const value = result.ok ? parseGovernor(result.output) : null;
    this.governorCache = { value, at: now };
    return value;
  }

  private currentProfile(): string | null {
    const result = runCommand('powerprofilesctl', ['get']);
    if (!result.ok) return null;
    const value = result.output.trim().split(/\r?\n/).pop()?.trim() ?? '';
    return value || null;
  }

  /**
   * Remove planos temporários de execuções anteriores que não estão ativos
   * (por exemplo, depois de um fechamento inesperado do Preseter).
   */
  private cleanupStalePlans(): void {
    const list = runPowercfg(['/list']);
    if (!list.ok) return;
    const activeGuid = this.currentScheme().guid;
    for (const line of list.output.split(/\r?\n/)) {
      if (!line.includes('Preseter Desempenho')) continue;
      const guid = GUID_PATTERN.exec(line)?.[1] ?? null;
      if (!guid || guid === activeGuid) continue;
      runPowercfg(['/delete', guid]);
    }
  }

  private attachPowerListeners(): void {
    if (this.powerListenersAttached) return;
    this.powerListenersAttached = true;
    powerMonitor.on('on-ac', () => {
      if (this.enabled) this.apply();
    });
    powerMonitor.on('on-battery', () => {
      if (this.enabled) this.restore(false);
    });
  }

  private apply(): void {
    if (!this.enabled) return;


    if (powerMonitor.isOnBatteryPower()) {
      this.message = 'Aguardando o carregador para aplicar o desempenho máximo.';
      this.restore(false);
      return;
    }

    if (this.applied) {
      this.applyPriorities();
      return;
    }

    if (this.method === 'powercfg') this.applyPowercfg();
    else if (this.method === 'cpupower') this.applyCpupower();
    else if (this.method === 'powerprofilesctl') this.applyPowerProfiles();

    this.applyPriorities();
    this.schemeCache = null;
    this.governorCache = null;
  }

  private applyPowercfg(): void {
    const current = activeScheme();
    this.originalPlanGuid = current.guid;
    this.tempPlanGuid = null;
    this.processorMax = false;

    let switched = false;
    if (current.guid) {
      const duplicated = runPowercfg(['/duplicatescheme', current.guid]);
      const newGuid = GUID_PATTERN.exec(duplicated.output)?.[1] ?? null;
      if (duplicated.ok && newGuid) {
        // Nome próprio para reconhecer e limpar planos temporários.
        runPowercfg(['/changename', newGuid, 'Preseter Desempenho']);
        const min = runPowercfg([
          '/setacvalueindex', newGuid, 'SUB_PROCESSOR', 'PROCTHROTTLEMIN', '100',
        ]);
        const max = runPowercfg([
          '/setacvalueindex', newGuid, 'SUB_PROCESSOR', 'PROCTHROTTLEMAX', '100',
        ]);
        const cores = runPowercfg([
          '/setacvalueindex', newGuid, 'SUB_PROCESSOR', 'CPMINCORES', '100',
        ]);
        const active = runPowercfg(['/setactive', newGuid]);
        const processorMax = min.ok && max.ok && cores.ok;

        if (active.ok && processorMax) {
          this.tempPlanGuid = newGuid;
          this.processorMax = true;
          switched = true;
          this.message = 'Processador em 100% e prioridade alta.';
        } else {
          runPowercfg(['/delete', newGuid]);
        }
      }
    }

    if (!switched) {
      const fallback = runPowercfg(['/setactive', HIGH_PERFORMANCE_GUID]);
      if (fallback.ok) {
        this.message = 'Plano Alto Desempenho ativo. Para 100% do processador, execute como administrador.';
      } else {
        this.message = 'Não foi possível ativar o plano Alto Desempenho.';
      }
    }

    this.applied = true;
  }

  private applyCpupower(): void {
    const current = this.currentGovernor();
    if (!current) {
      this.message = 'Não foi possível ler o governor atual. Confira se o cpupower está instalado.';
      return;
    }

    this.previousGovernor = current;
    let result = runCommand('pkexec', ['cpupower', 'frequency-set', '-g', 'performance']);
    if (result.missing) {
      // Sem pkexec, tenta direto; funciona se o usuário já tiver permissão.
      result = runCommand('cpupower', ['frequency-set', '-g', 'performance']);
    }

    if (result.ok) {
      this.governor = 'performance';
      this.processorMax = true;
      this.applied = true;
      this.message = 'Governor performance ativo.';
    } else {
      this.previousGovernor = null;
      this.message = 'Não foi possível aplicar o governor performance. Instale cpupower/polkit e autorize o pedido de administrador.';
    }
  }

  private applyPowerProfiles(): void {
    const current = this.currentProfile();
    if (!current) {
      this.message = 'Não foi possível ler o perfil de energia atual.';
      return;
    }
    this.previousGovernor = current;
    const result = runCommand('powerprofilesctl', ['set', 'performance']);
    if (result.ok) {
      this.governor = 'performance';
      this.processorMax = true;
      this.applied = true;
      this.message = 'Perfil performance ativo.';
    } else {
      this.previousGovernor = null;
      this.message = 'Não foi possível ativar o perfil performance.';
    }
  }

  private applyPriorities(): void {
    this.appPriority = setPriority(process.pid, 'high') ? 'high' : 'normal';
    this.enginePriority = setPriority(this.options.getEnginePid(), 'high') ? 'high' : 'normal';
  }

  private restore(clearMessage: boolean): void {
    if (this.applied) {
      if (this.method === 'powercfg') {
        if (this.originalPlanGuid) {
          runPowercfg(['/setactive', this.originalPlanGuid]);
        }
        if (this.tempPlanGuid) {
          runPowercfg(['/delete', this.tempPlanGuid]);
        }
      } else if (this.method === 'cpupower' && this.previousGovernor) {
        let result = runCommand('pkexec', [
          'cpupower', 'frequency-set', '-g', this.previousGovernor,
        ]);
        if (result.missing) {
          result = runCommand('cpupower', [
            'frequency-set', '-g', this.previousGovernor,
          ]);
        }
        if (!result.ok) {
          this.message = `Não foi possível restaurar o governor ${this.previousGovernor}.`;
        }
      } else if (this.method === 'powerprofilesctl' && this.previousGovernor) {
        runCommand('powerprofilesctl', ['set', this.previousGovernor]);
      }
    }

    setPriority(process.pid, 'normal');
    setPriority(this.options.getEnginePid(), 'normal');

    this.originalPlanGuid = null;
    this.tempPlanGuid = null;
    this.previousGovernor = null;
    this.processorMax = false;
    this.appPriority = 'normal';
    this.enginePriority = 'normal';
    this.applied = false;
    this.schemeCache = null;
    this.governorCache = null;
    if (clearMessage) this.message = '';
  }

  private sampleSystemCpu(): number {
    const now = os.cpus();
    let idle = 0;
    let total = 0;
    for (let index = 0; index < now.length; index += 1) {
      const current = now[index].times;
      const previous = this.lastSystemCpu[index]?.times;
      if (!previous) continue;
      const currentTotal = current.user + current.nice + current.sys + current.idle + current.irq;
      const previousTotal = previous.user + previous.nice + previous.sys + previous.idle + previous.irq;
      total += Math.max(0, currentTotal - previousTotal);
      idle += Math.max(0, current.idle - previous.idle);
    }
    this.lastSystemCpu = now;
    return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : 0;
  }

  private sampleAppCpu(): number {
    const now = process.cpuUsage();
    const nowAt = Date.now();
    const elapsedUs = (nowAt - this.lastAppCpuAt) * 1000;
    const usedUs =
      now.user + now.system - (this.lastAppCpu.user + this.lastAppCpu.system);
    this.lastAppCpu = now;
    this.lastAppCpuAt = nowAt;
    return elapsedUs > 0 ? Math.max(0, Math.min(100, (usedUs / elapsedUs) * 100)) : 0;
  }
}
