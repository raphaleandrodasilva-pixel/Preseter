#!/usr/bin/env node
/**
 * Grava alguns segundos de silêncio do motor e mede o nível.
 *
 * Serve para diferenciar ruído do engine de ruído do driver/dispositivo.
 * Abra o Preseter vazio (sem patch) e rode, por exemplo:
 *
 *   node scripts/engine-audio-silence.js --type=ASIO --rate=44100 --buffer=256 \
 *     --output="ASIO4ALL v2" --input="ASIO4ALL v2"
 *
 * Opções: --type, --rate, --buffer, --inputs, --output, --input, --seconds.
 * Requer o engine compilado em engine/build.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function findEngine() {
  const explicit = opt('engine', process.env.PRESETER_ENGINE);
  if (explicit) return explicit;
  const exe = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
  const base = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts');
  return ['Release', 'Debug', 'RelWithDebInfo', '.']
    .map((dir) => path.join(base, dir, exe))
    .find((candidate) => fs.existsSync(candidate));
}

const engine = findEngine();
if (!engine || !fs.existsSync(engine)) {
  console.error('Motor não encontrado. Compile o engine primeiro.');
  process.exit(2);
}

const type = opt('type', 'ASIO');
const rate = Number(opt('rate', '44100'));
const buffer = Number(opt('buffer', '256'));
const inputs = Number(opt('inputs', '0'));
const seconds = Number(opt('seconds', '3'));
const output = opt('output', '');
const input = opt('input', '');
const wav = path.join(os.tmpdir(), `preseter-silence-${Date.now()}.wav`);

const child = spawn(engine, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.event === 'ready') readyResolve(message);
  else if (message.id !== undefined && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.ok ? request.resolve(message.result) : request.reject(new Error(message.error));
  }
});

function request(cmd, payload = {}, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Tempo esgotado em "${cmd}".`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function quit() {
  try { await request('audioStop', {}, 10000); } catch { /* já parado */ }
  try { await request('quit', {}, 3000); } catch { /* encerrando */ }
  child.stdin.end();
  setTimeout(() => child.kill(), 1000).unref();
}

(async () => {
  await Promise.race([
    ready,
    sleep(15000).then(() => { throw new Error('O motor não ficou pronto em 15 s.'); }),
  ]);

  const options = { type, inputs, outputs: 2, sampleRate: rate, bufferSize: buffer, midi: false };
  if (output) options.output = output;
  if (input) options.input = input;

  const audio = await request('audioStart', options);
  console.log(`Áudio: ${audio.current?.type} · ${audio.current?.name}`);
  console.log(
    `${audio.current?.sampleRate} Hz · buffer ${audio.current?.bufferSize} · ` +
    `${audio.current?.inputChannels} entrada(s) · ${audio.current?.outputChannels} saída(s)`
  );

  await sleep(1000);
  await request('recordStart', { path: wav });
  await sleep(seconds * 1000);
  await request('recordStop', {});
  console.log(`WAV: ${wav}`);

  await quit();
})().catch(async (error) => {
  console.error('FALHA:', error.message);
  await quit();
  process.exitCode = 1;
});
