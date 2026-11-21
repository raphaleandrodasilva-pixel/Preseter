const { spawn } = require('child_process');
const fs = require('fs');
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

const layerId = 'synth2-smoke';
const factoryDir = path.join(__dirname, '..', 'presets', 'synth2');
const byName = (params, name) => params.find((p) => p.name === name);

(async () => {
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('engine not ready')), 15000))]);
  console.log('ready');

  const loaded = await request('load', {
    plugin: 'preseter.synth2',
    layerId,
    factoryPatches: factoryDir,
  });
  console.log('load:', loaded.name, '| params', loaded.parameterCount, '| programas', loaded.programCount);
  if (loaded.programCount !== 58) throw new Error(`esperava 58 programas de fábrica, veio ${loaded.programCount}`);
  console.log('programas:', loaded.programNames.slice(0, 3).join(' | '), '…');

  let params = await request('params', { layerId });
  console.log('params:', params.length);
  if (params.length !== 100) throw new Error('esperava 100 parâmetros (99 do patch + volume)');

  const set = async (name, normalized) => {
    const param = byName(params, name);
    if (!param) throw new Error('parâmetro não encontrado: ' + name);
    const result = await request('setParam', { layerId, index: param.index, value: normalized });
    console.log(`setParam ${name} -> ${result.text} (${result.value.toFixed(3)})`);
    return result;
  };

  // Formas, filtro e envelopes.
  await set('osc1 shape', 1);        // saw
  await set('filter type', 0);       // LP12
  await set('filter freq', 0.65);
  await set('filter resonance', 0.25);
  await set('amp attack', 0.02);
  await set('amp release', 0.35);
  await set('lfo1 on/off', 1);
  await set('arpeggiator on/off', 0);

  // Exporta, mexe e reimporta o mesmo patch.
  const exported = await request('synth2SavePatch', { layerId, name: 'Smoke Patch' });
  if (!exported.data || !exported.data.startsWith('Smoke Patch\n')) throw new Error('export .sy1 inválido');
  console.log('sy1 exportado:', exported.data.split('\n').length - 1, 'linhas');

  params = await request('params', { layerId });
  await set('filter freq', 0.1);
  const loadedPatch = await request('synth2LoadPatch', { layerId, data: exported.data, name: 'Smoke Patch' });
  console.log('sy1 reimportado:', loadedPatch.name, '| patch:', loadedPatch.patchName);
  if (loadedPatch.patchName !== 'Smoke Patch') throw new Error('nome do patch .sy1 não voltou');
  params = await request('params', { layerId });
  const filterFreq = byName(params, 'filter freq');
  if (Math.abs(filterFreq.value - 0.65) > 0.02) {
    throw new Error(`filter freq não voltou: ${filterFreq.value}`);
  }

  // Estado completo (XML do APVTS) ida e volta.
  const state = await request('getState', { layerId });
  await set('filter freq', 0.2);
  await request('setState', { layerId, data: state.data });
  params = await request('params', { layerId });
  if (Math.abs(byName(params, 'filter freq').value - 0.65) > 0.02) {
    throw new Error('setState não restaurou o patch');
  }
  const layers = await request('layers');
  const layer = layers.find((item) => item.layerId === layerId);
  if (layer?.patchName !== 'Smoke Patch') throw new Error('setState perdeu o nome do patch');
  console.log('state: ida e volta ok (nome do patch preservado)');

  // Patch antigo (ver=100) exercita as tabelas de conversão do Sy1Codec.
  const legacy = 'Legacy Patch\nver=100\n0,1\n14,1\n19,90\n25,0\n28,30\n';
  const legacyLoaded = await request('synth2LoadPatch', { layerId, data: legacy, name: 'Legacy Patch' });
  if (legacyLoaded.patchName !== 'Legacy Patch') throw new Error('patch legado não carregou');
  console.log('sy1 legado (ver=100): ok');

  // Programas internos: o seletor de programas usa o banco de fábrica.
  const program = await request('setProgram', { layerId, index: 1 });
  console.log('setProgram 1:', program.program, '|', program.patchName);
  if (program.program !== 1) throw new Error('setProgram não aplicou o programa 1');
  if (program.patchName !== 'PAD PWM Chorus') {
    throw new Error(`nome do programa 1 inesperado: ${program.patchName}`);
  }
  params = await request('params', { layerId });
  const programFilter = byName(params, 'filter freq');
  if (!programFilter) throw new Error('parâmetros sumiram após o programa');
  console.log('programa 1 aplicado nos parâmetros');

  // Banco de fábrica: todos os .sy1 que vão no instalador precisam carregar.
  const factoryFiles = fs.existsSync(factoryDir)
    ? fs.readdirSync(factoryDir).filter((file) => file.toLowerCase().endsWith('.sy1')).sort()
    : [];
  if (factoryFiles.length === 0) throw new Error('banco de fábrica vazio (presets/synth2)');
  for (const file of factoryFiles) {
    const data = fs.readFileSync(path.join(factoryDir, file), 'latin1');
    const result = await request('synth2LoadPatch', { layerId, data, name: file });
    if (result.patchName !== file) throw new Error(`patch de fábrica não carregou: ${file}`);
  }
  console.log(`fábrica: ${factoryFiles.length} patches .sy1 carregados`);

  // Notas: precisa gerar áudio sem NaN e sem silêncio (checado pelo engine
  // quando um dispositivo está aberto; aqui só exercita o MIDI).
  let audioStarted = false;
  try {
    await request('audioStart', { outputs: 2 });
    audioStarted = true;
    console.log('audio: dispositivo aberto');
  } catch (error) {
    console.log('audio indisponível, pulando notas:', error.message);
  }

  if (audioStarted) {
    await set('amp gain', 0.8);
    await set('amp sustain', 0.9);
    await request('noteOn', { note: 60, velocity: 100 });
    await request('noteOn', { note: 64, velocity: 100 });
    await request('noteOn', { note: 67, velocity: 100 });
    await request('midi', { bytes: [0xb0, 1, 64] });       // modwheel
    await request('midi', { bytes: [0xe0, 0, 96] });       // pitch bend
    await request('midi', { bytes: [0xb0, 64, 127] });     // sustain
    await new Promise((resolve) => setTimeout(resolve, 400));

    const mix = await request('mix');
    const peaks = (mix.strips ?? []).map((strip) => `${strip.layerId}:${strip.peakDb}`).join(', ');
    console.log('mix:', peaks || JSON.stringify(mix).slice(0, 200));

    await request('noteOff', { note: 60 });
    await request('noteOff', { note: 64 });
    await request('noteOff', { note: 67 });
    await request('midi', { bytes: [0xb0, 64, 0] });
    await request('panic');
    console.log('midi: notas, bend, CC1 e sustain ok');
  }

  const unloaded = await request('unload', { layerId });
  console.log('unload:', unloaded.unloaded);
  child.stdin.end();
  process.exit(0);
})().catch((error) => {
  console.error('FAIL', error.message);
  child.kill();
  process.exit(1);
});
