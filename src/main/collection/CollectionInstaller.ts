import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, cpSync, copyFileSync } from 'fs';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawnSync } from 'child_process';
import extractZip from 'extract-zip';
import type {
  CollectionItem,
  CollectionItemStatus,
  CollectionItemStatusValue,
  CollectionProgress,
} from '../../shared/collection';

export type CollectionInstallerOptions = {
  /** Pasta onde as bibliotecas de som são salvas. */
  getSoundsFolder: () => string;
  /** Emite progresso para a UI. */
  onProgress?: (progress: CollectionProgress) => void;
  /** Chamado depois de instalar plugins, para reescanear o motor. */
  onPluginsInstalled?: () => Promise<unknown>;
}

const USER_VST3 = path.join(
  process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
  'Programs',
  'Common',
  'VST3'
);
const GLOBAL_VST3 = path.join(
  process.env.CommonProgramFiles ?? 'C:\\Program Files\\Common Files',
  'VST3'
);
const PLUGIN_FOLDERS = [USER_VST3, GLOBAL_VST3];

/** Converte um padrão simples (`*.vst3`, `mda*.vst3`) em RegExp. */
function wildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Procura um arquivo/pasta por nome, até `depth` níveis. */
function findEntry(root: string, pattern: string, depth = 2): string | null {
  if (!existsSync(root)) return null;
  const re = wildcard(pattern);
  const stack: Array<{ dir: string; level: number }> = [{ dir: root, level: 0 }];
  while (stack.length > 0) {
    const { dir, level } = stack.shift()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      if (re.test(name)) return full;
      if (level < depth) {
        try {
          if (statSync(full).isDirectory()) stack.push({ dir: full, level: level + 1 });
        } catch {
          /* ignora */
        }
      }
    }
  }
  return null;
}

function findInAllPlugins(item: CollectionItem): string | null {
  for (const pattern of item.vst3Patterns ?? []) {
    for (const folder of PLUGIN_FOLDERS) {
      const found = findEntry(folder, pattern, 3);
      if (found) return found;
    }
  }
  return null;
}

