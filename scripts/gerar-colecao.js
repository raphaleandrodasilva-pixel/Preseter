#!/usr/bin/env node
/**
 * Gera um concert `.preseter` com a coleção de 40 patches de docs/PATCHES.md.
 *
 * O script monta a ESTRUTURA (sets, patches, camadas, faixas de teclas, volumes,
 * números de programa, teclado na tela). Ele NÃO escolhe o som dentro de cada
 * plugin (preset do Surge, arquivo SFZ etc.): isso você faz abrindo o plugin
 * no patch (tecla V) e salvando o concert.
 *
 * Uso (precisa do motor compilado e de `npm run build:main`):
 *   node scripts/gerar-colecao.js                      # procura os plugins instalados
 *   node scripts/gerar-colecao.js --out=Colecao.preseter
 *   node scripts/gerar-colecao.js --test               # tudo vira "Preseter Test Synth" (teste sem plugins)
 *   node scripts/gerar-colecao.js --sfz=sfizz          # usa sfizz no lugar do sforzando
 *   node scripts/gerar-colecao.js --path=PASTA         # pasta extra de plugins (pode repetir)
 *   node scripts/gerar-colecao.js --engine=CAMINHO
 *   node scripts/gerar-colecao.js --listar=helm        # mostra o que o motor enxerga (diagnóstico)
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

const dist = path.join(__dirname, '..', 'dist', 'main', 'concert');
if (!fs.existsSync(path.join(dist, 'ConcertFile.js'))) {
  console.error('Rode `npm run build:main` antes.');
  process.exit(2);
}
const { createDefaultConcertSettings, createEmptyLayout, parseConcertFile, serializeConcertFile } = require(
  path.join(dist, 'ConcertFile.js')
);
const { migrateConcertLayout } = require(path.join(__dirname, '..', 'dist', 'shared', 'concert-layout.js'));
const { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION } = require(path.join(__dirname, '..', 'dist', 'shared', 'constants.js'));

// ---------------------------------------------------------------- instrumentos
// Cada sigla tem expressões para achar o plugin pelo nome na lista do motor.
const SFZ_NAME = first('sfz', 'sforzando');
const INSTRUMENTS = {
  SFZ: { label: 'sforzando/sfizz (Salamander)', match: [new RegExp(SFZ_NAME, 'i'), /sfizz/i, /sforzando/i] },
  SF2: { label: 'SF2 Player (Bertom)', match: [/sf2 player/i, /sf2/i] },
  SURGE: { label: 'Surge XT', match: [/surge/i] },
  DEXED: { label: 'Dexed', match: [/dexed/i] },
  ODIN: { label: 'Odin 2', match: [/odin/i] },
  HELM: { label: 'Helm', match: [/helm/i] },
  MDA: { label: 'MDA', match: [/mda/i] },
  ORG: { label: 'setBfree', match: [/setbfree/i] },
};

// ---------------------------------------------------------------------- coleção
// camada: [instrumento, dB, nota mínima, nota máxima, rótulo]
const L = (inst, db = 0, min = 0, max = 127, label = '') => ({ inst, db, min, max, label });
const SETS = [
  ['Pianos', [
    ['Piano de Cauda', [L('SFZ', 0, 0, 127, 'Salamander')]],
    ['Piano de Cauda Brilhante', [L('SFZ', 0, 0, 127, 'Salamander + brilho')]],
    ['Piano Suave', [L('SFZ', 0, 0, 127, 'Salamander suave')]],
    ['Piano Vertical', [L('SF2', 0, 0, 127, 'Piano vertical')]],
    ['Piano + Pad', [L('SFZ', -6, 0, 127, 'Salamander'), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
  ['Teclas elétricas', [
    ['Elétrico Clássico', [L('MDA', -6, 0, 127, 'ePiano')]],
    ['Elétrico Suave', [L('DEXED', -6, 0, 127, 'E.Piano')]],
    ['Elétrico com Tremolo', [L('MDA', -6, 0, 127, 'ePiano + tremolo')]],
    ['Clavinet', [L('SURGE', -6, 0, 127, 'Clav')]],
    ['Sinos Elétricos', [L('DEXED', -6, 0, 127, 'Bell')]],
  ]],
  ['Órgãos', [
    ['Órgão Tonewheel', [L('ORG', -6, 0, 127, 'Tonewheel')]],
    ['Órgão Rock', [L('ORG', -6, 0, 127, 'Leslie rápido')]],
    ['Órgão de Igreja', [L('SF2', -6, 0, 127, 'Órgão de tubos')]],
    ['Órgão Suave', [L('SURGE', -6, 0, 127, 'Órgão')]],
  ]],
  ['Cordas e orquestra', [
    ['Cordas Legato', [L('SF2', -6, 0, 127, 'Cordas sustain')]],
    ['Cordas Staccato', [L('SF2', -6, 0, 127, 'Cordas staccato')]],
    ['Cordas Sintéticas', [L('SURGE', -6, 0, 127, 'String ensemble')]],
    ['Metais', [L('SF2', -6, 0, 127, 'Metais')]],
    ['Flauta', [L('SF2', -6, 0, 127, 'Flauta')]],
    ['Coral', [L('SF2', -6, 0, 127, 'Coral')]],
  ]],
  ['Pads', [
    ['Pad Quente', [L('SURGE', -6, 0, 127, 'Pad')]],
    ['Pad Ambiente', [L('ODIN', -6, 0, 127, 'Ataque longo')]],
    ['Pad de Cordas', [L('HELM', -6, 0, 127, 'Pad de cordas')]],
    ['Pad Brilhante', [L('SURGE', -6, 0, 127, 'Filtro aberto')]],
    ['Pad Escuro', [L('ODIN', -6, 0, 127, 'Filtro baixo')]],
  ]],
  ['Leads e sintetizadores', [
    ['Lead Serra', [L('SURGE', -6, 0, 127, 'Lead saw')]],
    ['Lead Suave', [L('ODIN', -6, 0, 127, 'Lead')]],
    ['Pluck', [L('SURGE', -6, 0, 127, 'Pluck')]],
    ['Arpejo Brilhante', [L('SURGE', -6, 0, 127, 'Arp')]],
    ['Brass Sintético', [L('MDA', -6, 0, 127, 'JX10')]],
  ]],
  ['Baixos', [
    ['Baixo Sintético', [L('SURGE', -6, 0, 127, 'Sub bass')]],
    ['Baixo Elétrico', [L('SF2', -6, 0, 127, 'Baixo elétrico')]],
    ['Baixo Acústico', [L('SF2', -6, 0, 127, 'Contrabaixo')]],
  ]],
  ['Layers e splits', [
    ['Split Baixo + Piano', [L('SF2', -6, 0, 59, 'Baixo'), L('SFZ', -6, 60, 127, 'Salamander')]],
    ['Split Baixo + Elétrico', [L('SURGE', -6, 0, 53, 'Sub bass'), L('DEXED', -6, 54, 127, 'E.Piano')]],
    ['Piano + Cordas', [L('SFZ', -6, 0, 127, 'Salamander'), L('SF2', -9, 0, 127, 'Cordas legato')]],
    ['Piano + Pad (worship)', [L('SFZ', -6, 0, 127, 'Salamander'), L('SURGE', -12, 0, 127, 'Pad quente')]],
    ['Elétrico + Pad', [L('DEXED', -6, 0, 127, 'E.Piano'), L('SURGE', -12, 0, 127, 'Pad')]],
    ['Split Cordas / Piano', [L('SF2', -6, 0, 59, 'Cordas'), L('SFZ', -6, 60, 127, 'Piano')]],
    ['Tripla: Piano + Cordas + Pad', [L('SFZ', -6, 0, 127, 'Salamander'), L('SF2', -9, 0, 127, 'Cordas'), L('SURGE', -12, 0, 127, 'Pad quente')]],
  ]],
];

// --------------------------------------------------------------- motor (JSON)
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

// ------------------------------------------------------------------ montagem
let counter = 0;
const nextId = (prefix) => `${prefix}_${Date.now().toString(36)}_${++counter}`;

function el(spec) {
  return {
    id: nextId('element'),
    type: spec.type,
    label: spec.label,
    x: spec.x, y: spec.y, width: spec.width, height: spec.height,
    color: '#9A9AA0',
    minValue: 0,
    maxValue: 1,
    orientation: 'vertical',
    isMomentary: false,
    value: spec.type === 'keyboard' ? undefined : 0.5,
    ...(spec.color ? { color: spec.color } : {}),
    ...(spec.cc ? { midiCommand: { type: 'cc', channel: 0, controllerNumber: spec.cc } } : {}),
  };
}

function keyboardRig(notes) {
  return [
    el({ type: 'keyboard', label: 'Teclado', x: 24, y: 148, width: 720, height: 220, color: '#0A84FF' }),
    el({ type: 'fader', label: 'Volume', x: 24, y: 24, width: 66, height: 112, cc: 7 }),
    el({ type: 'knob', label: 'Modulação', x: 104, y: 24, width: 96, height: 112, cc: 1 }),
    el({ type: 'midi-activity', label: 'MIDI', x: 216, y: 24, width: 128, height: 48 }),
    el({ type: 'label', label: notes, x: 216, y: 80, width: 260, height: 40 }),
  ];
}

function resolvePlugin(inst, plugins) {
  if (flag('test')) return plugins.find((p) => /test synth/i.test(p.name));
  const def = INSTRUMENTS[inst];
  for (const re of def.match) {
    const found = plugins.find((p) => re.test(p.name) && p.isInstrument !== false);
    if (found) return found;
  }
  return undefined;
}

function build(plugins) {
  const tempo = 100;
  const now = Date.now();
  const sets = [];
  const rawPatches = [];
  const skipped = [];
  const missing = new Set();
  let program = 0;

  for (const [setName, patches] of SETS) {
    const setId = nextId('set');
    let setOrder = 0;
    for (const [name, layers] of patches) {
      const assignments = [];
      let blocked = null;
      layers.forEach((layer, index) => {
        const plugin = resolvePlugin(layer.inst, plugins);
        if (!plugin) {
          blocked ??= INSTRUMENTS[layer.inst]?.blocked ?? `plugin "${INSTRUMENTS[layer.inst]?.label}" não encontrado`;
          if (!INSTRUMENTS[layer.inst]?.blocked) missing.add(INSTRUMENTS[layer.inst]?.label);
          return;
        }
        assignments.push({
          pluginId: plugin.id,
          layerId: `${name.replace(/\W+/g, '-').toLowerCase()}:layer:${index}`,
          name: layers.length > 1 && layer.label ? `${plugin.name} — ${layer.label}` : plugin.name,
          path: plugin.id,
          role: 'instrument',
          minNote: layer.min,
          maxNote: layer.max,
          mix: { volumeDb: layer.db, pan: 0, muted: false, solo: false },
        });
      });
      if (blocked || assignments.length === 0) {
        skipped.push(`${name}: ${blocked ?? 'sem camadas'}`);
        continue;
      }
      const notes = layers.map((l) => l.label).filter(Boolean).join(' + ') || name;
      rawPatches.push({
        id: nextId('preset'),
        name,
        notes,
        setId,
        setOrder: setOrder++,
        programNumber: program++,
        midiChannel: 0,
        plugins: assignments,
        vstStates: {},
        layout: { elements: keyboardRig(notes), background: null, tempo },
        createdAt: now,
        updatedAt: now,
      });
    }
    if (setOrder > 0) sets.push({ id: setId, name: setName, order: sets.length, expanded: true, createdAt: now, updatedAt: now });
  }

  const migrated = migrateConcertLayout(createEmptyLayout(tempo), rawPatches);
  const file = {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: nextId('concert'),
      name: flag('test') ? 'Coleção (teste)' : 'Coleção Preseter',
      tempo,
      settings: createDefaultConcertSettings(),
      strips: [],
      createdAt: now,
      updatedAt: now,
    },
    sets,
    patches: migrated.patches,
    layout: migrated.layout,
    mappings: [],
  };
  return { file, skipped, missing: [...missing] };
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
  const { file, skipped, missing } = build(plugins);

  // Valida pelo mesmo leitor que o app usa ao abrir o arquivo.
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
  if (missing.length) console.log(`\nInstale para completar: ${missing.join(', ')} (veja docs/PATCHES.md)`);
  console.log('\nPróximo passo: abra o arquivo no Preseter, entre em cada patch, abra o plugin (tecla V),');
  console.log('escolha o preset/SFZ do som e salve o concert (o estado do plugin fica gravado no patch).');
}

main().catch((e) => {
  console.error('\nERRO:', e.message);
  process.exit(1);
});
