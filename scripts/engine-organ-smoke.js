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

(async () => {
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('engine not ready')), 15000))]);
  console.log('ready');

  const loaded = await request('load', { plugin: 'preseter.organ', layerId: 'organ-smoke' });
  console.log('load:', loaded.name, '| params', loaded.parameterCount, '| programs', loaded.programCount);

  const params = await request('params', { layerId: 'organ-smoke' });
  console.log('params:', params.length);
  console.log(params.slice(0, 5).map((p) => `${p.index}:${p.name}=${p.value.toFixed(3)}`).join(' | '));

  // programa 2 = Rock
  console.log('setProgram:', (await request('setProgram', { layerId: 'organ-smoke', index: 2 })).program);

  // mexe em alguns parâmetros (valores normalizados)
  const set = async (index, value) => request('setParam', { layerId: 'organ-smoke', index, value });
  await set(0, 1.0);      // drawbar 16
  await set(9, 1.0);      // percussion on
  await set(15, 1.0);     // overdrive
  await set(19, 1.0);     // volume

  const state = await request('getState', { layerId: 'organ-smoke' });
  console.log('state bytes:', state.data ? state.data.length : JSON.stringify(state).length);
  await request('setState', { layerId: 'organ-smoke', data: state.data });
  console.log('setState: ok');

  const unloaded = await request('unload', { layerId: 'organ-smoke' });
  console.log('unload:', unloaded.unloaded);
  child.stdin.end();
  process.exit(0);
})().catch((error) => {
  console.error('FAIL', error.message);
  child.kill();
  process.exit(1);
});
