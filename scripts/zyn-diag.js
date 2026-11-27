#!/usr/bin/env node
/**
 * Diagnóstico Z0 do Preseter Zyn.
 *
 * Mede, com o engine real:
 *  - quantos presets carregam hoje (gzip x XML puro);
 *  - o que acontece com o programa/banco ao trocar de banco;
 *  - tempo por etapa de 20 presets (comum, PADsynth e os maiores);
 *  - xruns e gap de áudio na troca (ASIO 256);
 *  - alocações no caminho de áudio;
 *  - tamanho/custo do JSON de `describeLoadedPlugin`.
 *
 * Uso:
 *   node scripts/zyn-diag.js                 # tudo (abre o ASIO)
 *   node scripts/zyn-diag.js --no-audio      # só medições sem áudio
 *   node scripts/zyn-diag.js --json=arquivo  # grava o relatório completo
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PRESETER_ENGINE
  || path.join(ROOT, 'engine', 'build', 'PreseterEngine_artefacts', 'Release',
    process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine');
const BANKS = path.join(ROOT, 'vendor', 'zyn', 'banks');
const USER_DIR = path.join(os.tmpdir(), 'preseter-zyn-user');
const TMP = path.join(os.tmpdir(), 'preseter-zyn-diag');
const LAYER = 'zyn-diag';
const ASIO = { type: 'ASIO', output: 'ASIO4ALL v2', inputs: 0, outputs: 2, sampleRate: 48000, bufferSize: 256 };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (!fs.existsSync(ENGINE)) {
  console.error(`Engine não encontrado: ${ENGINE}\nCompile com: cmake --build engine/build --config Release --target PreseterEngine`);
  process.exit(2);
}
fs.mkdirSync(TMP, { recursive: true });

const child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
let quitting = false;
const ready = new Promise((resolve) => { readyResolve = resolve; });

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.event === 'ready') {
    readyResolve(message);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(entry.timer);
    message.ok ? entry.resolve(message.result) : entry.reject(new Error(message.error));
  }
});

child.on('exit', (code) => {
  if (!quitting) console.error(`\nO engine encerrou inesperadamente (código ${code}).`);
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
const round = (n, digits = 2) => Number.isFinite(n) ? Number(n.toFixed(digits)) : n;
const median = (list) => {
  const sorted = list.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Lê o .xiz (gzip ou XML puro) e devolve o XML e o flag de PADsynth. */
function readXml(program) {
  const bytes = fs.readFileSync(program.path);
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const xml = gzip ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  return {
    xml,
    gzip,
    pad: /PADsynth_used"\s+value="yes"/.test(xml),
    xmlBytes: Buffer.byteLength(xml),
  };
}

/** Cópia XML pura para medir o custo real de um preset gzip (sem corrigir o loader). */
function plainCopy(program, xml) {
  const safe = `${String(program.index).padStart(4, '0')}-${path.basename(program.path, '.xiz')}`
    .replace(/[^\w.-]+/g, '_');
  const target = path.join(TMP, `${safe}.xiz`);
  fs.writeFileSync(target, xml);
  return target;
}

/** Copia do splitBanks do ZynPanel, para medir o custo na interface. */
function splitBanks(names) {
  const banks = [];
  for (let index = 0; index < names.length; index += 1) {
    const full = names[index] ?? '';
    const separator = full.indexOf(' · ');
    const label = separator > 0 ? full.slice(0, separator) : 'Presets';
    const name = separator >= 0 ? full.slice(separator + 3) : full;
    const last = banks[banks.length - 1];
    if (!last || last.label !== label) banks.push({ label, entries: [{ index, name }] });
    else last.entries.push({ index, name });
  }
  if (banks.length === 0) banks.push({ label: 'Presets', entries: [] });
  return banks;
}

const bankOf = (programNames, index) => {
  const full = programNames[index] ?? '';
  const separator = full.indexOf(' · ');
  return separator > 0 ? full.slice(0, separator) : 'Presets';
};

async function loadZyn() {
  const loaded = await request('load', {
    path: 'preseter.zyn',
    layerId: LAYER,
    zynBankDir: BANKS,
    zynUserDir: USER_DIR,
  }, 120000);
  return {
    programNames: loaded.programNames ?? [],
    program: loaded.program ?? 0,
    programCount: loaded.programCount ?? 0,
  };
}

