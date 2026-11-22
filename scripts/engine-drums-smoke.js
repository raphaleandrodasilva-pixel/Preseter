#!/usr/bin/env node
/*
 * Teste de fumaça do Preseter Drums.
 *
 * D2: carrega, aparece com um programa, salva/restaura o estado e fica em
 *     silêncio quando não há nota.
 * D3: com o kit carregado (SF2 do MuseScore_General, banco 128 / programa 0),
 *     notas disparam os pads com áudio não nulo, a velocity muda o nível e o
 *     chimbal aberto é calado pelo fechado.
 *
 * Uso (Windows, com o ASIO4ALL livre):
 *   node scripts/engine-drums-smoke.js --type=ASIO --output="ASIO4ALL v2" \
 *     --input="ASIO4ALL v2" --rate=44100 --buffer=256
 *
 * Opções:
 *   --kit=CAMINHO   SF2/SFZ do kit (padrão: ~/PreseterSons/MuseScore_General/MuseScore_General.sf2)
 *   --no-audio      só carga e estado (não mede áudio)
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
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
  return ['Release', 'Debug', 'RelWithDebInfo', '.']
    .map((dir) => path.join(base, dir, exe))
    .find((candidate) => fs.existsSync(candidate));
}

const enginePath = findEngine();
if (!enginePath || !fs.existsSync(enginePath)) {
  console.error('Motor não encontrado. Compile o engine ou use --engine=CAMINHO.');
  process.exit(2);
}

const defaultKit = path.join(os.homedir(), 'PreseterSons', 'MuseScore_General',
                             'MuseScore_General.sf2');
const kitPath = first('kit', defaultKit);
if (!fs.existsSync(kitPath)) {
  console.error(`Kit não encontrado: ${kitPath}`);
  console.error('Instale o MuseScore_General na pasta de sons ou passe --kit=CAMINHO.');
  process.exit(2);
}

const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map();
let nextId = 1;
let readyResolve;
const ready = new Promise((resolve) => (readyResolve = resolve));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.event === 'ready') {
    readyResolve(message);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
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
      reject(new Error(`timeout ${cmd}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function analyse(file) {
  let ffmpeg;
  try {
    ffmpeg = require('ffmpeg-static');
  } catch {
    return { ok: false, message: 'ffmpeg-static não está instalado' };
  }
  const result = spawnSync(
    ffmpeg,
    ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null',
     process.platform === 'win32' ? 'NUL' : '/dev/null'],
    { encoding: 'utf8' }
  );
  const text = `${result.stderr ?? ''}`;
  const max = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(text);
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(text);
  if (!max) return { ok: false, message: 'não foi possível medir o volume' };
  return { ok: true, maxDb: Number(max[1]), meanDb: mean ? Number(mean[1]) : null };
}

async function record(file, durationMs, play) {
  await request('recordStart', { path: file });
  if (play) await play();
  await sleep(durationMs);
  await request('recordStop', {});
  const measured = analyse(file);
  try { fs.unlinkSync(file); } catch { /* arquivo temporário */ }
  return measured;
}

async function hit(note, velocity) {
  await request('noteOn', { note, velocity });
  await sleep(110);
  await request('noteOff', { note });
  await sleep(40);
}

async function shutdown() {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await request('quit', {}, 2000).catch(() => {});
  child.stdin.end();
  await Promise.race([exited, sleep(1200)]);
  if (child.exitCode === null) child.kill('SIGKILL');
  await Promise.race([exited, sleep(800)]);
}

