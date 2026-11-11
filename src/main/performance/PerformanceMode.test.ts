import * as os from 'os';
import { spawnSync } from 'child_process';
import { powerMonitor } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceMode } from './PerformanceMode';

vi.mock('child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, setPriority: vi.fn(() => true) };
});

const ORIGINAL = '11111111-1111-1111-1111-111111111111';
const TEMP = '22222222-2222-2222-2222-222222222222';
const STALE = '33333333-3333-3333-3333-333333333333';
const HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

const plans = new Map<string, string>([
  [ORIGINAL, 'Equilibrado'],
  [HIGH_PERFORMANCE, 'Alto Desempenho'],
]);
let activeGuid = ORIGINAL;
let duplicateFails = false;

function result(status: number, stdout = '') {
  return { status, stdout, stderr: '' } as ReturnType<typeof spawnSync>;
}

vi.mocked(spawnSync).mockImplementation(((_command: string, args: string[]) => {
  const action = args[0];
  if (action === '/getactivescheme') {
    return result(0, `Power Scheme GUID: ${activeGuid}  (${plans.get(activeGuid) ?? 'Ativo'})\n`);
  }
  if (action === '/list') {
    return result(0, [...plans.entries()]
      .map(([guid, name]) => `Power Scheme GUID: ${guid}  (${name})`)
      .join('\n'));
  }
  if (action === '/duplicatescheme') {
    if (duplicateFails) return result(1, 'sem permissão');
    plans.set(TEMP, 'Equilibrado');
    return result(0, `Power Scheme GUID: ${TEMP}  (Equilibrado)\n`);
  }
  if (action === '/changename') {
    plans.set(args[1], args[2]);
    return result(0);
  }
  if (action === '/setactive') {
    activeGuid = args[1];
    return result(0);
  }
  if (action === '/delete') {
    plans.delete(args[1]);
    return result(0);
  }
  if (action === '/setacvalueindex') return result(0);
  return result(1, 'comando desconhecido');
}) as never);

function makeMode(enginePid: number | null = null): PerformanceMode {
  return new PerformanceMode({ getEnginePid: () => enginePid });
}

describe('PerformanceMode', () => {
  beforeEach(() => {
    plans.clear();
    plans.set(ORIGINAL, 'Equilibrado');
    plans.set(HIGH_PERFORMANCE, 'Alto Desempenho');
    activeGuid = ORIGINAL;
    duplicateFails = false;
    vi.mocked(spawnSync).mockClear();
    vi.mocked(os.setPriority).mockClear();
    vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(false);
  });

  it('duplica o plano, aplica 100% e restaura ao desligar', () => {
    const mode = makeMode(4321);
    mode.initialize(true);

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      'powercfg',
      ['/setacvalueindex', TEMP, 'SUB_PROCESSOR', 'PROCTHROTTLEMAX', '100'],
      expect.objectContaining({ windowsHide: true })
    );
    expect(activeGuid).toBe(TEMP);

    const status = mode.getStatus();
    expect(status).toMatchObject({
      enabled: true,
      processorMax: true,
      enginePid: 4321,
      planName: 'Preseter Desempenho',
    });
    expect(os.setPriority).toHaveBeenCalledWith(
      process.pid,
      os.constants.priority.PRIORITY_HIGH
    );
    expect(os.setPriority).toHaveBeenCalledWith(
      4321,
      os.constants.priority.PRIORITY_HIGH
    );

    mode.dispose();
    expect(activeGuid).toBe(ORIGINAL);
    expect(plans.has(TEMP)).toBe(false);
    expect(os.setPriority).toHaveBeenCalledWith(
      process.pid,
      os.constants.priority.PRIORITY_NORMAL
    );
  });

  it('espera o carregador antes de aplicar', () => {
    vi.mocked(powerMonitor.isOnBatteryPower).mockReturnValue(true);
    const mode = makeMode();
    mode.initialize(true);

    expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith(
      'powercfg',
      expect.arrayContaining(['/duplicatescheme']),
      expect.anything()
    );
    const status = mode.getStatus();
    expect(status.waitingForAc).toBe(true);
    expect(status.processorMax).toBe(false);
    expect(status.message).toContain('Aguardando o carregador');
  });

  it('cai para o plano Alto Desempenho quando não pode duplicar', () => {
    duplicateFails = true;
    const mode = makeMode();
    mode.initialize(true);

    expect(activeGuid).toBe(HIGH_PERFORMANCE);
    const status = mode.getStatus();
    expect(status.processorMax).toBe(false);
    expect(status.message).toContain('administrador');
    mode.dispose();
  });

  it('remove planos temporários deixados por uma execução anterior', () => {
    plans.set(STALE, 'Preseter Desempenho');
    const mode = makeMode();
    mode.initialize(false);

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      'powercfg',
      ['/delete', STALE],
      expect.objectContaining({ windowsHide: true })
    );
    expect(plans.has(STALE)).toBe(false);
  });
});