/** 1) Inventário e reprodução do problema do banco. */
async function scanAndBanks(loaded) {
  const programs = await request('zynDiag', { action: 'programs', layerId: LAYER });
  const enriched = programs.map((program) => {
    const info = readXml(program);
    return { ...program, gzip: info.gzip, pad: info.pad, xmlBytes: info.xmlBytes };
  });

  const gzip = enriched.filter((p) => p.gzip);
  const plain = enriched.filter((p) => !p.gzip);
  const pad = enriched.filter((p) => p.pad);
  const bankLabels = [...new Set(enriched.map((p) => bankOf(loaded.programNames, p.index)))];

  // Reprodução: escolhe 10 bancos e pede o primeiro programa de cada um.
  const tried = [];
  let current = loaded.program;
  let currentNames = loaded.programNames;
  for (const bank of bankLabels.slice(0, 10)) {
    const first = enriched.find((p) => bankOf(currentNames, p.index) === bank);
    if (!first) continue;
    const before = current;
    const started = Date.now();
    const result = await request('setProgram', { layerId: LAYER, index: first.index }, 60000);
    const elapsedMs = Date.now() - started;
    const stats = await request('zynDiag', { action: 'stats', layerId: LAYER });
    current = result.program;
    tried.push({
      bank,
      requested: first.index,
      requestedName: first.display,
      beforeProgram: before,
      beforeBank: bankOf(currentNames, before),
      afterProgram: current,
      afterBank: bankOf(currentNames, current),
      // O índice 0 já era o atual: só conta como troca se o preset carregou.
      changed: stats.last?.ok === true && current === first.index,
      elapsedMs,
      responseBytes: Buffer.byteLength(JSON.stringify(result)),
      load: stats.last,
    });
  }

  // Um caso controlado: programa que funciona (XML puro) e um que falha (gzip).
  const plainProgram = enriched.find((p) => !p.gzip && !p.pad);
  const gzipProgram = enriched.find((p) => p.gzip && !p.pad);
  const controlled = [];
  for (const program of [plainProgram, gzipProgram].filter(Boolean)) {
    const before = current;
    const started = Date.now();
    const result = await request('setProgram', { layerId: LAYER, index: program.index }, 60000);
    const elapsedMs = Date.now() - started;
    const stats = await request('zynDiag', { action: 'stats', layerId: LAYER });
    current = result.program;
    controlled.push({
      requested: program.index,
      gzip: program.gzip,
      before,
      after: result.program,
      changed: result.program === program.index,
      elapsedMs,
      responseBytes: Buffer.byteLength(JSON.stringify(result)),
      load: stats.last,
    });
  }

  // Custo do JSON e do splitBanks.
  const names = loaded.programNames;
  const sampleResponse = await request('setProgram', { layerId: LAYER, index: (plainProgram || enriched[0]).index }, 60000);
  const responseJson = JSON.stringify(sampleResponse);
  const stringifyStart = process.hrtime.bigint();
  for (let i = 0; i < 50; i += 1) JSON.stringify(sampleResponse);
  const stringifyMs = Number(process.hrtime.bigint() - stringifyStart) / 1e6 / 50;
  const parseStart = process.hrtime.bigint();
  for (let i = 0; i < 50; i += 1) JSON.parse(responseJson);
  const parseMs = Number(process.hrtime.bigint() - parseStart) / 1e6 / 50;
  const splitSamples = [];
  for (let i = 0; i < 50; i += 1) {
    const start = process.hrtime.bigint();
    splitBanks(names);
    splitSamples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  return {
    counts: {
      total: enriched.length,
      gzip: gzip.length,
      plain: plain.length,
      pad: pad.length,
      banks: bankLabels.length,
    },
    gzipFailures: gzip.length,
    plainLoadable: plain.length,
    banks: tried,
    controlled,
    json: {
      responseBytes: Buffer.byteLength(responseJson),
      programNames: names.length,
      stringifyMs: round(stringifyMs, 3),
      parseMs: round(parseMs, 3),
      splitBanksMedianMs: round(median(splitSamples), 3),
      splitBanksMaxMs: round(Math.max(...splitSamples), 3),
    },
    programs: enriched,
  };
}

/** 2) Tempo por etapa de 20 presets (hoje x custo real). */
async function timing(programs) {
  const nonPad = programs.filter((p) => !p.pad);
  const pad = programs.filter((p) => p.pad);
  const bySize = (list) => [...list].sort((a, b) => a.xmlBytes - b.xmlBytes);
  const pickSpread = (list, count, used) => {
    const sorted = bySize(list).filter((p) => !used.has(p.index));
    const picked = [];
    for (let i = 0; i < count && sorted.length > 0; i += 1) {
      const at = Math.min(sorted.length - 1, Math.round((i + 0.5) * sorted.length / count));
      picked.push(sorted[at]);
    }
    picked.forEach((p) => used.add(p.index));
    return picked;
  };

  const used = new Set();
  const common = pickSpread(nonPad, 10, used);
  const padFive = pickSpread(pad, 5, used);
  const largest = [];
  for (const program of bySize(programs).reverse()) {
    if (largest.length >= 5) break;
    if (used.has(program.index)) continue;
    largest.push(program);
    used.add(program.index);
  }

  const selected = [
    ...common.map((p) => ({ group: 'comum', program: p })),
    ...padFive.map((p) => ({ group: 'PADsynth', program: p })),
    ...largest.map((p) => ({ group: 'maior', program: p })),
  ];

  const rows = [];
  for (const item of selected) {
    const { program } = item;
    const info = readXml(program);
    const runs = program.xmlBytes > 100 * 1024 ? 2 : 3;
    const actualProfiles = [];
    const realProfiles = [];
    for (let i = 0; i < runs; i += 1) {
      const actual = await request('zynDiag', { action: 'loadPath', layerId: LAYER, path: program.path }, 180000);
      actualProfiles.push(actual.profile);
      const target = program.gzip ? plainCopy(program, info.xml) : program.path;
      const real = await request('zynDiag', { action: 'loadPath', layerId: LAYER, path: target }, 180000);
      realProfiles.push(real.profile);
    }
    const lastActual = actualProfiles[actualProfiles.length - 1];
    const lastReal = realProfiles[realProfiles.length - 1];
    rows.push({
      group: item.group,
      index: program.index,
      display: program.display,
      gzip: program.gzip,
      pad: program.pad,
      xmlKB: Math.round(program.xmlBytes / 1024),
      fileKB: Math.round(program.fileBytes / 1024),
      actual: {
        ok: lastActual.ok,
        loadXmlResult: lastActual.loadXmlResult,
        totalMs: round(median(actualProfiles.map((p) => p.totalMs)), 1),
      },
      real: {
        createMs: round(median(realProfiles.map((p) => p.createMs)), 1),
        loadXmlMs: round(median(realProfiles.map((p) => p.loadXmlMs)), 1),
        applyParametersMs: round(median(realProfiles.map((p) => p.applyParametersMs)), 1),
        initializeRtMs: round(median(realProfiles.map((p) => p.initializeRtMs)), 1),
        installMs: round(median(realProfiles.map((p) => p.installMs)), 2),
        destroyOldMs: round(median(realProfiles.map((p) => p.destroyOldMs)), 2),
        totalMs: round(median(realProfiles.map((p) => p.totalMs)), 1),
      },
    });
  }

  return rows;
}

/** 3) Alocação no NoteOn/NotOff. */
async function allocation(programs) {
  try {
    const target = programs.find((p) => !p.gzip && !p.pad) || programs.find((p) => !p.gzip);
    if (!target) return { skipped: true };
    await request('setProgram', { layerId: LAYER, index: target.index }, 60000);
    await request('zynDiag', { action: 'reset', layerId: LAYER });
    for (let i = 0; i < 20; i += 1) {
      await request('noteOn', { note: 48 + (i % 12), velocity: 100 });
      await sleep(5);
      await request('noteOff', { note: 48 + (i % 12) });
    }
    await sleep(100);
    const stats = await request('zynDiag', { action: 'stats', layerId: LAYER });
    return {
      program: target.display,
      allocCount: stats.allocCount,
      allocBytes: stats.allocBytes,
      freeCount: stats.freeCount,
      allocInAudio: stats.allocInAudio,
      freeInAudio: stats.freeInAudio,
      heapAllocCount: stats.heapAllocCount,
      heapAllocInAudio: stats.heapAllocInAudio,
      allocFailures: stats.allocFailures,
      arenaBytes: stats.arenaBytes,
      activeVoices: stats.activeVoices,
    };
  } catch (error) {
    return { error: error.message };
  }
}

/** Analisa o WAV com o ffmpeg-static: gaps de silêncio e picos. */
function analyzeWav(wavPath) {
  return new Promise((resolve) => {
    let ffmpeg;
    try { ffmpeg = require('ffmpeg-static'); } catch { resolve({ error: 'ffmpeg-static não instalado' }); return; }
    execFile(ffmpeg, ['-hide_banner', '-i', wavPath,
      '-af', 'silencedetect=noise=-50dB:d=0.02,astats=metadata=1:reset=0',
      '-f', 'null', '-'], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const text = `${stdout}\n${stderr}`;
      const gaps = [];
      let start = null;
      for (const line of text.split(/\r?\n/)) {
        const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
        const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
        if (startMatch) start = Number(startMatch[1]);
        if (endMatch) {
          gaps.push({ start: round(start ?? 0, 3), end: round(Number(endMatch[1]), 3), durationMs: round(Number(endMatch[2]) * 1000, 1) });
          start = null;
        }
      }
      const duration = text.match(/Duration:\s*([0-9:.]+)/)?.[1] ?? null;
      const peak = text.match(/Peak level dB:\s*(-?[0-9.]+)/)?.[1] ?? null;
      resolve({ gaps, duration, peakDb: peak ? Number(peak) : null, error: error ? String(error.message) : null });
    });
  });
}