(async () => {
  const layerId = 'drums-smoke';
  const tempDir = os.tmpdir();
  let failed = false;
  const fail = (message) => {
    failed = true;
    console.error('FALHA:', message);
  };

  try {
    await Promise.race([
      ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('motor não ficou pronto')), 15000)),
    ]);

    const loaded = await request('load', {
      plugin: 'preseter.drums',
      layerId,
      samplePath: kitPath,
      kitBank: 128,
      kitProgram: 0,
    });
    console.log('carregou:', loaded.name, '| programas:', loaded.programCount, '| parâmetros:', loaded.parameterCount);
    if (loaded.name !== 'Preseter Drums') fail(`nome inesperado: ${loaded.name}`);
    if (loaded.programCount !== 1) fail(`programas: ${loaded.programCount} (esperado 1)`);

    const state1 = await request('getState', { layerId });
    if (!state1?.data) fail('getState não devolveu estado');
    else {
      const applied = await request('setState', { layerId, data: state1.data });
      const state2 = await request('getState', { layerId });
      console.log('estado:', `base64 ${state1.data.length} caracteres`,
                  `| bytes ao restaurar: ${applied.bytes}`,
                  `| restaurado: ${state2?.data ? 'sim' : 'não'}`);
      if (!state2?.data) fail('setState não restaurou um estado válido');
    }

    if (flag('no-audio')) {
      console.log('sem áudio (--no-audio): pads não verificados');
    } else {
      const audioOptions = {
        outputs: 2,
        inputs: Number(first('inputs', '2')),
        sampleRate: Number(first('rate', '44100')),
        bufferSize: Number(first('buffer', '256')),
        type: first('type', process.platform === 'win32' ? 'ASIO' : ''),
        output: first('output', process.platform === 'win32' ? 'ASIO4ALL v2' : ''),
        input: first('input', process.platform === 'win32' ? 'ASIO4ALL v2' : ''),
      };
      const audio = await request('audioStart', audioOptions, 30000);
      console.log('áudio:', audio?.current?.type, audio?.current?.name,
                  `${audio?.current?.sampleRate} Hz / ${audio?.current?.bufferSize}`);
      await request('setHostClock', { bpm: 120, numerator: 4, denominator: 4, playing: true });

      const kitName = path.basename(kitPath);
      const silence = await record(path.join(tempDir, `drums-silencio-${process.pid}.wav`), 700);
      if (!silence.ok) fail(silence.message);
      else {
        console.log('silêncio sem nota:', `max ${silence.maxDb} dB`);
        if (silence.maxDb > -80) fail(`não ficou em silêncio sem nota (max ${silence.maxDb} dB)`);
      }

      const sound = await record(path.join(tempDir, `drums-som-${process.pid}.wav`), 1100, async () => {
        for (const note of [36, 38, 42, 46, 49]) await hit(note, 127);
      });
      if (!sound.ok) fail(sound.message);
      else {
        console.log(`som (${kitName}):`, `max ${sound.maxDb} dB | mean ${sound.meanDb} dB`);
        if (sound.maxDb < -60) fail(`os pads não produziram áudio (max ${sound.maxDb} dB)`);
      }

      const strong = await record(path.join(tempDir, `drums-v127-${process.pid}.wav`), 700,
                                  async () => { await hit(38, 127); });
      const soft = await record(path.join(tempDir, `drums-v40-${process.pid}.wav`), 700,
                                async () => { await hit(38, 40); });
      if (!strong.ok || !soft.ok) fail('não foi possível medir a velocity');
      else {
        console.log('velocity:', `127 -> max ${strong.maxDb} dB`, `| 40 -> max ${soft.maxDb} dB`);
        if (strong.maxDb === soft.maxDb) fail('a velocity não mudou o nível');
        if (strong.maxDb < soft.maxDb) fail('velocity 127 ficou mais baixa que 40');
      }

      // v1.1: troca de kit em tempo real.
      const kitDirect = await request('loadDrumKit', {
        layerId, path: kitPath, bank: 128, program: 24,
      });
      console.log('kit direto:', `programa ${kitDirect.kitProgram}`, '|', kitDirect.kit);
      if (kitDirect.kitProgram !== 24) fail('loadDrumKit não trocou o programa');
      await request('loadDrumKit', { layerId, path: kitPath, bank: 128, program: 0 });

      // v1.1: SF2/SFZ próprio por pad.
      const padSource = await request('setDrumPadSource', {
        layerId, pad: 0, path: kitPath, bank: 128, program: 24, note: 36,
      });
      console.log('sample do pad 0:', padSource.pads?.[0]?.source?.program,
                  '| nota', padSource.pads?.[0]?.source?.note);
      if (padSource.pads?.[0]?.source?.program !== 24)
        fail('setDrumPadSource não aplicou o sample do pad');
      const padSourceSound = await record(
        path.join(tempDir, `drums-padsample-${process.pid}.wav`), 800,
        async () => { await hit(36, 110); });
      if (!padSourceSound.ok) fail(padSourceSound.message);
      else if (padSourceSound.maxDb < -60)
        fail(`o sample do pad não tocou (max ${padSourceSound.maxDb} dB)`);
      const padCleared = await request('setDrumPadSource', {
        layerId, pad: 0, path: '', bank: 128, program: 0, note: 36,
      });
      if (padCleared.pads?.[0]?.source)
        fail('setDrumPadSource vazio não voltou ao kit');

      // Chimbal: o aberto (46) é calado quando o fechado (42) toca. Mede as
      // vozes do fechado sozinho e confere que, na sequência, elas não somam.
      await request('noteOn', { note: 42, velocity: 127 });
      await sleep(20);
      const closedAlone = (await request('voices', { layerId })).activeVoices ?? 0;
      await request('noteOff', { note: 42 });
      await sleep(350);

      await request('noteOn', { note: 46, velocity: 127 });
      await sleep(80);
      const openVoices = (await request('voices', { layerId })).activeVoices ?? 0;
      await request('noteOff', { note: 46 });
      await request('noteOn', { note: 42, velocity: 127 });
      await sleep(20);
      const closedVoices = (await request('voices', { layerId })).activeVoices ?? 0;
      await request('noteOff', { note: 42 });
      console.log('chimbal: aberto', openVoices, '| fechado sozinho', closedAlone,
                  '| após o fechado', closedVoices);
      if (openVoices < 1 || closedAlone < 1) fail('chimbal não disparou voz');
      if (closedVoices >= openVoices + closedAlone)
        fail('o chimbal fechado não calou o aberto (vozes somaram)');

      // D4: sequenciador. Padrão de 16 passos (bumbo, caixa e chimbal).
      const makeSteps = (onSteps, velocity) =>
        Array.from({ length: 16 }, (_, index) => ({
          on: onSteps.includes(index),
          velocity,
        }));
      const pattern = {
        stepsPerBar: 16,
        bars: 1,
        swing: 0,
        tracks: [
          { pad: 0, level: 0, steps: makeSteps([0, 4, 8, 12], 120) },
          { pad: 2, level: 0, steps: makeSteps([4, 12], 110) },
          { pad: 6, level: -6, steps: makeSteps([...Array(16).keys()], 70) },
        ],
      };
      const drums = await request('setDrums', { layerId, enabled: true, pattern });
      console.log('sequenciador:', `passos ${drums.totalSteps}`, `| trilhas ${drums.trackCount}`,
                  `| ligado ${drums.enabled}`);
      if (drums.totalSteps !== 16) fail(`totalSteps: ${drums.totalSteps}`);
      if (drums.trackCount !== 3) fail(`trackCount: ${drums.trackCount}`);
      if (!drums.enabled) fail('o sequenciador não ligou');

      // Entra no começo do compasso: espera o próximo (até 2 s a 120 BPM).
      await sleep(2300);
      const seqSound = await record(path.join(tempDir, `drums-seq-${process.pid}.wav`), 2200);
      if (!seqSound.ok) fail(seqSound.message);
      else {
        console.log('sequenciador som:', `max ${seqSound.maxDb} dB`, `| mean ${seqSound.meanDb} dB`);
        if (seqSound.maxDb < -60)
          fail(`o sequenciador não produziu áudio (max ${seqSound.maxDb} dB)`);
      }

      const info = await request('drums', { layerId });
      console.log('passo atual:', info.currentStep, 'de', info.totalSteps);
      if (info.currentStep < 0 || info.currentStep >= info.totalSteps)
        fail(`passo atual inválido: ${info.currentStep}`);

      const position = await request('drumsPosition', { layerId });
      if (!position.enabled) fail('drumsPosition não reportou o sequenciador ligado');

      // D7: volume geral e solo transitório.
      const soloInfo = await request('setDrums', { layerId, gainDb: -6, soloPad: 0 });
      console.log('volume/solo:', `${soloInfo.gainDb} dB`, '| solo no pad 0:', soloInfo.pads[0].solo);
      if (soloInfo.gainDb !== -6) fail(`volume geral não aplicou: ${soloInfo.gainDb}`);
      if (!soloInfo.pads[0].solo || soloInfo.pads[2].solo)
        fail('solo não foi aplicado só no pad 0');
      await request('setDrums', { layerId, gainDb: 0, soloPad: -1 });

      // Troca de BPM com o sequenciador rodando.
      await request('setHostClock', { bpm: 97, numerator: 4, denominator: 4, playing: true });
      await sleep(400);
      const afterTempo = await request('drums', { layerId });
      console.log('após BPM 97: passo', afterTempo.currentStep, '| ligado', afterTempo.enabled);
      if (!afterTempo.enabled) fail('o sequenciador desligou ao trocar o BPM');

      // D5: Stop do concert para o sequenciador; Play volta do compasso 1.
      await request('setHostClock', { bpm: 97, numerator: 4, denominator: 4, playing: false });
      await sleep(2600);
      const transportStopped = await record(path.join(tempDir, `drums-stop-${process.pid}.wav`), 800);
      const stoppedInfo = await request('drums', { layerId });
      if (!transportStopped.ok) fail(transportStopped.message);
      else {
        console.log('stop do transporte:', `max ${transportStopped.maxDb} dB`,
                    `| passo ${stoppedInfo.currentStep}`);
        if (transportStopped.maxDb > -80)
          fail(`o Stop não silenciou (max ${transportStopped.maxDb} dB)`);
      }
      if (stoppedInfo.currentStep !== -1)
        fail(`o passo deveria ser -1 com o transporte parado (${stoppedInfo.currentStep})`);

      await request('setHostClock', { bpm: 120, numerator: 4, denominator: 4, playing: true });
      await sleep(2300);
      const transportPlay = await record(path.join(tempDir, `drums-play-${process.pid}.wav`), 1600);
      const playInfo = await request('drums', { layerId });
      if (!transportPlay.ok) fail(transportPlay.message);
      else {
        console.log('play do transporte:', `max ${transportPlay.maxDb} dB`,
                    `| passo ${playInfo.currentStep}`);
        if (transportPlay.maxDb < -60)
          fail(`o Play não religou o sequenciador (max ${transportPlay.maxDb} dB)`);
      }
      if (!playInfo.enabled || playInfo.currentStep < 0)
        fail('o sequenciador não voltou a andar no Play');

      // D6: estado do instrumento (padrão + kit + sample por pad).
      await request('setDrumPadSource', {
        layerId, pad: 0, path: kitPath, bank: 128, program: 24, note: 36,
      });
      const saved = await request('getState', { layerId });
      if (!saved?.data) fail('getState não devolveu o estado do Drums');

      const otherPattern = {
        stepsPerBar: 8,
        bars: 2,
        swing: 25,
        tracks: [{
          pad: 4,
          level: -3,
          steps: Array.from({ length: 16 }, (_, index) => ({
            on: index % 2 === 0,
            velocity: 90,
          })),
        }],
      };
      const changed = await request('setDrums', { layerId, enabled: true, pattern: otherPattern });
      console.log('estado: padrão trocado para', `${changed.stepsPerBar}×${changed.bars}`,
                  '| trilhas', changed.trackCount);
      if (changed.stepsPerBar !== 8 || changed.bars !== 2 || changed.trackCount !== 1)
        fail('setDrums não aplicou o padrão novo');

      await request('setState', { layerId, data: saved.data });
      const restored = await request('drums', { layerId });
      const firstStep = restored.tracks?.[0]?.steps?.[0];
      console.log('estado: restaurado', `${restored.stepsPerBar}×${restored.bars}`,
                  '| trilhas', restored.trackCount,
                  '| passo 0 =', firstStep ? `${firstStep.on}/${firstStep.velocity}` : 'n/a');
      if (restored.stepsPerBar !== 16 || restored.bars !== 1 || restored.trackCount !== 3)
        fail('o padrão não voltou igual');
      if (!firstStep?.on || firstStep.velocity !== 120)
        fail('a velocity do passo 0 não voltou');
      if (restored.tracks[0].steps[1]?.on)
        fail('o passo 1 deveria estar desligado');
      console.log('estado: sample do pad 0 =', restored.pads?.[0]?.source?.program ?? 'kit');
      if (restored.pads?.[0]?.source?.program !== 24)
        fail('o sample do pad não voltou com o estado');

      // Desliga e deixa as caudas morrerem: precisa voltar ao silêncio.
      await request('setDrums', { layerId, enabled: false });
      await sleep(3000);
      const stopped = await record(path.join(tempDir, `drums-parado-${process.pid}.wav`), 800);
      if (!stopped.ok) fail(stopped.message);
      else {
        console.log('sequenciador parado:', `max ${stopped.maxDb} dB`);
        if (stopped.maxDb > -80) fail(`não silenciou ao desligar (max ${stopped.maxDb} dB)`);
      }

      // D6: fechar/abrir — desmonta o layer e restaura num instrumento novo.
      await request('unload', { layerId });
      const reopenedId = `${layerId}-reopen`;
      await request('load', {
        plugin: 'preseter.drums',
        layerId: reopenedId,
        samplePath: kitPath,
        kitBank: 128,
        kitProgram: 0,
      });
      await request('setState', { layerId: reopenedId, data: saved.data });
      const reopened = await request('drums', { layerId: reopenedId });
      console.log('reaberto:', `${reopened.stepsPerBar}×${reopened.bars}`,
                  '| trilhas', reopened.trackCount,
                  '| kit', reopened.kit ? 'ok' : 'vazio');
      if (reopened.stepsPerBar !== 16 || reopened.trackCount !== 3)
        fail('o padrão não voltou no instrumento novo');
      if (!reopened.kit) fail('o kit não voltou no instrumento novo');
      if (reopened.pads?.[0]?.source?.program !== 24)
        fail('o sample do pad não voltou no instrumento novo');

      // D6: troca de kit pelo estado (blob válido de outro instrumento).
      const electronicId = `${layerId}-electronic`;
      await request('load', {
        plugin: 'preseter.drums',
        layerId: electronicId,
        samplePath: kitPath,
        kitBank: 128,
        kitProgram: 24,
      });
      const electronicState = await request('getState', { layerId: electronicId });
      await request('setState', { layerId: reopenedId, data: electronicState.data });
      const swappedInfo = await request('drums', { layerId: reopenedId });
      console.log('kit trocado:', swappedInfo.kit);
      if (!/programa 24/.test(swappedInfo.kit))
        fail('o estado não trocou o programa do kit');
      const swappedSound = await record(path.join(tempDir, `drums-kit-${process.pid}.wav`), 800,
        async () => {
          await request('noteOn', { note: 36, velocity: 110 });
          await sleep(150);
          await request('noteOff', { note: 36 });
        });
      if (!swappedSound.ok) fail(swappedSound.message);
      else if (swappedSound.maxDb < -60)
        fail(`o kit trocado não tocou (max ${swappedSound.maxDb} dB)`);
      await request('unload', { layerId: electronicId });

      // D6: instrumento novo (sem estado) abre vazio e sem erro.
      const emptyId = `${layerId}-empty`;
      await request('load', {
        plugin: 'preseter.drums',
        layerId: emptyId,
        samplePath: kitPath,
        kitBank: 128,
        kitProgram: 0,
      });
      const emptyInfo = await request('drums', { layerId: emptyId });
      console.log('instrumento novo: trilhas', emptyInfo.trackCount,
                  '| kit', emptyInfo.kit ? 'ok' : 'vazio');
      if (emptyInfo.trackCount !== 0 || !emptyInfo.kit)
        fail('instrumento novo não abriu vazio');
      await request('unload', { layerId: reopenedId });
      await request('unload', { layerId: emptyId });

      await request('setHostClock', { bpm: 120, numerator: 4, denominator: 4, playing: false });
    }

    await request('unload', { layerId });
    await shutdown();
    console.log(failed ? 'Resultado: FAIL' : 'Resultado: PASS');
    process.exit(failed ? 1 : 0);
  } catch (error) {
    console.error('FALHA:', error.message);
    try { child.kill(); } catch { /* já saiu */ }
    process.exit(1);
  }
})();
