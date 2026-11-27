#!/usr/bin/env node
/**
 * Z5: stress do Preseter Zyn.
 *
 * - 100 trocas de programa seguidas (engine real, ASIO opcional);
 * - estado do layer: salvar (getState), trocar tudo e restaurar (setState);
 * - confere programa, parâmetro e ausência de falha do pool/heap no áudio.
 *
 * Uso:
 *   node scripts/zyn-stress.js
 *   node scripts/zyn-stress.js --no-audio
 *   node scripts/zyn-stress.js --switches=100 --json=resultado.json
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PRESETER_ENGINE
  || path.join(ROOT, 'engine', 'build', 'PreseterEngine_artefacts', 'Release',
    process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine');
const BANKS = path.join(ROOT, 'vendor', 'zyn', 'banks');
const USER_DIR = path.join(os.tmpdir(), 'preseter-zyn-user');
const LAYER = 'zyn-stress';
const ASIO = { type: 'ASIO', output: 'ASIO4ALL v2', inputs: 0, outputs: 2, sampleRate: 48000, bufferSize: 256 };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SWITCHES = Number(value('switches', '100'));
const JSON_PATH = value('json', path.join(os.tmpdir(), 'zyn-stress.json'));

const child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
let quitting = false;
const ready = new Promise((resolve) => { readyResolve = resolve; });

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.event === 'ready') { readyResolve(message); return; }
  if (message.id !== undefined && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(entry.timer);
    message.ok ? entry.resolve(message.result) : entry.reject(new Error(message.error));
  }
});

function request(cmd, payload = {}, timeoutMs = 180000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Tempo esgotado em "${cmd}"`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => Number.isFinite(n) ? Number(n.toFixed(2)) : n;

async function main() {
  const hello = await Promise.race([ready, sleep(15000).then(() => null)]);
  if (!hello) throw new Error('O engine não ficou pronto em 15 s.');

  const loaded = await request('load', {
    path: 'preseter.zyn',
    layerId: LAYER,
    zynBankDir: BANKS,
    zynUserDir: USER_DIR,
  }, 120000);

  const programs = await request('zynDiag', { action: 'programs', layerId: LAYER });
  const names = loaded.programNames ?? [];
  const byName = (needle) => programs.find((program) => program.display.includes(needle));
  const fast = [
    byName('0001-hard fat lead'),
    byName('0011-synth brass'),
    byName('0018-fantasy bells'),
    byName('0031-ambient pad 2'),
  ].filter(Boolean);
  if (fast.length < 2) throw new Error('Presets rápidos não encontrados no banco.');

  let audio = null;
  if (!flag('no-audio')) {
    try {
      audio = await request('audioStart', ASIO, 30000);
      await request('noteOn', { note: 60, velocity: 100 });
    } catch (error) {
      audio = { error: error.message };
    }
  }

  const before = await request('zynDiag', { action: 'stats', layerId: LAYER });
  await request('zynDiag', { action: 'reset', layerId: LAYER });

  const started = Date.now();
  let mismatches = 0;
  for (let i = 0; i < SWITCHES; i += 1) {
    const target = fast[i % fast.length];
    const result = await request('setProgram', { layerId: LAYER, index: target.index }, 120000);
    if (result.program !== target.index) mismatches += 1;
  }
  const elapsedMs = Date.now() - started;

  const stats = await request('zynDiag', { action: 'stats', layerId: LAYER });
  const devices = await request('devices');
  const xruns = devices.current?.xruns ?? null;

  if (audio && !audio.error) {
    await request('noteOff', { note: 60 });
    await request('panic').catch(() => null);
  }

  // Estado: programa + parâmetro de Volume (APVTS) + instrumento XML.
  await request('setProgram', { layerId: LAYER, index: fast[0].index });
  const params = await request('params', { layerId: LAYER });
  const volume = params.find((parameter) => parameter.name === 'Volume');
  const bendRange = params.find((parameter) => parameter.name === 'Bend Range');
  if (!volume || !bendRange) throw new Error('Parâmetros Volume/Bend Range não encontrados.');
  await request('setParam', { layerId: LAYER, index: volume.index, value: 0.3 });
  await request('setParam', { layerId: LAYER, index: bendRange.index, value: 0.7 });
  const saved = await request('getState', { layerId: LAYER });
  const savedProgram = saved && saved.data
    ? (await request('zynDiag', { action: 'stats', layerId: LAYER })).currentProgram
    : null;

  await request('setProgram', { layerId: LAYER, index: fast[1].index });
  await request('setParam', { layerId: LAYER, index: volume.index, value: 0.7 });
  await request('setParam', { layerId: LAYER, index: bendRange.index, value: 0.2 });
  await request('setState', { layerId: LAYER, data: saved.data });
  const restoredParams = await request('params', { layerId: LAYER });
  const restoredVolume = restoredParams.find((parameter) => parameter.name === 'Volume')?.value;
  const restoredBendRange = restoredParams.find((parameter) => parameter.name === 'Bend Range')?.value;
  const restoredProgram = (await request('zynDiag', { action: 'stats', layerId: LAYER })).currentProgram;

  // Controles novos: o Part tem de refletir o que o parâmetro mandou.
  let controls = { skipped: true };
  if (audio && !audio.error) {
    const velocity = params.find((parameter) => parameter.name === 'Vel Sensitivity');
    const engine = params.find((parameter) => parameter.name === 'AD Engine');
    const cutoff = params.find((parameter) => parameter.name === 'Cutoff');
    const resonance = params.find((parameter) => parameter.name === 'Resonance');
    if (velocity && engine && cutoff && resonance) {
      await request('setParam', { layerId: LAYER, index: velocity.index, value: 0.8 });
      await request('setParam', { layerId: LAYER, index: cutoff.index, value: 0.8 });
      await request('setParam', { layerId: LAYER, index: resonance.index, value: 0.3 });
      await request('setParam', { layerId: LAYER, index: engine.index, value: 1 });
      await sleep(150);
      const part = (await request('zynDiag', { action: 'stats', layerId: LAYER })).part;
      controls = {
        velSensitivity: part?.velSensitivity ?? null,
        adEnabled: part?.kit?.[0]?.add ?? null,
        cutoffData: part?.cutoffData ?? null,
        resonanceData: part?.resonanceData ?? null,
        ok: part?.velSensitivity === 102
          && part?.kit?.[0]?.add === true
          && part?.cutoffData === 102
          && part?.resonanceData === 38,
      };
    }
  }

  const report = {
    engine: { version: hello.version, build: hello.build },
    audio: audio && !audio.error
      ? { sampleRate: audio.current?.sampleRate, bufferSize: audio.current?.bufferSize }
      : { skipped: true, error: audio?.error },
    switches: {
      count: SWITCHES,
      elapsedMs,
      perSwitchMs: round(elapsedMs / SWITCHES),
      mismatches,
      xruns,
      names: fast.map((program) => program.display),
    },
    allocation: {
      allocInAudio: stats.allocInAudio,
      heapAllocInAudio: stats.heapAllocInAudio,
      heapAllocCount: stats.heapAllocCount,
      allocFailures: stats.allocFailures,
      arenaBytes: stats.arenaBytes,
      activeVoices: stats.activeVoices,
      before: {
        allocFailures: before.allocFailures,
        heapAllocCount: before.heapAllocCount,
      },
    },
    state: {
      savedBytes: saved.data ? Math.round(saved.data.length * 0.75) : 0,
      savedProgram,
      restoredProgram,
      volumeBefore: volume.value,
      volumeSet: 0.3,
      volumeRestored: restoredVolume,
      bendBefore: bendRange.value,
      bendSet: 0.7,
      bendRestored: restoredBendRange,
      ok: restoredProgram === savedProgram
        && typeof restoredVolume === 'number'
        && Math.abs(restoredVolume - 0.3) < 0.02
        && typeof restoredBendRange === 'number'
        && Math.abs(restoredBendRange - 0.7) < 0.02,
    },
    controls,
    ok: mismatches === 0
      && (stats.allocFailures ?? 0) === 0
      && (stats.heapAllocInAudio ?? 0) === 0
      && restoredProgram === savedProgram
      && typeof restoredVolume === 'number'
      && Math.abs(restoredVolume - 0.3) < 0.02
      && typeof restoredBendRange === 'number'
      && Math.abs(restoredBendRange - 0.7) < 0.02
      && (controls.skipped === true || controls.ok === true),
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRelatório: ${JSON_PATH}`);
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('\nERRO:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    quitting = true;
    try { await request('quit', {}, 3000); } catch { /* já encerrou */ }
    child.stdin.end();
    setTimeout(() => child.kill(), 1000).unref();
  });