function findSoundfont(folder: string, item: CollectionItem): string | null {
  for (const pattern of item.soundfontPatterns ?? []) {
    const found = findEntry(folder, pattern, 2);
    if (found) return found;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Baixa e instala os plugins/bibliotecas da coleção. Tudo em fontes oficiais;
 * zips são extraídos sem executar nada. Instaladores .exe são apenas baixados.
 */
export class CollectionInstaller {
  private readonly options: CollectionInstallerOptions;
  private abortController: AbortController | null = null;
  private running = false;

  constructor(options: CollectionInstallerOptions) {
    this.options = options;
  }

  get isRunning(): boolean {
    return this.running;
  }

  cancel(): void {
    this.abortController?.abort();
  }

  status(items: CollectionItem[]): CollectionItemStatus[] {
    const soundsFolder = this.options.getSoundsFolder();
    return items.map((item) => this.statusOf(item, soundsFolder));
  }

  private statusOf(item: CollectionItem, soundsFolder: string): CollectionItemStatus {
    const base = {
      id: item.id,
      name: item.name,
      description: item.description,
      group: item.group,
      kind: item.kind,
      approxBytes: item.approxBytes,
      license: item.license,
      licenseUrl: item.licenseUrl,
      page: item.page,
      notes: item.notes,
      defaultSelected: item.defaultSelected,
    };
    if (item.kind === 'manual') {
      return { ...base, status: 'manual' };
    }
    if (item.group === 'plugin') {
      const found = findInAllPlugins(item);
      if (found) return { ...base, status: 'installed', filePath: found };
      if (item.kind === 'vst3-exe' && item.fileName) {
        const installer = path.join(process.env.USERPROFILE ?? '.', 'Downloads', 'PreseterColecao', item.fileName);
        if (existsSync(installer)) return { ...base, status: 'ready', filePath: installer };
      }
      return { ...base, status: 'missing' };
    }
    const folder = path.join(soundsFolder, item.destSubfolder ?? '');
    const found = findSoundfont(folder, item);
    return found
      ? { ...base, status: 'installed', filePath: found }
      : { ...base, status: 'missing' };
  }

  private emit(status: CollectionItemStatus, done = false): void {
    this.options.onProgress?.({ item: status, done });
  }

  async install(items: CollectionItem[], ids: string[], force = false): Promise<CollectionItemStatus[]> {
    if (this.running) throw new Error('Já existe um download da coleção em andamento.');
    this.running = true;
    this.abortController = new AbortController();
    const soundsFolder = this.options.getSoundsFolder();
    mkdirSync(soundsFolder, { recursive: true });
    mkdirSync(USER_VST3, { recursive: true });
    const selected = items.filter((item) => ids.includes(item.id));
    const result: CollectionItemStatus[] = [];
    let installedPlugin = false;

    try {
      for (const item of selected) {
        if (this.abortController?.signal.aborted) break;
        const before = this.statusOf(item, soundsFolder);
        if (before.status === 'installed' && !force) {
          this.emit(before);
          result.push(before);
          continue;
        }
        if (item.kind === 'manual') {
          this.emit(before);
          result.push(before);
          continue;
        }
        const updated = await this.installOne(item, soundsFolder);
        if (updated.status === 'installed' && item.group === 'plugin') installedPlugin = true;
        result.push(updated);
        if (updated.status === 'cancelled') break;
      }
      if (installedPlugin && this.options.onPluginsInstalled) {
        await this.options.onPluginsInstalled();
      }
      return result;
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  private async installOne(item: CollectionItem, soundsFolder: string): Promise<CollectionItemStatus> {
    const base = this.statusOf(item, soundsFolder);
    const tempRoot = path.join(process.env.TEMP ?? '.', 'preseter-collection', item.id);
    mkdirSync(tempRoot, { recursive: true });
    const downloadPath = path.join(tempRoot, item.fileName ?? `${item.id}.bin`);

    try {
      await this.download(item, downloadPath, base);
      const extracting: CollectionItemStatus = {
        ...base,
        status: 'extracting',
        message: item.kind.includes('zip') ? 'Extraindo…' : 'Preparando…',
        totalBytes: item.approxBytes,
        receivedBytes: item.approxBytes,
        percent: 100,
      };
      this.emit(extracting);

      if (item.kind === 'soundfont') {
        const folder = path.join(soundsFolder, item.destSubfolder ?? '');
        mkdirSync(folder, { recursive: true });
        const dest = path.join(folder, item.fileName ?? path.basename(downloadPath));
        await fs.copyFile(downloadPath, dest);
        const done = { ...base, status: 'installed' as const, filePath: dest, message: 'Biblioteca instalada' };
        this.emit(done);
        return done;
      }

      if (item.kind === 'soundfont-zip') {
        const folder = path.join(soundsFolder, item.destSubfolder ?? item.id);
        mkdirSync(folder, { recursive: true });
        await extractZip(downloadPath, { dir: folder });
        const found = findSoundfont(folder, item) ?? folder;
        const done = { ...base, status: 'installed' as const, filePath: found, message: 'Biblioteca instalada' };
        this.emit(done);
        return done;
      }

      if (item.kind === 'vst3-exe') {
        const downloads = path.join(process.env.USERPROFILE ?? '.', 'Downloads', 'PreseterColecao');
        mkdirSync(downloads, { recursive: true });
        const dest = path.join(downloads, item.fileName ?? path.basename(downloadPath));
        await fs.copyFile(downloadPath, dest);
        const ready = {
          ...base,
          status: 'ready' as const,
          filePath: dest,
          message: 'Instalador baixado. Abra para instalar.',
        };
        this.emit(ready);
        return ready;
      }

      // vst3-zip / vst3-msi
      const extractDir = path.join(tempRoot, 'extracted');
      await fs.rm(extractDir, { recursive: true, force: true });
      mkdirSync(extractDir, { recursive: true });
      if (item.kind === 'vst3-zip') {
        await extractZip(downloadPath, { dir: extractDir });
      } else {
        this.extractMsi(downloadPath, extractDir);
      }
      const copied = this.copyVst3(extractDir);
      if (copied.length === 0) {
        throw new Error('O pacote não continha um plugin .vst3.');
      }
      const found = findInAllPlugins(item) ?? copied[0];
      const done = {
        ...base,
        status: 'installed' as const,
        filePath: found,
        message: 'Plugin instalado',
      };
      this.emit(done);
      return done;
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        const cancelled = { ...base, status: 'cancelled' as const, message: 'Download cancelado.' };
        this.emit(cancelled);
        return cancelled;
      }
      const failed = {
        ...base,
        status: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
      };
      this.emit(failed);
      return failed;
    }
  }

  private async download(
    item: CollectionItem,
    dest: string,
    base: CollectionItemStatus
  ): Promise<void> {
    if (!item.url) throw new Error('Item sem URL de download.');
    await fs.rm(dest, { force: true });
    await this.downloadUrl(item.url, dest, (received, total) => {
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : undefined;
      this.emit({
        ...base,
        status: 'downloading',
        receivedBytes: received,
        totalBytes: total || item.approxBytes,
        percent,
        message: `Baixando ${formatBytes(received)}${total > 0 ? ` de ${formatBytes(total)}` : ''}…`,
      });
    });
  }

  /** Download com redirecionamentos do GitHub e cancelamento. */
  private downloadUrl(
    url: string,
    dest: string,
    onProgress: (received: number, total: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = (target: string) => {
        const req = https.get(
          target,
          { headers: { 'User-Agent': 'Preseter', Accept: '*/*' } },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
              res.resume();
              request(new URL(res.headers.location, target).toString());
              return;
            }
            if (status !== 200) {
              res.resume();
              reject(new Error(`Download falhou (HTTP ${status}).`));
              return;
            }
            const total = Number(res.headers['content-length'] ?? 0);
            const file = createWriteStream(dest);
            let received = 0;
            let lastEmit = 0;
            res.on('data', (chunk: Buffer) => {
              received += chunk.length;
              file.write(chunk);
              const now = Date.now();
              if (now - lastEmit > 200) {
                lastEmit = now;
                onProgress(received, total);
              }
            });
            res.on('end', () => {
              file.end(() => {
                onProgress(received, total || received);
                resolve();
              });
            });
            res.on('error', (error) => {
              file.destroy();
              reject(error);
            });
            file.on('error', reject);
          }
        );
        req.on('error', reject);
        this.abortController?.signal.addEventListener('abort', () => {
          req.destroy(new Error('Cancelado'));
        }, { once: true });
      };
      request(url);
    });
  }

  private extractMsi(msiPath: string, targetDir: string): void {
    const result = spawnSync('msiexec.exe', ['/a', msiPath, '/qn', `TARGETDIR=${targetDir}`], {
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error('Não foi possível extrair o MSI (msiexec).');
    }
  }

  /** Copia bundles .vst3 e DLLs ao lado deles para a pasta VST3 do usuário. */
  private copyVst3(extractDir: string): string[] {
    const copied: string[] = [];
    const stack = [extractDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        const full = path.join(dir, name);
        let isDir = false;
        try {
          isDir = statSync(full).isDirectory();
        } catch {
          continue;
        }
        if (isDir && name.toLowerCase().endsWith('.vst3')) {
          const dest = path.join(USER_VST3, name);
          cpSync(full, dest, { recursive: true });
          copied.push(dest);
          // DLLs que ficam ao lado do bundle (comum nos builds Windows).
          for (const sibling of entries) {
            if (sibling.toLowerCase().endsWith('.dll')) {
              try {
                copyFileSync(path.join(dir, sibling), path.join(USER_VST3, sibling));
              } catch {
                /* ignora */
              }
            }
          }
          continue;
        }
        if (isDir) stack.push(full);
      }
    }
    // DLLs soltas na raiz do pacote (alguns builds colocam as dependências ali).
    try {
      for (const name of readdirSync(extractDir)) {
        if (name.toLowerCase().endsWith('.dll')) {
          try {
            copyFileSync(path.join(extractDir, name), path.join(USER_VST3, name));
          } catch {
            /* ignora */
          }
        }
      }
    } catch {
      /* ignora */
    }
    return copied;
  }
}
