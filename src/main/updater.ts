import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Atualizações automáticas pelo GitHub Releases (electron-updater).
 *
 * - No app instalado, verifica no boot e baixa sozinho.
 * - O menu Ajuda → Verificar atualizações… mostra o resultado.
 * - Quando o download termina, oferece reiniciar; também instala ao fechar.
 *
 * No `win-unpacked` (não instalado) a verificação manual avisa que só funciona
 * na versão instalada.
 */

/** `true` quando a checagem foi pedida pelo usuário (mostra os diálogos). */
let manualCheck = false;

const show = async (
  win: BrowserWindow | null | undefined,
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> =>
  win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);

export function setupUpdater (): void {
  // Sem app empacotado (dev/testes) o electron-updater não tem instância do
  // Electron; a checagem manual já avisa que só funciona no app instalado.
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('error', (error) => {
    if (!manualCheck) return;
    manualCheck = false;
    void show(BrowserWindow.getFocusedWindow(), {
      type: 'error',
      title: 'Atualizações',
      message: 'Não foi possível verificar atualizações agora.',
      detail: error?.message ?? String(error),
    });
  });

  autoUpdater.on('update-available', (info) => {
    if (!manualCheck) return;
    void show(BrowserWindow.getFocusedWindow(), {
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${info.version} está sendo baixada.`,
      detail: 'Você pode continuar usando o Preseter; avisamos quando estiver pronta.',
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (!manualCheck) return;
    manualCheck = false;
    void show(BrowserWindow.getFocusedWindow(), {
      type: 'info',
      title: 'Atualizações',
      message: `Você já está na versão mais recente (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    manualCheck = false;
    void show(BrowserWindow.getFocusedWindow(), {
      type: 'info',
      title: 'Atualização pronta',
      message: `A versão ${info.version} foi baixada.`,
      detail: 'Reinicie o Preseter para instalar. A atualização também será aplicada ao fechar o app.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });
}

/** Verifica atualizações. `manual` mostra o resultado na tela. */
export async function checkForUpdates (manual = false): Promise<void> {
  if (!app.isPackaged) {
    if (manual) {
      await show(BrowserWindow.getFocusedWindow(), {
        type: 'info',
        title: 'Atualizações',
        message: 'Verificação disponível na versão instalada.',
        detail: 'O Preseter portátil (win-unpacked) não se atualiza sozinho. Instale pelo instalador oficial para receber atualizações.',
      });
    }
    return;
  }
  manualCheck = manual;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (manualCheck) {
      manualCheck = false;
      await show(BrowserWindow.getFocusedWindow(), {
        type: 'error',
        title: 'Atualizações',
        message: 'Não foi possível verificar atualizações agora.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Verificação silenciosa no boot (só no app instalado). */
export function scheduleStartupUpdateCheck (): void {
  if (!app.isPackaged) return;
  setTimeout(() => { void checkForUpdates(false); }, 10_000);
}
