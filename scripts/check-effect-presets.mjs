#!/usr/bin/env node
/**
 * P6 — Teste de nível dos presets de efeitos.
 *
 * Passa uma nota sustentada do Preseter Organ por cada preset (insert do layer),
 * grava a saída do motor e compara com o mesmo trecho com o insert em bypass:
 *   - tonal: |RMS preset − RMS bypass| ≤ 3 dB
 *   - pico ≤ −1 dBFS
 *   - cauda (último 1 s) ≤ −60 dBFS
 *   - sem NaN/Inf
 *
 * Uso:
 *   node scripts/check-effect-presets.mjs                 # todos
 *   node scripts/check-effect-presets.mjs --effect preseter.reverb
 *   node scripts/check-effect-presets.mjs --effect preseter.reverb --preset hall
 *   node scripts/check-effect-presets.mjs --tail 6 --body 2
 *
 * O teste abre o dispositivo de áudio padrão (DirectSound) e a nota é audível
 * durante a execução. Efeitos de guitarra (Guitarix), dinâmica e presets `-aux`
 * passam só pelos testes de pico/cauda/NaN (o RMS não é comparável).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const engineCandidates = [
  path.join(root, 'release', 'win-unpacked', 'resources', 'engine', 'PreseterEngine.exe'),
  path.join(root, 'engine', 'build', 'PreseterEngine_artefacts', 'Release', 'PreseterEngine.exe'),
];
const enginePath = process.env.PRESETER_ENGINE
  ?? engineCandidates.find((candidate) => fs.existsSync(candidate));
if (!enginePath) {
  console.error('ERRO: PreseterEngine não encontrado. Defina PRESETER_ENGINE.');
  process.exit(2);
}

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const onlyEffect = option('effect', null);
const onlyPreset = option('preset', null);
const bodySeconds = Number(option('body', '2'));
const tailSeconds = Number(option('tail', '6'));
const leadSeconds = 0.4;

const effectsDir = path.join(root, 'src', 'shared', 'effects');
const catalogs = ['catalog.json', 'guitarix.json'].map((file) =>
  JSON.parse(fs.readFileSync(path.join(effectsDir, file), 'utf8'))
);

const CALFNXT_DIR = path.join(root, 'vendor', 'calfnxt', 'plugins');
const GUITARIX_DIR = path.join(root, 'vendor', 'guitarix', 'plugins-win');
const LV2_URIS = {
  'gxts9.lv2': 'http://guitarix.sourceforge.net/plugins/gxts9#ts9sim',
  'gx_studiopre.lv2': 'http://guitarix.sourceforge.net/plugins/gx_studiopre#studiopre',
  'gx_cabinet.lv2': 'http://guitarix.sourceforge.net/plugins/gx_cabinet#CABINET',
  'gx_amp.lv2': 'http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX',
  'gx_tremolo.lv2': 'http://guitarix.sourceforge.net/plugins/gx_tremolo#_tremolo',
};

/** Efeitos cujo nível não é comparável com o bypass (dinâmica/guitarra). */
const NO_LEVEL_COMPARE = new Set([
  'preseter.compressor', 'preseter.expander', 'preseter.limiter', 'preseter.mbcomp',
  'preseter.mblimiter', 'preseter.denoiser', 'preseter.gx.overdrive', 'preseter.gx.preamp',
  'preseter.gx.cab', 'preseter.gx.amp', 'preseter.gx.tremolo',
]);

