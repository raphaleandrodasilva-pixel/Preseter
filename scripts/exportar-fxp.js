#!/usr/bin/env node
/**
 * Gera arquivos .fxp para plugins VST2.
 *
 * Uso:
 *   node scripts/exportar-fxp.js --plugin=FSVR --atual --nome="Zap 1"
 *   node scripts/exportar-fxp.js --plugin=FSVR --programas=all --bank=all
 *   node scripts/exportar-fxp.js --plugin=MDA --programas=all
 *   node scripts/exportar-fxp.js --path="C:/.../Plugin.dll" --atual --nome="Som"
 *
 * Os arquivos vão para Documentos\Preseter\Presets\<Plugin>\ e o Preseter os
 * indexa automaticamente.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const first = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

function findEngine() {
  const explicit = first('engine', process.env.PRESETER_ENGINE);
  if (explicit) return explicit;
  const exe = process.platform === 'win32' ? 'PreseterEngine.exe' : 'PreseterEngine';
  const base = path.join(__dirname, '..', 'engine', 'build', 'PreseterEngine_artefacts');
  return ['Release', 'Debug', 'RelWithDebInfo', '.']
    .map((dir) => path.join(base, dir, exe))
    .find((candidate) => fs.existsSync(candidate));
}

function defaultOutput(pluginName) {
  const documents = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Documents')
    : os.homedir();
  return path.join(documents, 'Preseter', 'Presets', pluginName);
}

function safeName(value) {
  return (
    String(value)
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'Preset'
  );
}

async function main() {
  const enginePath = findEngine();
  if (!enginePath || !fs.existsSync(enginePath)) {
    throw new Error('Motor não encontrado. Compile o engine ou use --engine=CAMINHO.');
  }

  const pluginName = first('plugin', '');
  const pluginPath = first('path', '');
  if (!pluginName && !pluginPath) {
    throw new Error('Informe --plugin=NOME ou --path=CAMINHO_DO_PLUGIN.');
  }

  const child = spawn(enginePath, [], {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  });
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
    if (message.event === 'ready') readyResolve(message);
    else if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error || 'Falha no motor.'));
    }
  });

  function request(cmd, payload = {}, timeoutMs = 120000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout em ${cmd}.`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
    });
  }

  try {
    await Promise.race([
      ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Motor não iniciou.')), 15000)),
    ]);

    const list = await request('plugins', {});
    const plugins = list.plugins || [];
    const plugin = plugins.find(
      (item) =>
        (pluginPath && item.path.toLowerCase() === pluginPath.toLowerCase()) ||
        (pluginName && item.name.toLowerCase() === pluginName.toLowerCase()) ||
        (pluginName && item.name.toLowerCase().includes(pluginName.toLowerCase()))
    );
    if (!plugin) throw new Error(`Plugin não encontrado: ${pluginName || pluginPath}`);
    if (plugin.format !== 'VST') {
      throw new Error(
        `${plugin.name} é ${plugin.format}. .fxp só vale para plugins VST2; use .vstpreset para VST3.`
      );
    }

    const loaded = await request('load', { plugin: plugin.id });
    const outputDir = first('out', defaultOutput(plugin.name));
    fs.mkdirSync(outputDir, { recursive: true });

    const currentName = first('nome', plugin.name);
    const wantsAll = first('programas', flag('atual') ? 'current' : 'all') === 'all';
    const isFsvr = /fsvr/i.test(plugin.name);

    if (!wantsAll) {
      const target = path.join(outputDir, `${safeName(currentName)}.fxp`);
      const result = await request('saveVst2Fxp', { layerId: loaded.layerId, path: target });
      console.log(`OK ${result.path} (${result.bytes} bytes)`);
    } else if (isFsvr) {
      const bank = first('bank', 'all');
      const map = { A: 65, B: 66, C: 67 };
      const banks =
        bank === 'all'
          ? [['A', map.A], ['B', map.B], ['C', map.C]]
          : [[bank, map[bank]]];
      if (banks.some(([, lsb]) => !lsb)) {
        throw new Error('Banco inválido. Use --bank=A, B, C ou all.');
      }

      try {
        await request('audioStart', { outputs: 2, inputs: 0 });
      } catch {
        throw new Error('Não foi possível abrir o áudio para enviar os Program Changes do FSVR.');
      }

      for (const [label, lsb] of banks) {
        await request('midi', { bytes: [0xb0, 0, 63] });
        await request('midi', { bytes: [0xb0, 32, lsb] });
        await new Promise((resolve) => setTimeout(resolve, 150));

        for (let program = 0; program < 128; program += 1) {
          await request('midi', { bytes: [0xc0, program] });
          await new Promise((resolve) => setTimeout(resolve, 220));
          const stub = `${label}${String(program + 1).padStart(3, '0')}`;
          const temp = path.join(outputDir, `_tmp_${stub}.fxp`);
          await request('saveVst2Fxp', { layerId: loaded.layerId, path: temp });
          const data = fs.readFileSync(temp);
          const headerName = data.toString('utf8', 28, 56).replace(/\0.*$/, '').trim();
          const name = headerName && !/^default$/i.test(headerName)
            ? headerName
            : `Performance ${program + 1}`;
          const target = path.join(outputDir, `${stub} - ${safeName(name)}.fxp`);
          fs.renameSync(temp, target);
          console.log(`OK ${target}`);
        }
      }
      console.log(`Pasta: ${outputDir}`);
      return;
    } else {
      const programs = await request('pluginPrograms', { plugin: plugin.id });
      const count = Math.max(programs.count || 0, programs.programs?.length || 0);
      if (count <= 1) {
        const target = path.join(outputDir, `${safeName(currentName)}.fxp`);
        const result = await request('saveVst2Fxp', { layerId: loaded.layerId, path: target });
        console.log(`OK ${result.path} (1 programa)`);
      } else {
        const original = loaded.program ?? 0;
        for (let index = 0; index < count; index += 1) {
          const name =
            programs.programs?.find((program) => program.index === index)?.name ??
            `Program ${index + 1}`;
          await request('setProgram', { layerId: loaded.layerId, index });
          await new Promise((resolve) => setTimeout(resolve, 100));
          const target = path.join(
            outputDir,
            `${String(index + 1).padStart(3, '0')} - ${safeName(name)}.fxp`
          );
          const result = await request('saveVst2Fxp', { layerId: loaded.layerId, path: target });
          console.log(`OK ${result.path}`);
        }
        await request('setProgram', { layerId: loaded.layerId, index: original });
      }
    }

    console.log(`Pasta: ${outputDir}`);
  } finally {
    await request('quit', {}).catch(() => undefined);
    child.stdin.end();
  }
}

main().catch((error) => {
  console.error('ERRO:', error.message);
  process.exitCode = 1;
});
