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
 *   --devices          só lista os dispositivos de áudio/MIDI e sai
 *   --audio            abre o áudio e toca uma nota (dispositivo padrão, se nada abaixo)
 *   --type=ASIO        tipo de áudio: use um nome exatamente como aparece em --devices
 *   --output="NOME"    dispositivo de saída (ex.: o nome do driver ASIO)
 *   --input="NOME"     dispositivo de entrada
 *   --rate=48000       taxa de amostragem (deve combinar com a do painel do driver ASIO)
 *   --buffer=512       tamanho do buffer em amostras
 *   --inputs=N / --outputs=N   nº de canais (padrão 0 ou 2 entradas / 2 saídas)
 *   --note=60          nota MIDI a tocar (padrão 60 = Dó central)
 *   --rescan           ignora a lista salva e varre tudo de novo
 *   --path=PASTA       pasta extra de plugins (pode repetir)
 *   --require-asio     falha se este engine não tiver o backend ASIO compilado
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
  console.log(`ASIO: backend ${devices.asioSupported ? 'compilado' : 'indisponível'}; driver ${devices.asioDriverAvailable ? 'encontrado' : 'não encontrado'}`);
  if (flag('require-asio') && !devices.asioSupported) {
    throw new Error('O engine foi compilado sem o backend ASIO.');
  }
  console.log('\nDispositivos de áudio:');
  for (const t of devices.audioTypes) {
    console.log(`  [${t.type}]`);
    console.log(`     saídas : ${t.outputs.join(' | ') || '-'}`);
    console.log(`     entradas: ${t.inputs.join(' | ') || '-'}`);
  }
  console.log('MIDI de entrada:', devices.midiInputs.map((d) => d.name).join(' | ') || '(nenhum)');
  if (flag('devices')) return;

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

  let mix = await request('mix');
  let layerMix = mix.layers.find((layer) => layer.layerId === plugin.layerId);
  if (!layerMix) throw new Error('O estado de mixagem não inclui o instrumento carregado.');
  if (layerMix.volumeDb !== 0 || layerMix.pan !== 0 || layerMix.muted || layerMix.solo) {
    throw new Error('Os controles do channel strip não iniciaram nos valores padrão.');
  }

  mix = await request('setLayerMix', {
    layerId: plugin.layerId,
    volumeDb: -12,
    pan: 0.25,
    muted: true,
    solo: true,
  });
  layerMix = mix.layers.find((layer) => layer.layerId === plugin.layerId);
  if (layerMix?.volumeDb !== -12 || layerMix.pan !== 0.25 || !layerMix.muted || !layerMix.solo) {
    throw new Error('Os controles de volume, pan, mute ou solo não foram aplicados.');
  }

  mix = await request('setMasterMix', { volumeDb: -3, muted: true });
  if (mix.master.volumeDb !== -3 || !mix.master.muted) {
    throw new Error('Os controles do channel strip Master não foram aplicados.');
  }

  let invalidMixRejected = false;
  try {
    await request('setLayerMix', { layerId: plugin.layerId, volumeDb: 7 });
  } catch (error) {
    if (!/volume/i.test(error.message)) throw error;
    invalidMixRejected = true;
  }
  if (!invalidMixRejected) throw new Error('O engine aceitou um volume fora do limite de +6 dB.');
  console.log('Mixagem: volume, pan, mute, solo, Master e validação de limites: ok');

  await request('setLayerMix', {
    layerId: plugin.layerId,
    volumeDb: 0,
    pan: 0,
    muted: false,
    solo: false,
  });
  await request('setMasterMix', { volumeDb: 0, muted: false });

  // Fase 3.4: transpose e faixa de velocity.
  const transposeArg = first('transpose');
  if (transposeArg !== undefined) {
    const semitones = Number(transposeArg);
    if (!Number.isFinite(semitones)) throw new Error('--transpose precisa ser um número.');
    await request('setTranspose', { semitones });
    let rejected = false;
    try {
      await request('setTranspose', { semitones: 99 });
    } catch (error) {
      if (!/transpose/i.test(error.message)) throw error;
      rejected = true;
    }
    if (!rejected) throw new Error('O engine aceitou um transpose fora de -48..48.');
    await request('setTranspose', { semitones });
    console.log(`Transpose: ${semitones} semitons: ok`);
  }

  const velocityArg = first('velocity');
  if (velocityArg !== undefined) {
    const [minRaw, maxRaw] = velocityArg.split(':');
    const minVelocity = Number(minRaw);
    const maxVelocity = Number(maxRaw);
    if (!Number.isFinite(minVelocity) || !Number.isFinite(maxVelocity)) {
      throw new Error('--velocity precisa estar no formato MIN:MAX.');
    }
    await request('setLayerVelocityRange', { layerId: plugin.layerId, minVelocity, maxVelocity });
    let rejected = false;
    try {
      await request('setLayerVelocityRange', { layerId: plugin.layerId, minVelocity: 0, maxVelocity: 127 });
    } catch (error) {
      if (!/velocity/i.test(error.message)) throw error;
      rejected = true;
    }
    if (!rejected) throw new Error('O engine aceitou velocity fora de 1..127.');
    await request('setLayerVelocityRange', { layerId: plugin.layerId, minVelocity: 1, maxVelocity: 127 });
    console.log(`Velocity do layer: ${minVelocity}..${maxVelocity}: ok`);
  }

  const params = await request('params');
  for (const p of params.slice(0, 10)) {
    console.log(`  [${p.index}] ${p.name}: ${p.text} ${p.label}`.trimEnd());
  }

  if (params.length) {
    const target = params[0];
    const newValue = target.value < 0.5 ? 0.9 : 0.1; // sempre um valor diferente do atual
    const changed = await request('setParam', { index: target.index, value: newValue });
    console.log(
      `\nsetParam "${target.name}": ${target.value.toFixed(2)} -> ${changed.value.toFixed(2)} (${changed.text})`
    );
  }

  if (flag('audio')) {
    const options = {
      inputs: Number(first('inputs', plugin.isInstrument ? 0 : 2)),
      outputs: Number(first('outputs', 2)),
    };
    if (first('type')) options.type = first('type');
    if (first('output')) options.output = first('output');
    if (first('input')) options.input = first('input');
    if (first('rate')) options.sampleRate = Number(first('rate'));
    if (first('buffer')) options.bufferSize = Number(first('buffer'));

    console.log('\nAbrindo áudio com:', JSON.stringify(options));
    const audio = await request('audioStart', options);
    const cur = audio.current;
    console.log(`Áudio aberto: [${cur.type}] ${cur.name}`);
    console.log(
      `  ${cur.sampleRate} Hz, buffer ${cur.bufferSize}, ` +
        `${cur.inputChannels} entrada(s), ${cur.outputChannels} saída(s), ` +
        `latência de saída ~${cur.outputLatencyMs.toFixed(1)} ms`
    );
    if (cur.outputChannels === 0) {
      console.log('  ATENÇÃO: o dispositivo abriu com 0 canais de saída — não vai sair som.');
    }

    const note = Number(first('note', 60));
    console.log(`Tocando a nota ${note} por 1,5 s — você deve ouvir o som.`);
    let secondTestLayer;
    if (plugin.name === 'Preseter Test Synth') {
      secondTestLayer = await request('load', { plugin: target, layerId: 'smoke-solo-check' }, 60000);
      await request('setLayerMix', { layerId: plugin.layerId, solo: true });
      await request('setMasterMix', { muted: true });
    }
    await request('noteOn', { note, velocity: 100 });
    await sleep(300);
    mix = await request('mix');
    layerMix = mix.layers.find((layer) => layer.layerId === plugin.layerId);
    if (plugin.name === 'Preseter Test Synth' && (!layerMix || layerMix.peakDb <= -100)) {
      throw new Error('O medidor do instrumento Test Synth não detectou sinal de áudio.');
    }
    if (secondTestLayer) {
      const soloedOut = mix.layers.find((layer) => layer.layerId === secondTestLayer.layerId);
      if (!soloedOut || soloedOut.peakDb > -99) {
        throw new Error('O solo não silenciou o outro channel strip.');
      }
      if (mix.master.peakDb > -99) {
        throw new Error('O mute Master não silenciou a saída do grafo.');
      }
      await request('noteOff', { note });
      await request('setMasterMix', { muted: false });
      await request('setLayerMix', { layerId: plugin.layerId, solo: false });
      await request('unload', { layerId: secondTestLayer.layerId });
    }
    console.log(`Medidor do instrumento: ${layerMix?.peakDb.toFixed(1) ?? 'indisponível'} dBFS`);
    await sleep(1200);
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
