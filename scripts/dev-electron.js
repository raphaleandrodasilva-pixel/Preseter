/**
 * Dev runner — zero dependências extras.
 * Espera o Vite responder em http://127.0.0.1:5173 e abre o Electron
 * com ELECTRON_START_URL (ver `npm run dev`).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const VITE_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173';
// Caminho direto do binário (evita spawn de .cmd, que dá EINVAL no Windows)
const electronPath = require('electron');

function waitForVite(tries = 60) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tick = () => {
      attempt += 1;
      const req = http.get(VITE_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (attempt >= tries) {
          reject(new Error(`Vite não respondeu em ${VITE_URL}`));
        } else {
          setTimeout(tick, 500);
        }
      });
    };
    tick();
  });
}

(async () => {
  try {
    await waitForVite();
  } catch (error) {
    console.error(`[dev-electron] ${error.message}`);
    process.exit(1);
  }
  const child = spawn(electronPath, ['.'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_START_URL: VITE_URL,
      NODE_ENV: 'development',
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
})();
