const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const exe = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts', 'Release', 'PreseterEngine.exe');
const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.event === 'ready') readyResolve(msg);
  else if (msg.id !== undefined && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
  }
});

function request(cmd, payload = {}, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + cmd)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
  });
}

async function testKind(kind) {
  const layerId = `${kind}-test`;
  const loaded = await request('load', { plugin: `preseter.${kind}`, layerId });
  const params = await request('params', { layerId });
  console.log(`\n${kind}: ${loaded.parameterCount} params, ${loaded.programCount} programas`);
  console.log(params.map((p) => `${p.index}:${p.name}`).join(' | '));

  const mode = params.find((p) => p.name === 'Modulation');
  if (mode) {
    await request('setProgram', { layerId, index: 0 });
    const after = await request('getParam', { layerId, index: mode.index });
    console.log(`programa 0 -> modulation = ${after.value} (${after.text})`);
  } else {
    const depth = params.find((p) => p.name === 'Profundidade do tremolo');
    if (!depth) throw new Error(`${kind}: parametro de tremolo nao encontrado`);
    await request('setProgram', { layerId, index: 0 });
    const after = await request('getParam', { layerId, index: depth.index });
    console.log(`programa 0 -> tremolo depth = ${after.value} (${after.text})`);
  }

  await request('unload', { layerId });
}

(async () => {
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('engine not ready')), 15000))]);
  await testKind('tines');
  await testKind('reeds');
  child.stdin.end();
  process.exit(0);
})().catch((error) => {
  console.error('FAIL', error.message);
  child.kill();
  process.exit(1);
});
