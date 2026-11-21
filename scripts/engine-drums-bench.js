#!/usr/bin/env node
/*
 * Medição de CPU/xruns do Preseter Drums (D11).
 *
 * Carrega o kit, arma um padrão cheio (16 trilhas ligadas em todos os passos),
 * toca por N segundos, envia notas de teclado durante a execução e mede:
 *  - CPU do processo do motor (Windows: Get-Process.CPU; Linux: /proc/<pid>/stat);
 *  - vozes ativas máximas;
 *  - xruns antes/depois (AudioTimingMeter do motor).
 *
 * Uso:
 *   node scripts/engine-drums-bench.js --type=ASIO --output="ASIO4ALL v2" \
 *     --input="ASIO4ALL v2" --rate=44100 --buffer=256 --seconds=10
 *
 *   --steps=32 --bars=4   # padrão máximo (16 trilhas × 128 passos)
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const values = (name) =>
  args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const first = (name, fallback) => values(name)[0] ?? fallback;

function findEngine() {
  const explicit = first('engine', process.env.PRESETER_ENGINE);
  if (explicit) return explicit;
  const exe = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
  const base = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts');
  return ['Release', 'Debug', 'RelWithDebInfo', '.']
    .map((dir) => path.join(base, dir, exe))
    .find((candidate) => fs.existsSync(candidate));
}

const defaultKit = path.join(os.homedir(), 'PreseterSons', 'MuseScore_General',
                             'MuseScore_General.sf2');
const kitPath = first('kit', defaultKit);
const seconds = Number(first('seconds', '10'));
const steps = Number(first('steps', '16'));
const bars = Number(first('bars', '1'));
const trackCount = Math.max(0, Math.min(16, Number(first('tracks', '16'))));

const enginePath = findEngine();
if (!enginePath) {
  console.error('Motor não encontrado. Compile o engine ou use --engine=CAMINHO.');
  process.exit(2);
}
if (!fs.existsSync(kitPath)) {
  console.error(`Kit não encontrado: ${kitPath}`);
  process.exit(2);
}

const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.event === 'ready') { readyResolve(message); return; }
  if (message.id !== undefined && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.ok ? request.resolve(message.result) : request.reject(new Error(message.error));
  }
});

function request(cmd, payload = {}, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${cmd}`)); }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Segundos de CPU do processo do motor (Windows/Linux). */
function cpuSeconds(pid) {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).CPU`],
                               { encoding: 'utf8' });
      const value = Number(result.stdout.trim().replace(',', '.'));
      return Number.isFinite(value) ? value : null;
    }
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const utime = Number(fields[11]);
      const stime = Number(fields[12]);
      return (utime + stime) / 100; // CLK_TCK típico
    }
  } catch {
    /* sem medição de CPU */
  }
  return null;
}

function fullPattern() {
  const tracks = Array.from({ length: trackCount }, (_, pad) => ({
    pad,
    mute: false,
    level: 0,
    steps: Array.from({ length: steps }, () => ({ on: true, velocity: 100 })),
  }));
  return { stepsPerBar: steps, bars, swing: 0, tracks };
}

(async () => {
  const layerId = 'drums-bench';
  try {
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('motor não ficou pronto')), 15000))]);

    await request('load', {
      plugin: 'preseter.drums',
      layerId,
      samplePath: kitPath,
      kitBank: 128,
      kitProgram: 0,
    }, 60000);

    const audio = await request('audioStart', {
      outputs: 2,
      inputs: Number(first('inputs', '2')),
      sampleRate: Number(first('rate', '44100')),
      bufferSize: Number(first('buffer', '256')),
      type: first('type', process.platform === 'win32' ? 'ASIO' : ''),
      output: first('output', process.platform === 'win32' ? 'ASIO4ALL v2' : ''),
      input: first('input', process.platform === 'win32' ? 'ASIO4ALL v2' : ''),
    }, 30000);

    await request('setHostClock', { bpm: 120, numerator: 4, denominator: 4, playing: true });
    if (trackCount > 0)
      await request('setDrums', { layerId, enabled: true, pattern: fullPattern() });
    await sleep(500);

    const before = await request('devices', {});
    const xrunsBefore = before?.current?.xruns ?? 0;
    const cpuBefore = cpuSeconds(child.pid);
    const wallStart = Date.now();

    let maxVoices = 0;
    const end = Date.now() + seconds * 1000;
    let keyboardNote = 36;
    while (Date.now() < end) {
      if (trackCount > 0) {
        // Toca ao vivo enquanto o padrão roda.
        await request('noteOn', { note: keyboardNote, velocity: 100 }).catch(() => {});
        await sleep(120);
        await request('noteOff', { note: keyboardNote }).catch(() => {});
        keyboardNote = keyboardNote + 2 > 50 ? 36 : keyboardNote + 2;
      } else {
        await sleep(200);
      }
      const voices = await request('voices', { layerId }).catch(() => null);
      maxVoices = Math.max(maxVoices, voices?.activeVoices ?? 0);
      await sleep(80);
    }

    const wall = (Date.now() - wallStart) / 1000;
    const cpuAfter = cpuSeconds(child.pid);
    const after = await request('devices', {});
    const xrunsAfter = after?.current?.xruns ?? 0;

    const cpu = cpuBefore !== null && cpuAfter !== null ? cpuAfter - cpuBefore : null;
    console.log(`bench: ${trackCount} trilhas × ${steps} passos × ${bars} compasso(s)`);
    console.log(`áudio: ${audio?.current?.type} ${audio?.current?.name} ${audio?.current?.sampleRate} Hz / ${audio?.current?.bufferSize}`);
    console.log(`duração: ${wall.toFixed(0)} s | vozes máximas: ${maxVoices}`);
    console.log(
      `CPU do motor: ${cpu === null ? 'n/d' : `${cpu.toFixed(2)} s`} | ` +
      `${cpu === null ? 'n/d' : `${((cpu / wall) * 100).toFixed(1)}% de um núcleo`}`
    );
    console.log(`xruns: ${xrunsBefore} -> ${xrunsAfter} (delta ${xrunsAfter - xrunsBefore >= 0 ? '+' : ''}${xrunsAfter - xrunsBefore})`);

    await request('setDrums', { layerId, enabled: false }).catch(() => {});
    await request('setHostClock', { bpm: 120, numerator: 4, denominator: 4, playing: false }).catch(() => {});
    await request('unload', { layerId }).catch(() => {});
    await request('quit', {}, 2000).catch(() => {});
    child.kill('SIGKILL');
    process.exit(0);
  } catch (error) {
    console.error('FALHA:', error.message);
    try { child.kill('SIGKILL'); } catch { /* já saiu */ }
    process.exit(1);
  }
})();
