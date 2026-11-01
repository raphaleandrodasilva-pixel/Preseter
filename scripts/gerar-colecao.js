#!/usr/bin/env node
/**
 * Gera um concert `.preseter` com a coleção de 40 patches de docs/PATCHES.md.
 *
 * Usa a mesma estrutura do app (Configurações → Coleção): só monta sets,
 * patches, camadas, faixas de teclas, volumes, programa e teclado. O SOM de
 * cada patch é escolhido dentro do plugin (tecla V) e salvo no patch.
 *
 * Uso (precisa do motor compilado e de `npm run build:main`):
 *   node scripts/gerar-colecao.js
 *   node scripts/gerar-colecao.js --out=Colecao.preseter
 *   node scripts/gerar-colecao.js --test               # tudo vira "Preseter Test Synth"
 *   node scripts/gerar-colecao.js --path=PASTA         # pasta extra de plugins (pode repetir)
 *   node scripts/gerar-colecao.js --engine=CAMINHO
 *   node scripts/gerar-colecao.js --listar=juicy       # mostra o que o motor enxerga
 *
 * Patches cujo plugin não foi encontrado são PULADOS e listados no final.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const values = (n) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.slice(n.length + 3));
const first = (n, d) => values(n)[0] ?? d;

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(path.join(dist, 'main', 'collection', 'generateCollection.js'))) {
  console.error('Rode `npm run build:main` antes.');
  process.exit(2);
}
const { parseConcertFile, serializeConcertFile } = require(path.join(dist, 'main', 'concert', 'ConcertFile.js'));
const { buildCollectionConcert } = require(path.join(dist, 'main', 'collection', 'generateCollection.js'));

function findEngine() {
  const explicit = first('engine', process.env.PRESETER_ENGINE);
  if (explicit) return explicit;
  const exe = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
  const base = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts');
  return ['Release', 'Debug', 'RelWithDebInfo', '.'].map((d) => path.join(base, d, exe)).find((c) => fs.existsSync(c));
}

let scanFailed = [];
async function scanPlugins() {
  const enginePath = findEngine();
  if (!enginePath || !fs.existsSync(enginePath)) {
    throw new Error('Motor não encontrado. Compile (engine/README.md) ou use --engine=CAMINHO.');
  }
  const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  const pending = new Map();
  let nextId = 1;
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.event === 'ready') readyResolve(msg);
    else if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      msg.ok ? resolve(msg.result) : reject(new Error(msg.error));
    }
  });
  const request = (cmd, payload = {}, ms = 20000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Tempo esgotado em "${cmd}"`)); }, ms);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
    });
  try {
    const hello = await Promise.race([ready, new Promise((r) => setTimeout(() => r(null), 10000))]);
    if (!hello) throw new Error('O motor não ficou pronto em 10 s.');
    console.log('Varrendo plugins instalados (pode demorar na primeira vez)...');
    const scan = await request('scan', { rescan: flag('rescan'), paths: values('path') }, 10 * 60 * 1000);
    scanFailed = scan.failed || [];
    return scan.plugins;
  } finally {
    try { await request('quit', {}, 3000); } catch { /* já encerrou */ }
    child.stdin.end();
    setTimeout(() => child.kill(), 1500).unref();
  }
}

async function main() {
  const plugins = await scanPlugins();
  console.log(`Plugins conhecidos: ${plugins.length}`);

  const listar = first('listar');
  if (listar !== undefined) {
    const re = new RegExp(listar, 'i');
    console.log(`\nPlugins que combinam com "${listar}":`);
    plugins
      .filter((p) => re.test(p.name) || re.test(p.id || '') || re.test(p.manufacturer || ''))
      .forEach((p) => console.log(`  - ${p.name} | fabricante: ${p.manufacturer} | instrumento: ${p.isInstrument} | ${p.id}`));
    console.log(`\nPlugins que FALHARAM na varredura (${scanFailed.length}):`);
    scanFailed.filter((f) => re.test(String(f))).forEach((f) => console.log(`  - ${f}`));
    return;
  }

  if (flag('test') && !plugins.some((p) => /test synth/i.test(p.name))) {
    throw new Error('Modo --test: "Preseter Test Synth" não apareceu na varredura.');
  }

  const { file, skipped, missing } = buildCollectionConcert(plugins, {
    tempo: 100,
    test: flag('test'),
  });
  const text = serializeConcertFile(file);
  const back = parseConcertFile(text);
  const out = path.resolve(first('out', flag('test') ? 'colecao-teste.preseter' : 'Colecao.preseter'));
  fs.writeFileSync(out, text);

  console.log(`\nGerado: ${out}`);
  console.log(`  ${back.sets.length} sets, ${back.patches.length} patches`);
  if (skipped.length) {
    console.log(`\nPulados (${skipped.length}):`);
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
  if (missing.length) {
    console.log(`\nInstale para completar: ${missing.join(', ')} (veja docs/PATCHES.md)`);
  }
  console.log('\nPróximo passo: abra o arquivo no Preseter, entre em cada patch, abra o plugin (tecla V),');
  console.log('escolha o preset/SF2 e salve o concert (o estado do plugin fica gravado no patch).');
}

main().catch((e) => {
  console.error('\nERRO:', e.message);
  process.exit(1);
});