/** 4) Xruns e gap de áudio (ASIO 256). */
async function audio(programs, loaded) {
  let audioInfo;
  try {
    audioInfo = await request('audioStart', ASIO, 30000);
  } catch (error) {
    return { skipped: true, error: error.message };
  }
  const sampleRate = audioInfo.current?.sampleRate;
  const bufferSize = audioInfo.current?.bufferSize;
  const before = await request('devices');
  const xrunsBefore = before.current?.xruns ?? 0;

  const plain = programs.filter((p) => !p.gzip);
  // Preset de ataque rápido para o gap de troca não se confundir com o ataque.
  const fast = plain.find((p) => !p.pad && /lead|pluck|bell|piano|keys/i.test(p.display))
    || plain.filter((p) => !p.pad).sort((a, b) => a.xmlBytes - b.xmlBytes)[0];
  const heavy = plain.filter((p) => p.pad).sort((a, b) => b.xmlBytes - a.xmlBytes)[0]
    || plain.sort((a, b) => b.xmlBytes - a.xmlBytes)[0];
  const gzip = programs.find((p) => p.gzip && !p.pad);

  // Ataque do mesmo preset a partir do silêncio: serve de referência para o gap.
  const baseline = async (program) => {
    if (!program) return null;
    await request('setProgram', { layerId: LAYER, index: program.index }, 60000);
    const wav = path.join(TMP, `zyn-ataque-${Date.now()}.wav`);
    await request('recordStart', { path: wav });
    await sleep(150);
    await request('noteOn', { note: 60, velocity: 100 });
    await sleep(900);
    await request('noteOff', { note: 60 });
    await sleep(200);
    await request('recordStop', {});
    const analysis = await analyzeWav(wav);
    const firstGap = analysis.gaps?.[0];
    const attackMs = firstGap ? round(firstGap.end * 1000 - 150, 1) : null;
    return { program: program.display, attackMs, analysis };
  };

  const cases = [];
  const runCase = async (label, program, { retrigger = true, recordMs = 3000 } = {}) => {
    if (!program) return;
    await request('setProgram', { layerId: LAYER, index: program.index }, 60000);
    await request('noteOn', { note: 60, velocity: 100 });
    await sleep(400);
    const wav = path.join(TMP, `zyn-${label}-${Date.now()}.wav`);
    await request('recordStart', { path: wav });
    await sleep(250);
    const started = Date.now();
    const result = await request('setProgram', { layerId: LAYER, index: program.index }, 120000);
    const switchMs = Date.now() - started;
    if (retrigger) await request('noteOn', { note: 60, velocity: 100 });
    await sleep(recordMs);
    await request('noteOff', { note: 60 });
    await sleep(200);
    await request('recordStop', {});
    const analysis = await analyzeWav(wav);
    const devices = await request('devices');
    cases.push({
      label,
      requested: program.index,
      display: program.display,
      gzip: program.gzip,
      pad: program.pad,
      changed: result.program === program.index,
      switchMs,
      retrigger,
      xruns: devices.current?.xruns ?? null,
      wav,
      analysis,
    });
  };

  const attack = await baseline(fast);
  await runCase('rapido', fast, { recordMs: 1500 });
  await runCase('pesado', heavy, { recordMs: 2500 });
  if (gzip) await runCase('gzip-agora', gzip, { recordMs: 1200 });
  // Nota segurada sem re-ataque: o preset novo não recebe a nota.
  await request('setProgram', { layerId: LAYER, index: fast?.index ?? 0 }, 60000);
  await runCase('sem-reataque', fast, { retrigger: false, recordMs: 1200 });

  const after = await request('devices');
  await request('panic').catch(() => null);
  return {
    sampleRate,
    bufferSize,
    xrunsBefore,
    xrunsAfter: after.current?.xruns ?? null,
    fast: fast?.display,
    heavy: heavy?.display,
    gzip: gzip?.display,
    attack,
    cases,
  };
}