const spawnEngine = () => {
  const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.on('data', () => {});
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((resolve) => {
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.event === 'ready') { resolve(); return; }
      if (typeof message.id !== 'number') return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      message.ok === true ? item.resolve(message.result) : item.reject(new Error(String(message.error)));
    });
  });
  const request = (cmd, data = {}, timeout = 60000) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tempo esgotado: ${cmd}`)), timeout);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, cmd, ...data }) + '\n');
    });
  };
  return { child, ready, request };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lê um WAV (PCM 8/16/24/32 ou float 32) em canais intercalados. */
function readWav (file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`WAV inválido: ${file}`);
  }
  let offset = 12;
  let format = null;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bits: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataSize = size;
    }
    offset += 8 + size + (size % 2);
  }
  if (!format || dataStart < 0) throw new Error('WAV sem fmt/data');
  const bytes = format.bits / 8;
  const frames = Math.floor(dataSize / (bytes * format.channels));
  const samples = [];
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const at = dataStart + (frame * format.channels + channel) * bytes;
      let value;
      if (format.audioFormat === 3 && format.bits === 32) value = buffer.readFloatLE(at);
      else if (format.bits === 16) value = buffer.readInt16LE(at) / 32768;
      else if (format.bits === 24) value = buffer.readIntLE(at, 3) / 8388608;
      else if (format.bits === 32) value = buffer.readInt32LE(at) / 2147483648;
      else if (format.bits === 8) value = (buffer.readUInt8(at) - 128) / 128;
      else throw new Error(`bits não suportados: ${format.bits}`);
      samples.push(value);
    }
  }
  return { channels: format.channels, sampleRate: format.sampleRate, samples };
}

const db = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);

function analyze (wav, startSeconds, endSeconds) {
  const start = Math.max(0, Math.floor(startSeconds * wav.sampleRate) * wav.channels);
  const end = Math.min(wav.samples.length, Math.floor(endSeconds * wav.sampleRate) * wav.channels);
  let sum = 0;
  let peak = 0;
  let bad = false;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const value = wav.samples[i];
    if (!Number.isFinite(value)) { bad = true; continue; }
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
    count += 1;
  }
  return {
    rms: count > 0 ? Math.sqrt(sum / count) : 0,
    peak,
    bad,
  };
}

const presetList = [];
for (const catalog of catalogs) {
  for (const effect of catalog.effects) {
    if (onlyEffect && effect.id !== onlyEffect) continue;
    if (effect.presets.length === 0) continue;
    presetList.push({ effect, catalog });
  }
}
if (presetList.length === 0) {
  console.error(`ERRO: nenhum efeito encontrado${onlyEffect ? ` para "${onlyEffect}"` : ''}.`);
  process.exit(2);
}

const { child, ready, request } = spawnEngine();

try {
  await ready;
  const devices = await request('audioConfiguration', {});
  const pick = devices.audioTypes.find((type) => type.type === 'DirectSound' && type.outputs.length > 0);
  const audio = await request('audioStart', {
    type: pick?.type ?? 'DirectSound',
    output: pick?.outputs[0],
    inputs: 0,
    midi: false,
    sampleRate: 48000,
    bufferSize: 512,
  });
  if (!audio.running) throw new Error('não foi possível abrir o áudio');

  await request('warmLv2', { paths: [GUITARIX_DIR] });
  await request('load', { plugin: 'preseter.organ', layerId: 'p6' });
  await request('setLayerMix', { layerId: 'p6', volumeDb: -12 });

  const wavPath = path.join(os.tmpdir(), 'preseter-p6.wav');
  fs.mkdirSync(path.dirname(wavPath), { recursive: true });

  const recordPass = async ({ seconds, tail, bypass }) => {
    try { fs.unlinkSync(wavPath); } catch {}
    await request('setInsertBypass', { layerId: 'p6', slot: 0, bypass });
    await request('recordStart', { path: wavPath });
    await wait(leadSeconds * 1000);
    await request('noteOn', { note: 60, velocity: 100 });
    await wait(seconds * 1000);
    await request('noteOff', { note: 60 });
    if (tail > 0) await wait(tail * 1000);
    await request('recordStop', {});
    return readWav(wavPath);
  };

  let insertLoaded = null;
  const failures = [];
  let tested = 0;

  for (const { effect } of presetList) {
    const isLv2 = Boolean(LV2_URIS[effect.bundle]);
    const pluginRef = isLv2 ? LV2_URIS[effect.bundle] : path.join(CALFNXT_DIR, effect.bundle);
    if (!isLv2 && !fs.existsSync(pluginRef)) {
      console.warn(`AVISO: bundle ausente para ${effect.id}: ${pluginRef}`);
      continue;
    }

    if (insertLoaded !== effect.bundle) {
      await request('setInsert', {
        layerId: 'p6',
        slot: 0,
        ...(isLv2 ? { plugin: pluginRef } : { path: pluginRef }),
      });
      insertLoaded = effect.bundle;
    }

    const bypassWav = await recordPass({ seconds: bodySeconds, tail: 0, bypass: true });
    const bypassBody = analyze(bypassWav, leadSeconds + 0.2, leadSeconds + bodySeconds);

    for (const preset of effect.presets) {
      if (onlyPreset && preset.id !== onlyPreset) continue;
      for (const [index, value] of Object.entries(preset.values)) {
        await request('setParam', { layerId: 'p6', slot: 0, index: Number(index), value });
      }
      const wav = await recordPass({ seconds: bodySeconds, tail: tailSeconds, bypass: false });
      const body = analyze(wav, leadSeconds + 0.2, leadSeconds + bodySeconds);
      const tail = analyze(wav, bodySeconds + leadSeconds + tailSeconds - 1, bodySeconds + leadSeconds + tailSeconds);
      tested += 1;

      const problems = [];
      if (body.bad || tail.bad) problems.push('NaN/Inf');
      if (body.peak > 10 ** (-1 / 20)) problems.push(`pico ${db(body.peak).toFixed(1)} dBFS`);
      if (tail.rms > 10 ** (-60 / 20)) problems.push(`cauda ${db(tail.rms).toFixed(1)} dBFS`);
      const compareLevel = !NO_LEVEL_COMPARE.has(effect.id) && !preset.id.endsWith('-aux');
      if (compareLevel && bypassBody.rms > 0) {
        const delta = db(body.rms) - db(bypassBody.rms);
        if (Math.abs(delta) > 3) problems.push(`RMS ${delta > 0 ? '+' : ''}${delta.toFixed(1)} dB`);
      }

      const line = `${effect.id}/${preset.id}: RMS ${db(body.rms).toFixed(1)} dB, pico ${db(body.peak).toFixed(1)} dBFS, cauda ${db(tail.rms).toFixed(1)} dBFS`;
      if (problems.length > 0) {
        failures.push({ effect: effect.id, preset: preset.id, problems, line });
        console.log(`FALHA ${line} — ${problems.join(', ')}`);
      } else {
        console.log(`ok    ${line}`);
      }
    }
  }

  console.log(`\n${tested} preset(s) testado(s); ${failures.length} fora do limite.`);
  for (const failure of failures) {
    console.log(`- ${failure.effect}/${failure.preset}: ${failure.problems.join(', ')}`);
  }
  if (failures.length > 0) process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} }, 300);
}
