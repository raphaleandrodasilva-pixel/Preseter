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
  await request('load', { plugin: 'preseter.organ', layerId: 'organ-test' });
  const params = await request('params', { layerId: 'organ-test' });
  const leslie = params.find((p) => p.name.startsWith('Leslie'));
  console.log('leslie param:', leslie);
  if (!leslie) throw new Error('leslie param not found');

  for (const mode of [0, 1, 2, 3]) {
    const normalized = mode / 3;
    const result = await request('setParam', { layerId: 'organ-test', index: leslie.index, value: normalized });
    console.log('set', mode, '->', result.value, result.text);
  }
  child.stdin.end();
  process.exit(0);
})().catch((error) => {
  console.error('FAIL', error.message);
  child.kill();
  process.exit(1);
});