async function main() {
  const hello = await Promise.race([ready, sleep(15000).then(() => null)]);
  if (!hello) throw new Error('O engine não ficou pronto em 15 s.');
  const loaded = await loadZyn();
  console.log(`Engine: v${hello.version} (${hello.build}) · Zyn com ${loaded.programCount} programas`);

  const report = { engine: { version: hello.version, build: hello.build, os: hello.os }, loaded };
  report.scan = await scanAndBanks(loaded);
  console.log(`Presets: ${report.scan.counts.total} · gzip ${report.scan.counts.gzip} · XML puro ${report.scan.counts.plain} · PAD ${report.scan.counts.pad} · bancos ${report.scan.counts.banks}`);
  console.log('Bancos (primeiro programa):');
  for (const row of report.scan.banks) {
    console.log(`  ${row.changed ? 'OK ' : 'FALHA'} ${row.bank}: ${row.beforeProgram} -> ${row.afterProgram} (${row.load?.loadXmlResult ?? '?'}) ${row.elapsedMs} ms`);
  }
  console.log('\nJSON:', report.scan.json);

  report.timing = await timing(report.scan.programs);
  console.log('\nTempos (mediana, ms):');
  for (const row of report.timing) {
    console.log(`  ${row.group.padEnd(8)} ${String(row.index).padStart(4)} ${row.gzip ? 'gzip ' : 'xml  '} pad=${row.pad ? 's' : 'n'} ${String(row.xmlKB).padStart(4)}k  hoje=${row.actual.ok ? 'ok' : 'falha'} ${String(row.actual.totalMs).padStart(7)}  real=${String(row.real.totalMs).padStart(7)} (apply=${row.real.applyParametersMs})`);
  }

  if (!flag('no-audio')) {
    report.audio = await audio(report.scan.programs, loaded);
    console.log('\nÁudio:', JSON.stringify({ sampleRate: report.audio.sampleRate, bufferSize: report.audio.bufferSize, xrunsBefore: report.audio.xrunsBefore, xrunsAfter: report.audio.xrunsAfter }, null, 2));
    for (const row of report.audio.cases ?? []) {
      console.log(`  ${row.label}: troca ${row.switchMs} ms · mudou=${row.changed} · gaps=${JSON.stringify(row.analysis?.gaps ?? [])}`);
    }

    // O NoteOn só entra no grafo com o áudio aberto; mede depois dos casos acima.
    report.allocation = await allocation(report.scan.programs);
    console.log('\nAlocação:', report.allocation);
  } else {
    report.allocation = { skipped: true, reason: 'noteOn exige o áudio iniciado (--no-audio)' };
  }

  const jsonPath = value('json', path.join(TMP, 'zyn-diag-result.json'));
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nRelatório: ${jsonPath}`);
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
