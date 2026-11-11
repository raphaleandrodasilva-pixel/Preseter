import * as os from 'os';
import * as path from 'path';

export type SupportedPlatform = 'win32' | 'linux' | 'darwin';

export interface PlatformInstallPaths {
  /** Pasta onde a coleção instala VST3 sem administrador. */
  userVst3: string;
  /** Pastas onde o sistema procura VST3. */
  vst3Folders: string[];
  /** Pasta onde a coleção instala LV2 sem administrador. */
  userLv2: string;
  /** Pastas onde o sistema procura LV2. */
  lv2Folders: string[];
  /** Pasta de VST2 do usuário (quando o engine tiver suporte a VST2). */
  userVst2: string;
  /** Pasta de downloads de instaladores. */
  downloads: string;
}

function usernameHome(env: NodeJS.ProcessEnv, home: string): string {
  return env.USERPROFILE ?? env.HOME ?? home;
}

function windowsPaths(env: NodeJS.ProcessEnv, home: string): PlatformInstallPaths {
  const p = path.win32;
  const userHome = usernameHome(env, home);
  const local = env.LOCALAPPDATA ?? p.join(userHome, 'AppData', 'Local');
  const appData = env.APPDATA ?? p.join(userHome, 'AppData', 'Roaming');
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  return {
    userVst3: p.join(local, 'Programs', 'Common', 'VST3'),
    vst3Folders: [
      p.join(local, 'Programs', 'Common', 'VST3'),
      p.join(programFiles, 'Common Files', 'VST3'),
      p.join(programFilesX86, 'Common Files', 'VST3'),
    ],
    userLv2: p.join(appData, 'LV2'),
    lv2Folders: [
      p.join(appData, 'LV2'),
      p.join(programFiles, 'Common Files', 'LV2'),
      p.join(programFilesX86, 'Common Files', 'LV2'),
    ],
    userVst2: p.join(appData, 'VST'),
    downloads: p.join(userHome, 'Downloads', 'PreseterColecao'),
  };
}

function linuxPaths(env: NodeJS.ProcessEnv, home: string): PlatformInstallPaths {
  const p = path.posix;
  const userHome = env.HOME ?? home;
  const xdgData = env.XDG_DATA_HOME ?? p.join(userHome, '.local', 'share');
  return {
    userVst3: p.join(userHome, '.vst3'),
    vst3Folders: [
      p.join(userHome, '.vst3'),
      '/usr/lib/vst3',
      '/usr/local/lib/vst3',
    ],
    // O JUCE procura LV2 em ~/.lv2; ~/.local/share/lv2 fica como legado.
    userLv2: p.join(userHome, '.lv2'),
    lv2Folders: [
      p.join(userHome, '.lv2'),
      p.join(xdgData, 'lv2'),
      '/usr/lib/lv2',
      '/usr/local/lib/lv2',
    ],
    userVst2: p.join(userHome, '.vst'),
    downloads: p.join(userHome, 'Downloads', 'PreseterColecao'),
  };
}

function macPaths(env: NodeJS.ProcessEnv, home: string): PlatformInstallPaths {
  const p = path.posix;
  const userHome = env.HOME ?? home;
  return {
    userVst3: p.join(userHome, 'Library', 'Audio', 'Plug-Ins', 'VST3'),
    vst3Folders: [
      p.join(userHome, 'Library', 'Audio', 'Plug-Ins', 'VST3'),
      '/Library/Audio/Plug-Ins/VST3',
    ],
    userLv2: p.join(userHome, 'Library', 'Audio', 'Plug-Ins', 'LV2'),
    lv2Folders: [
      p.join(userHome, 'Library', 'Audio', 'Plug-Ins', 'LV2'),
      '/Library/Audio/Plug-Ins/LV2',
    ],
    userVst2: p.join(userHome, 'Library', 'Audio', 'Plug-Ins', 'VST'),
    downloads: p.join(userHome, 'Downloads', 'PreseterColecao'),
  };
}

/** Caminhos de plugins e downloads do sistema atual. */
export function getPlatformPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): PlatformInstallPaths {
  if (platform === 'win32') return windowsPaths(env, home);
  if (platform === 'darwin') return macPaths(env, home);
  return linuxPaths(env, home);
}

/** Expande ~, $HOME e variáveis de perfil/XDG usadas no catálogo. */
export function expandUserPath(
  value: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const userHome = platform === 'win32'
    ? (env.USERPROFILE ?? env.HOME ?? home)
    : (env.HOME ?? home);
  const configHome = env.XDG_CONFIG_HOME ?? p.join(userHome, '.config');
  const dataHome = env.XDG_DATA_HOME ?? p.join(userHome, '.local', 'share');
  const appData = platform === 'win32'
    ? (env.APPDATA ?? p.join(userHome, 'AppData', 'Roaming'))
    : configHome;
  const localAppData = platform === 'win32'
    ? (env.LOCALAPPDATA ?? p.join(userHome, 'AppData', 'Local'))
    : dataHome;

  let expanded = value
    .replace(/%APPDATA%/gi, appData)
    .replace(/%LOCALAPPDATA%/gi, localAppData)
    .replace(/%USERPROFILE%/gi, userHome)
    .replace(/%XDG_CONFIG_HOME%/gi, configHome)
    .replace(/%XDG_DATA_HOME%/gi, dataHome)
    .replace(/%HOME%/gi, userHome)
    .replace(/\$HOME/g, userHome);

  if (expanded === '~') expanded = userHome;
  else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = p.join(userHome, expanded.slice(2));
  }
  return p.normalize(expanded);
}

/** Pastas de presets que devem disparar reindexação ao mudar. */
export function presetWatchFolders(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  documents = '',
  home: string = os.homedir()
): string[] {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const userHome = platform === 'win32'
    ? (env.USERPROFILE ?? env.HOME ?? home)
    : (env.HOME ?? home);
  const folders = [
    p.join(documents, 'VST3 Presets'),
    p.join(documents, 'Preseter', 'Presets'),
  ];
  if (platform === 'win32') {
    folders.splice(
      1,
      0,
      p.join(env.PROGRAMDATA ?? 'C:\\ProgramData', 'VST3 Presets')
    );
  } else if (platform === 'linux') {
    folders.push(p.join(userHome, '.vst3', 'presets'));
    folders.push(p.join(userHome, '.local', 'share', 'vst3', 'presets'));
  }
  return folders;
}
