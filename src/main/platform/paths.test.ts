import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandUserPath, getPlatformPaths, presetWatchFolders } from './paths';

const home = 'C:/Users/Test';
const env = {
  USERPROFILE: home,
  HOME: '/home/test',
  APPDATA: 'C:/Users/Test/AppData/Roaming',
  LOCALAPPDATA: 'C:/Users/Test/AppData/Local',
  ProgramFiles: 'C:/Program Files',
  'ProgramFiles(x86)': 'C:/Program Files (x86)',
  XDG_DATA_HOME: '/home/test/.local/share',
  XDG_CONFIG_HOME: '/home/test/.config',
};

describe('platform paths', () => {
  it('usa as pastas de VST3 do Windows', () => {
    const paths = getPlatformPaths('win32', env, home);
    expect(paths.userVst3).toBe(path.win32.join(home, 'AppData', 'Local', 'Programs', 'Common', 'VST3'));
    expect(paths.vst3Folders).toContain(path.win32.join('C:\\Program Files', 'Common Files', 'VST3'));
    expect(paths.userLv2).toBe(path.win32.join(home, 'AppData', 'Roaming', 'LV2'));
    expect(paths.downloads).toBe(path.win32.join(home, 'Downloads', 'PreseterColecao'));
  });

  it('usa ~/.vst3 e ~/.lv2 no Linux', () => {
    const paths = getPlatformPaths('linux', env, '/home/test');
    expect(paths.userVst3).toBe('/home/test/.vst3');
    expect(paths.userLv2).toBe('/home/test/.lv2');
    expect(paths.vst3Folders).toContain('/usr/lib/vst3');
    expect(paths.lv2Folders).toContain('/usr/lib/lv2');
    expect(paths.downloads).toBe('/home/test/Downloads/PreseterColecao');
  });

  it('expande ~ e variáveis XDG', () => {
    expect(expandUserPath('~/.config/TetraOP/presets', 'linux', env, '/home/test'))
      .toBe('/home/test/.config/TetraOP/presets');
    expect(expandUserPath('%XDG_DATA_HOME%/charlatan/presets', 'linux', env, '/home/test'))
      .toBe('/home/test/.local/share/charlatan/presets');
    expect(expandUserPath('%APPDATA%/charlatan/presets', 'win32', env, home))
      .toBe(path.win32.join(home, 'AppData', 'Roaming', 'charlatan', 'presets'));
  });

  it('não usa caminhos do Windows ao assistir presets no Linux', () => {
    const folders = presetWatchFolders('linux', env, '/home/test/Documents', '/home/test');
    expect(folders).toContain('/home/test/Documents/VST3 Presets');
    expect(folders).toContain('/home/test/.vst3/presets');
    expect(folders.some((folder) => /ProgramData/i.test(folder))).toBe(false);
  });
});
