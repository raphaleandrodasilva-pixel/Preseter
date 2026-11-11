import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, cpSync, copyFileSync } from 'fs';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawnSync } from 'child_process';
import extractZip from 'extract-zip';
import type {
  CollectionDownloadSummary,
  CollectionItem,
  CollectionItemStatus,
  CollectionItemStatusValue,
  CollectionOverallProgress,
  CollectionProgress,
} from '../../shared/collection';
import {
  expandUserPath as expandPlatformPath,
  getPlatformPaths,
  type SupportedPlatform,
} from '../platform/paths';

export type CollectionInstallerOptions = {
  /** Pasta onde as bibliotecas de som são salvas. */
  getSoundsFolder: () => string;
  /** Sistema atual; define pastas de VST3/LV2 e tipos de instalador. */
  platform?: SupportedPlatform;
  /** Emite progresso para a UI. */
  onProgress?: (progress: CollectionProgress) => void;
  /** Chamado depois de instalar plugins, para reescanear o motor. */
  onPluginsInstalled?: () => Promise<unknown>;
}

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
  private readonly platform: SupportedPlatform;
  private readonly paths: ReturnType<typeof getPlatformPaths>;
  private abortController: AbortController | null = null;
  private running = false;
  /** Contexto do lote atual, usado para calcular a barra geral. */
  private batch: {
    current: number;
    total: number;
    completed: number;
    completedBytes: number;
    itemBytes: number;
    totalBytes: number;
    phase: CollectionOverallProgress['phase'];
  } | null = null;

  constructor(options: CollectionInstallerOptions) {
    this.options = options;
    this.platform = options.platform ?? (process.platform as SupportedPlatform);
    this.paths = getPlatformPaths(this.platform);
  }

  private findInAllPlugins(item: CollectionItem): string | null {
    const folders = [...this.paths.vst3Folders, ...this.paths.lv2Folders];
    for (const pattern of item.vst3Patterns ?? []) {
      for (const folder of folders) {
        const found = findEntry(folder, pattern, 3);
        if (found) return found;
      }
    }
    return null;
  }

  private expandUserPath(value: string): string {
    return expandPlatformPath(value, this.platform);
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
      const found = item.group === 'plugin' ? this.findInAllPlugins(item) : null;
      return found
        ? { ...base, status: 'installed', filePath: found }
        : { ...base, status: 'manual' };
    }
    if (item.group === 'plugin') {
      const found = this.findInAllPlugins(item);
      if (found) return { ...base, status: 'installed', filePath: found };
      if ((item.kind === 'installer' || item.kind === 'vst3-exe') && item.fileName) {
        const installer = path.join(this.paths.downloads, item.fileName);
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
    let overall: CollectionOverallProgress | undefined;
    if (this.batch) {
      const itemTotal = status.totalBytes ?? this.batch.itemBytes;
      const itemReceived = status.status === 'downloading'
        ? Math.min(status.receivedBytes ?? 0, itemTotal)
        : (status.status === 'extracting' || status.status === 'installed' || status.status === 'ready'
            || status.status === 'error' || status.status === 'cancelled'
            || status.status === 'manual' || status.status === 'unsupported')
          ? itemTotal
          : 0;
      const received = Math.min(
        this.batch.completedBytes + itemReceived,
        this.batch.totalBytes
      );
      overall = {
        current: this.batch.current,
        total: this.batch.total,
        completed: this.batch.completed,
        percent: this.batch.totalBytes > 0
          ? Math.min(100, Math.round((received / this.batch.totalBytes) * 100))
          : undefined,
        receivedBytes: received,
        totalBytes: this.batch.totalBytes,
        phase: this.batch.phase,
      };
    }
    this.options.onProgress?.({ item: status, done, overall });
  }

  async install(
    items: CollectionItem[],
    ids: string[],
    force = false
  ): Promise<{ statuses: CollectionItemStatus[]; summary: CollectionDownloadSummary }> {
    if (this.running) throw new Error('Já existe um download da coleção em andamento.');
    this.running = true;
    this.abortController = new AbortController();
    const soundsFolder = this.options.getSoundsFolder();
    mkdirSync(soundsFolder, { recursive: true });
    mkdirSync(this.paths.userVst3, { recursive: true });
    mkdirSync(this.paths.userLv2, { recursive: true });
    const selected = items.filter((item) => ids.includes(item.id));
    const result: CollectionItemStatus[] = [];
    const summary: CollectionDownloadSummary = {
      total: selected.length,
      downloaded: 0,
      installed: 0,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      manual: 0,
    };
    let installedPlugin = false;
    let completed = 0;
    let completedBytes = 0;
    const totalBytes = selected.reduce((sum, item) => sum + Math.max(0, item.approxBytes), 0);
    this.batch = {
      current: 0,
      total: selected.length,
      completed: 0,
      completedBytes: 0,
      itemBytes: 0,
      totalBytes,
      phase: 'preparing',
    };

    try {
      for (const [index, item] of selected.entries()) {
        if (this.abortController?.signal.aborted) break;
        this.batch.current = index + 1;
        this.batch.completed = completed;
        this.batch.completedBytes = completedBytes;
        this.batch.itemBytes = Math.max(0, item.approxBytes);
        this.batch.phase = 'preparing';

        const before = this.statusOf(item, soundsFolder);
        if (before.status === 'installed' && !force) {
          this.batch.phase = 'done';
          this.emit(before);
          result.push(before);
          summary.skipped += 1;
          summary.installed += 1;
          completed += 1;
          completedBytes += Math.max(0, item.approxBytes);
          continue;
        }
        if (item.kind === 'manual') {
          this.batch.phase = 'done';
          this.emit(before);
          result.push(before);
          summary.manual += 1;
          completed += 1;
          completedBytes += Math.max(0, item.approxBytes);
          continue;
        }

        const updated = await this.installOne(item, soundsFolder);
        result.push(updated);
        if (updated.status === 'installed' || updated.status === 'ready') {
          summary.downloaded += 1;
          summary.installed += 1;
          if (updated.status === 'installed' && item.group === 'plugin') installedPlugin = true;
        } else if (updated.status === 'cancelled') {
          summary.cancelled += 1;
        } else if (updated.status === 'error') {
          summary.failed += 1;
        }
        completed += 1;
        completedBytes += Math.max(0, item.approxBytes);
        this.batch.completed = completed;
        this.batch.completedBytes = completedBytes;
        if (updated.status === 'cancelled') {
          this.batch.phase = 'cancelled';
          this.emit(updated, true);
          break;
        }
        if (updated.status === 'error') this.batch.phase = 'error';
        else this.batch.phase = 'done';
        this.emit(updated, index === selected.length - 1);
      }

      if (installedPlugin && this.options.onPluginsInstalled) {
        await this.options.onPluginsInstalled();
      }
      return { statuses: result, summary };
    } finally {
      this.running = false;
      this.abortController = null;
      this.batch = null;
    }
  }

  private async installOne(item: CollectionItem, soundsFolder: string): Promise<CollectionItemStatus> {
    const base = this.statusOf(item, soundsFolder);
    const tempRoot = path.join(process.env.TEMP ?? '.', 'preseter-collection', item.id);
    mkdirSync(tempRoot, { recursive: true });
    const downloadPath = path.join(tempRoot, item.fileName ?? `${item.id}.bin`);

    try {
      await this.download(item, downloadPath, base);
      if (this.batch) this.batch.phase = 'extracting';
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

      if (item.kind === 'installer' || item.kind === 'vst3-exe') {
        mkdirSync(this.paths.downloads, { recursive: true });
        const dest = path.join(this.paths.downloads, item.fileName ?? path.basename(downloadPath));
        await fs.copyFile(downloadPath, dest);
        if (this.platform !== 'win32') {
          try {
            await fs.chmod(dest, 0o755);
          } catch {
            /* alguns instaladores não precisam do bit executável */
          }
        }
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
      } else if (this.platform === 'win32') {
        this.extractMsi(downloadPath, extractDir);
      } else {
        throw new Error('Este pacote MSI só pode ser instalado no Windows.');
      }
      const copied = this.copyVst3(extractDir, item);
      const bundled = this.installVst3Bundle(item, extractDir);
      if (bundled) copied.push(bundled);
      if (copied.length === 0) {
        throw new Error('O pacote não continha um plugin VST3/LV2.');
      }
      this.copyDataFolders(item, extractDir);
      const found = this.findInAllPlugins(item) ?? copied[0];
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
    if (this.batch) this.batch.phase = 'downloading';
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

  /** Monta um bundle VST3 quando o pacote Linux traz apenas um .so avulso. */
  private installVst3Bundle(item: CollectionItem, extractDir: string): string | null {
    const bundle = item.vst3Bundle;
    if (!bundle) return null;
    const source = path.join(extractDir, bundle.source);
    if (!existsSync(source)) return null;
    const arch = this.platform === 'win32' ? 'x86_64-win' : 'x86_64-linux';
    const destDir = path.join(this.paths.userVst3, bundle.name, 'Contents', arch);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(source, path.join(destDir, path.basename(bundle.source)));
    return path.join(this.paths.userVst3, bundle.name);
  }

  /** Copia bundles VST3/LV2 (e DLLs, no Windows) para as pastas do usuário. */
  private copyVst3(extractDir: string, item: CollectionItem): string[] {
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
        const lower = name.toLowerCase();
        if (isDir && lower.endsWith('.vst3')) {
          const dest = path.join(this.paths.userVst3, name);
          cpSync(full, dest, { recursive: true });
          copied.push(dest);
          // DLLs que ficam ao lado do bundle (comum nos builds Windows).
          if (this.platform === 'win32') {
            for (const sibling of entries) {
              if (sibling.toLowerCase().endsWith('.dll')) {
                try {
                  copyFileSync(path.join(dir, sibling), path.join(this.paths.userVst3, sibling));
                } catch {
                  /* ignora */
                }
              }
            }
          }
          continue;
        }
        // Alguns fabricantes distribuem o VST3 como arquivo único.
        if (!isDir && lower.endsWith('.vst3')) {
          const dest = path.join(this.paths.userVst3, name);
          copyFileSync(full, dest);
          copied.push(dest);
          continue;
        }
        // Bundles LV2 (Linux).
        if (isDir && lower.endsWith('.lv2')) {
          const dest = path.join(this.paths.userLv2, name);
          cpSync(full, dest, { recursive: true });
          copied.push(dest);
          continue;
        }
        // VST2 avulso (Linux); o engine só o carrega se compilado com VST2.
        if (!isDir && lower.endsWith('.so') && this.platform === 'linux' && !item.vst3Bundle) {
          const dest = path.join(this.paths.userVst2, name);
          mkdirSync(this.paths.userVst2, { recursive: true });
          copyFileSync(full, dest);
          copied.push(dest);
          continue;
        }
        if (isDir) stack.push(full);
      }
    }
    // DLLs soltas na raiz do pacote (alguns builds colocam as dependências ali).
    if (this.platform === 'win32') {
      try {
        for (const name of readdirSync(extractDir)) {
          if (name.toLowerCase().endsWith('.dll')) {
            try {
              copyFileSync(path.join(extractDir, name), path.join(this.paths.userVst3, name));
            } catch {
              /* ignora */
            }
          }
        }
      } catch {
        /* ignora */
      }
    }
    return copied;
  }

  /** Copia presets/wavetables do pacote para o perfil do usuário. */
  private copyDataFolders(item: CollectionItem, extractDir: string): void {
    for (const folder of item.dataFolders ?? []) {
      const source = path.join(extractDir, folder.from);
      if (!existsSync(source)) continue;
      const dest = this.expandUserPath(folder.to);
      mkdirSync(dest, { recursive: true });
      for (const entry of readdirSync(source)) {
        try {
          cpSync(path.join(source, entry), path.join(dest, entry), {
            recursive: true,
            force: true,
          });
        } catch (error) {
          console.warn(`[Preseter] Não foi possível copiar "${entry}" para "${dest}":`, error);
        }
      }
    }
  }
}
