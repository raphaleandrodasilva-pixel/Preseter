import { afterEach, vi } from 'vitest';

vi.mock('electron', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fallbackRoot = path.join(os.tmpdir(), 'preseter-vitest');

  class MockBrowserWindow {
    static getAllWindows = vi.fn(() => []);

    webContents = {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      openDevTools: vi.fn(),
    };

    on = vi.fn();
    once = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
    show = vi.fn();
    showInactive = vi.fn();
    close = vi.fn();
    isDestroyed = vi.fn(() => false);
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 1400, height: 900 }));
    setTitle = vi.fn();
    maximize = vi.fn();
    isMaximized = vi.fn(() => false);
  }

  const app = {
    getPath: vi.fn((name: string) => path.join(fallbackRoot, name)),
    getAppPath: vi.fn(() => path.join(fallbackRoot, 'app')),
    isPackaged: false,
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    once: vi.fn(),
    quit: vi.fn(),
    setAppUserModelId: vi.fn(),
  };

  return {
    app,
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      removeHandler: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
      showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
    },
    screen: {
      getAllDisplays: vi.fn(() => [
        { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      ]),
    },
    session: {
      defaultSession: {
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
      },
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({})),
      setApplicationMenu: vi.fn(),
    },
    MenuItem: class {},
    nativeImage: {
      createFromPath: vi.fn(() => ({
        isEmpty: () => true,
        toDataURL: () => '',
      })),
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
