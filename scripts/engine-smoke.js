#!/usr/bin/env node
/**
 * Teste de fumaça do motor de áudio (preseter-engine).
 *
 * Sobe o motor como processo filho, fala com ele pelo protocolo JSON e
 * mostra o que acontece. Serve para validar a Fase 1 na sua máquina.
 *
 * Exemplos:
 *   node scripts/engine-smoke.js                          # ping + dispositivos + scan
 *   node scripts/engine-smoke.js --plugin=Surge           # carrega o 1º plugin cujo nome contém "Surge"
 *   node scripts/engine-smoke.js --plugin=Surge --audio   # ...e toca uma nota (você deve ouvir)
 *
 * Opções:
 *   --engine=CAMINHO   executável do motor (ou variável PRESETER_ENGINE)
 *   --plugin=TEXTO     nome (parcial) ou caminho .vst3 do plugin a carregar
 *   --audio            abre o dispositivo de áudio padrão e toca uma nota
 *   --note=60          nota MIDI a tocar (padrão 60 = Dó central)
 *   --rescan           ignora a lista salva e varre tudo de novo
 *   --path=PASTA       pasta extra de plugins (pode repetir)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const values = (name) =>
  args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const first = (name, fallback) => values(name)[0] ?? fallback;

function findEngine() {
  const explicit = first('engine', process.env.PRESETER_ENGINE);
  if (explicit) return explicit;

  const exe = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
  const base = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts');
  const candidates = ['Release', 'Debug', 'RelWithDebInfo', '.'].map((d) => path.join(base, d, exe));
  return candidates.find((c) => fs.existsSync(c));
}

const enginePath = findEngine();
if (!enginePath || !fs.existsSync(enginePath)) {
  console.error('Motor não encontrado. Compile primeiro (veja engine/README.md) ou use --engine=CAMINHO.');
  process.exit(2);
}

const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.log('[motor/stdout não-JSON]', line);
    return;
  }
  if (msg.event === 'ready') {
    readyResolve(msg);
  } else if (msg.event === 'scan-progress') {
    process.stdout.write(`  varrendo: ${msg.plugin}\n`);
  } else if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    msg.ok ? resolve(msg.result) : reject(new Error(msg.error));
  }
});

child.on('exit', (code) => {
  if (!quitting) console.error(`Motor encerrou inesperadamente (código ${code}).`);
});

function request(cmd, payload = {}, timeoutMs = 20000) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let quitting = false;

async function main() {
  const hello = await Promise.race([ready, sleep(10000).then(() => null)]);
  if (!hello) throw new Error('O motor não ficou pronto em 10 s.');
  console.log(`Motor pronto: v${hello.version} em ${hello.os} (formatos: ${hello.formats})`);

  await request('ping');
  console.log('ping: ok');

  const devices = await request('devices');
  console.log('\nDispositivos de áudio:');
  for (const t of devices.audioTypes) {
    console.log(`  [${t.type}] saídas: ${t.outputs.join(' | ') || '-'}`);
  }
  console.log('MIDI de entrada:', devices.midiInputs.map((d) => d.name).join(' | ') || '(nenhum)');

  console.log('\nVarrendo plugins (pode demorar na primeira vez)...');
  const scan = await request(
    'scan',
    { rescan: flag('rescan'), paths: values('path') },
    10 * 60 * 1000
  );
  console.log(`Plugins conhecidos: ${scan.count}`);
  for (const p of scan.plugins.slice(0, 15)) {
    console.log(`  - ${p.name} (${p.manufacturer}) ${p.isInstrument ? '[instrumento]' : '[efeito]'}`);
  }
  if (scan.plugins.length > 15) console.log(`  ... e mais ${scan.plugins.length - 15}`);
  if (scan.failed.length) console.log('Falharam:', scan.failed.join(', '));

  const wanted = first('plugin');
  if (!wanted) {
    console.log('\nUse --plugin=NOME para carregar um plugin.');
    return;
  }

  const match = scan.plugins.find((p) => p.name.toLowerCase().includes(wanted.toLowerCase()));
  const target = match ? match.id : wanted;
  console.log(`\nCarregando: ${match ? match.name : wanted}`);
  const plugin = await request('load', { plugin: target }, 60000);
  console.log(`Carregado: ${plugin.name} — ${plugin.parameterCount} parâmetros`);

  const params = await request('params');
  for (const p of params.slice(0, 10)) {
    console.log(`  [${p.index}] ${p.name}: ${p.text} ${p.label}`.trimEnd());
  }

  if (params.length) {
    const changed = await request('setParam', { index: params[0].index, value: 0.5 });
    console.log(`\nsetParam[0] -> ${changed.value.toFixed(2)} (${changed.text})`);
  }

  if (flag('audio')) {
    console.log('\nAbrindo áudio...');
    const audio = await request('audioStart', { inputs: plugin.isInstrument ? 0 : 2, outputs: 2 });
    const cur = audio.current;
    console.log(`Áudio: ${cur.type} / ${cur.name} @ ${cur.sampleRate} Hz, buffer ${cur.bufferSize}`);

    const note = Number(first('note', 60));
    console.log(`Tocando a nota ${note} por 1,5 s — você deve ouvir o som.`);
    await request('noteOn', { note, velocity: 100 });
    await sleep(1500);
    await request('noteOff', { note });
    await sleep(1000);
    await request('panic');
  } else {
    console.log('\nPara ouvir o som, rode de novo com --audio.');
  }
}

main()
  .catch((err) => {
    console.error('\nERRO:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    quitting = true;
    try {
      await request('quit', {}, 3000);
    } catch {
      /* já encerrou */
    }
    child.stdin.end();
    setTimeout(() => child.kill(), 1500).unref();
  });
