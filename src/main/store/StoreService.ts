import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import type {
  CollectionDownloadResult,
  CollectionItem,
  CollectionItemStatus,
  CollectionProgress,
} from '../../shared/collection';
import {
  describeStoreItem,
  isAllowedStoreUrl,
  STORE_CATALOG_URL,
  STORE_MIN_CHECK_INTERVAL_MS,
  storeArchForProcess,
  storeItemToCollectionItem,
  storeOsForPlatform,
  storeWildcard,
  validateStoreCatalog,
  type StoreArch,
  type StoreCatalog,
  type StoreCatalogSource,
  type StoreItem,
  type StoreItemView,
  type StoreOs,
  type StoreSnapshot,
  type StoreUpdateResult,
  type StoreVariant,
} from '../../shared/store';
import type { SupportedPlatform } from '../platform/paths';

/** Parte do CollectionInstaller usada pela Loja (facilita testes). */
export interface StoreInstaller {
  status: (items: CollectionItem[]) => CollectionItemStatus[];
  install: (
    items: CollectionItem[],
    ids: string[],
    force?: boolean
  ) => Promise<{
    statuses: CollectionItemStatus[];
    summary: CollectionDownloadResult['summary'];
  }>;
  cancel: () => void;
  subscribe?: (listener: (progress: CollectionProgress) => void) => () => void;
}

export interface StoreServiceOptions {
  /** Raiz do app (em produção, o app.asar). */
  appPath: string;
  /** Pasta de dados do usuário (cache do catálogo). */
  userData: string;
  platform: SupportedPlatform;
  arch: string;
  installer: StoreInstaller;
  remoteUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Desliga a resolução automática de links (usado em testes/offline). */
  autoResolveLinks?: boolean;
  onProgress?: (progress: CollectionProgress) => void;
  onCatalogUpdated?: (result: StoreUpdateResult) => void;
  onImagesUpdated?: (snapshot: StoreSnapshot) => void;
}

interface StoreCacheFile {
  catalog: unknown;
  fetchedAt?: string;
  checkedAt?: string;
  etag?: string | null;
}

interface StoreImageEntry {
  url: string;
  sourcePage: string;
  fetchedAt: string;
}

interface StoreImageCacheFile {
  images: Record<string, StoreImageEntry>;
}

const CACHE_FILE = 'store-catalog.json';
const IMAGE_CACHE_FILE = 'store-thumbnails.json';
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15_000;
const HEAD_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_CONCURRENCY = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function catalogUpdatedAt(catalog: StoreCatalog): number {
  const value = catalog.updatedAt ? Date.parse(catalog.updatedAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Mantém o catálogo da Loja, atualiza os links pelo repositório remoto e
 * reaproveita o CollectionInstaller para baixar/instalar os itens.
 */
export class StoreService {
  private readonly options: StoreServiceOptions;
  private readonly os: StoreOs;
  private readonly arch: StoreArch;
  private readonly cachePath: string;
  private readonly imageCachePath: string;
  private catalog: StoreCatalog = { version: 1, items: [] };
  private images: Record<string, StoreImageEntry> = {};
  private source: StoreCatalogSource = 'embedded';
  private catalogError?: string;
  private lastCheckedAt?: string;
  private etag?: string | null;
  private initialized: Promise<void> | null = null;
  private updateInFlight: Promise<StoreUpdateResult> | null = null;
  private readonly progressById = new Map<string, CollectionItemStatus>();
  private unsubscribe?: () => void;

  constructor(options: StoreServiceOptions) {
    this.options = options;
    this.os = storeOsForPlatform(options.platform);
    this.arch = storeArchForProcess(options.arch);
    this.cachePath = path.join(options.userData, CACHE_FILE);
    this.imageCachePath = path.join(options.userData, IMAGE_CACHE_FILE);
    if (options.installer.subscribe) {
      this.unsubscribe = options.installer.subscribe((progress) => {
        this.progressById.set(progress.item.id, progress.item);
        options.onProgress?.(progress);
      });
    }
  }

  /** Libera a inscrição de progresso (usado em testes). */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Carrega o catálogo embutido e o cache local. Idempotente. */
  initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.loadCatalog().catch((error) => {
        // Nunca derruba o app por causa da Loja; a UI mostra o erro.
        this.catalog = { version: 1, items: [] };
        this.source = 'embedded';
        this.catalogError = errorMessage(error);
        console.warn('[Preseter] Catálogo da Loja indisponível:', error);
      });
    }
    return this.initialized;
  }

  private async loadCatalog(): Promise<void> {
    const embedded = await this.readEmbedded();
    const cached = await this.readCache();
    if (
      cached.catalog &&
      (!embedded.catalog || catalogUpdatedAt(cached.catalog) >= catalogUpdatedAt(embedded.catalog))
    ) {
      this.catalog = cached.catalog;
      this.source = 'cache';
    } else if (embedded.catalog) {
      this.catalog = embedded.catalog;
      this.source = 'embedded';
    } else {
      throw new Error(embedded.error ?? cached.error ?? 'Catálogo da Loja não encontrado.');
    }
    this.lastCheckedAt = cached.checkedAt;
    this.etag = cached.etag;
    await this.loadImages();
    if (this.catalog.items.length === 0) {
      this.catalogError = embedded.error ?? cached.error ?? 'Catálogo da Loja vazio.';
    }
  }

  private async readEmbedded(): Promise<{ catalog: StoreCatalog | null; error?: string }> {
    const candidate = path.join(this.options.appPath, 'store', 'store-catalog.json');
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const result = validateStoreCatalog(raw);
      if (!result.ok) {
        return { catalog: null, error: `Catálogo embutido inválido: ${result.issues[0]}` };
      }
      return { catalog: result.catalog };
    } catch (error) {
      return { catalog: null, error: `Não foi possível ler ${candidate}: ${errorMessage(error)}` };
    }
  }

  private async readCache(): Promise<{
    catalog: StoreCatalog | null;
    checkedAt?: string;
    etag?: string | null;
    error?: string;
  }> {
    if (!existsSync(this.cachePath)) return { catalog: null };
    try {
      const raw = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const envelope =
        parsed && typeof parsed === 'object' && 'catalog' in parsed
          ? (parsed as Partial<StoreCacheFile>)
          : null;
      const candidate = envelope ? envelope.catalog : parsed;
      const result = validateStoreCatalog(candidate);
      if (!result.ok) {
        return { catalog: null, error: `Cache da Loja inválido: ${result.issues[0]}` };
      }
      return {
        catalog: result.catalog,
        checkedAt: typeof envelope?.checkedAt === 'string' ? envelope.checkedAt : undefined,
        etag: typeof envelope?.etag === 'string' ? envelope.etag : null,
      };
    } catch (error) {
      return { catalog: null, error: `Cache da Loja inválido: ${errorMessage(error)}` };
    }
  }

  private async writeCache(catalog: StoreCatalog, etag: string | null): Promise<void> {
    const payload: StoreCacheFile = {
      catalog,
      fetchedAt: new Date(this.now()).toISOString(),
      checkedAt: this.lastCheckedAt,
      etag,
    };
    await fs.mkdir(this.options.userData, { recursive: true });
    await fs.writeFile(this.cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  private async loadImages(): Promise<void> {
    try {
      const raw = await fs.readFile(this.imageCachePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreImageCacheFile>;
      const images = parsed.images;
      if (!images || typeof images !== 'object') return;
      for (const [id, entry] of Object.entries(images)) {
        if (
          entry &&
          typeof entry.url === 'string' &&
          /^https:\/\//i.test(entry.url) &&
          typeof entry.sourcePage === 'string' &&
          typeof entry.fetchedAt === 'string'
        ) {
          this.images[id] = entry;
        }
      }
    } catch {
      /* cache de imagens ainda não existe */
    }
  }

  private async saveImages(): Promise<void> {
    const payload: StoreImageCacheFile = { images: this.images };
    await fs.mkdir(this.options.userData, { recursive: true });
    await fs.writeFile(this.imageCachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  private imageFor(item: StoreItem): StoreItem['thumbnail'] {
    const image = this.images[item.id];
    return image
      ? { kind: 'official', url: image.url, attribution: item.author }
      : item.thumbnail;
  }

  private pageFor(item: StoreItem): string | undefined {
    return item.page ?? item.variants.find((variant) => variant.page)?.page;
  }

  /**
   * Busca uma imagem oficial (Open Graph/Twitter) na página do item. Não usa
   * Google: a imagem vem da própria página do desenvolvedor e é exibida com
   * fallback para a miniatura gerada.
   */
  async refreshImages(force = false): Promise<{
    updated: number;
    failed: number;
    snapshot: StoreSnapshot;
  }> {
    await this.initialize();
    const now = this.now();
    const candidates = this.catalog.items.filter((item) => {
      if (!this.pageFor(item)) return false;
      if (force) return true;
      const cached = this.images[item.id];
      if (!cached) return true;
      const fetched = Date.parse(cached.fetchedAt);
      return !Number.isFinite(fetched) || now - fetched > IMAGE_TTL_MS;
    });

    let updated = 0;
    let failed = 0;
    await this.mapLimit(candidates, LINK_CONCURRENCY, async (item) => {
      const page = this.pageFor(item);
      if (!page) return;
      try {
        const image = await this.fetchPageImage(page);
        if (image) {
          this.images[item.id] = {
            url: image,
            sourcePage: page,
            fetchedAt: new Date(this.now()).toISOString(),
          };
          updated += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    });

    if (updated > 0) await this.saveImages();
    const snapshot = await this.snapshot();
    this.options.onImagesUpdated?.(snapshot);
    return { updated, failed, snapshot };
  }

  private async fetchPageImage(page: string): Promise<string | null> {
    const response = await this.fetchWithTimeout(page, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Preseter',
      },
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];
    let source: string | undefined;
    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        source = match[1];
        break;
      }
    }
    if (!source) return null;
    const url = new URL(source.replace(/&amp;/g, '&'), page).toString();
    return /^https:\/\//i.test(url) ? url : null;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private compatibleCollectionItems(): CollectionItem[] {
    return this.catalog.items
      .map((item) => describeStoreItem(item, this.os, this.arch))
      .filter((description) => description.variant !== null)
      .map((description) =>
        storeItemToCollectionItem(description.item, description.variant as StoreVariant)
      );
  }

  private view(
    description: ReturnType<typeof describeStoreItem>,
    status: CollectionItemStatus | undefined
  ): StoreItemView {
    const base: StoreItemView = {
      ...description.item,
      thumbnail: this.imageFor(description.item),
      variant: description.variant,
      compatible: description.compatible,
      format: description.format,
      approxBytes: description.approxBytes,
      availablePlatforms: description.availablePlatforms,
      availableFormats: description.availableFormats,
      status: status?.status ?? (description.compatible ? 'missing' : 'unsupported'),
    };
    if (status) {
      const live = this.progressById.get(status.id);
      const liveDownloading =
        live?.status === 'downloading' || live?.status === 'extracting';
      const chosen = liveDownloading ? live : status;
      base.status = chosen.status;
      base.filePath = chosen.filePath;
      base.receivedBytes = chosen.receivedBytes;
      base.totalBytes = chosen.totalBytes;
      base.percent = chosen.percent;
      base.message = chosen.message;
    }
    return base;
  }

  /** Estado atual para a UI da Loja. */
  async snapshot(): Promise<StoreSnapshot> {
    await this.initialize();
    const descriptions = this.catalog.items.map((item) =>
      describeStoreItem(item, this.os, this.arch)
    );
    const collectionItems = this.compatibleCollectionItems();
    let statuses: CollectionItemStatus[] = [];
    if (collectionItems.length > 0) {
      try {
        statuses = this.options.installer.status(collectionItems);
      } catch (error) {
        console.warn('[Preseter] Não foi possível verificar os itens da Loja:', error);
      }
    }
    const byId = new Map(statuses.map((status) => [status.id, status]));
    const items = descriptions.map((description) =>
      this.view(description, byId.get(description.item.id))
    );
    const installed = items.filter(
      (item) => item.status === 'installed' || item.status === 'ready'
    );
    return {
      catalogVersion: this.catalog.version,
      updatedAt: this.catalog.updatedAt,
      source: this.source,
      lastCheckedAt: this.lastCheckedAt,
      platform: this.os,
      arch: this.arch,
      items,
      installedCount: installed.length,
      missingCount: items.filter((item) => item.status === 'missing').length,
      totalCount: items.filter((item) => item.compatible).length,
      installedBytes: installed.reduce((sum, item) => sum + Math.max(0, item.approxBytes), 0),
      error: this.catalogError,
    };
  }

  /** Baixa/instala os itens selecionados usando o instalador compartilhado. */
  async download(ids: string[], force = false): Promise<CollectionDownloadResult> {
    await this.initialize();
    const selected = ids.filter((id): id is string => typeof id === 'string');
    const items = this.compatibleCollectionItems();
    const known = new Set(items.map((item) => item.id));
    const valid = selected.filter((id) => known.has(id));
    const result = await this.options.installer.install(items, valid, force);
    const byId = new Map(result.statuses.map((item) => [item.id, item]));
    const statuses = items
      .filter((item) => valid.includes(item.id))
      .map((item) => byId.get(item.id) ?? this.options.installer.status([item])[0])
      .filter((item): item is CollectionItemStatus => Boolean(item));
    return {
      ok: result.summary.failed === 0 && result.summary.cancelled === 0,
      statuses,
      summary: result.summary,
    };
  }

  cancel(): void {
    this.options.installer.cancel();
  }

  /** Atualiza o catálogo remoto; nunca substitui o cache por conteúdo inválido. */
  async checkUpdates(force = false): Promise<StoreUpdateResult> {
    await this.initialize();
    const now = this.now();
    const last = this.lastCheckedAt ? Date.parse(this.lastCheckedAt) : 0;
    if (!force && last > 0 && now - last < STORE_MIN_CHECK_INTERVAL_MS) {
      return {
        ok: true,
        updated: false,
        skipped: true,
        source: this.source,
        checkedAt: new Date(last).toISOString(),
        snapshot: await this.snapshot(),
      };
    }
    if (this.updateInFlight) return this.updateInFlight;
    this.updateInFlight = this.performUpdate().finally(() => {
      this.updateInFlight = null;
    });
    return this.updateInFlight;
  }

  private async performUpdate(): Promise<StoreUpdateResult> {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const remoteUrl = this.options.remoteUrl ?? STORE_CATALOG_URL;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'Preseter',
      };
      if (this.etag) headers['If-None-Match'] = this.etag;
      const response = await this.fetchWithTimeout(remoteUrl, {
        headers,
        timeoutMs: REMOTE_TIMEOUT_MS,
      });

      if (response.status === 304) {
        this.lastCheckedAt = checkedAt;
        await this.writeCache(this.catalog, this.etag ?? null);
        const result: StoreUpdateResult = {
          ok: true,
          updated: false,
          notModified: true,
          source: this.source,
          checkedAt,
          snapshot: await this.snapshot(),
        };
        this.options.onCatalogUpdated?.(result);
        return result;
      }
      if (!response.ok) {
        throw new Error(`O catálogo remoto respondeu HTTP ${response.status}.`);
      }
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_CATALOG_BYTES) {
        throw new Error('O catálogo remoto é grande demais.');
      }
      const text = await response.text();
      if (text.length > MAX_CATALOG_BYTES) {
        throw new Error('O catálogo remoto é grande demais.');
      }
      const validation = validateStoreCatalog(text);
      if (!validation.ok) {
        throw new Error(`Catálogo remoto inválido: ${validation.issues[0]}`);
      }
      if (catalogUpdatedAt(validation.catalog) < catalogUpdatedAt(this.catalog)) {
        throw new Error('O catálogo remoto é mais antigo que o local; mantendo o catálogo atual.');
      }

      let catalog = validation.catalog;
      let resolvedLinks = 0;
      let brokenLinks = 0;
      if (this.options.autoResolveLinks !== false) {
        const resolved = await this.resolveLinks(catalog);
        catalog = resolved.catalog;
        resolvedLinks = resolved.resolved;
        brokenLinks = resolved.broken;
      }
      if (!catalog.updatedAt) catalog = { ...catalog, updatedAt: checkedAt };

      this.catalog = catalog;
      this.source = 'remote';
      this.catalogError = undefined;
      this.etag = response.headers.get('etag');
      this.lastCheckedAt = checkedAt;
      await this.writeCache(catalog, this.etag ?? null);
      const result: StoreUpdateResult = {
        ok: true,
        updated: true,
        source: this.source,
        checkedAt,
        snapshot: await this.snapshot(),
        resolvedLinks,
        brokenLinks,
      };
      this.options.onCatalogUpdated?.(result);
      return result;
    } catch (error) {
      const result: StoreUpdateResult = {
        ok: false,
        updated: false,
        source: this.source,
        checkedAt,
        snapshot: await this.snapshot(),
        error: errorMessage(error),
      };
      return result;
    }
  }

  /**
   * Resolve assets do GitHub pelo release mais recente e valida links diretos
   * com HEAD. Links que falham por rede/limite de taxa ficam como "unknown" em
   * vez de derrubar o catálogo.
   */
  private async resolveLinks(catalog: StoreCatalog): Promise<{
    catalog: StoreCatalog;
    resolved: number;
    broken: number;
  }> {
    const clone = JSON.parse(JSON.stringify(catalog)) as StoreCatalog;
    const checkedAt = new Date(this.now()).toISOString();
    let resolved = 0;
    let broken = 0;
    const githubRepos = new Map<string, StoreVariant[]>();

    for (const item of clone.items) {
      for (const variant of item.variants) {
        if (variant.resolve === 'github-latest' && variant.repository) {
          const list = githubRepos.get(variant.repository) ?? [];
          list.push(variant);
          githubRepos.set(variant.repository, list);
        }
      }
    }

    for (const [repository, variants] of githubRepos) {
      try {
        const response = await this.fetchWithTimeout(
          `https://api.github.com/repos/${repository}/releases/latest`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Preseter',
            },
            timeoutMs: REMOTE_TIMEOUT_MS,
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const release = (await response.json()) as {
          tag_name?: unknown;
          assets?: Array<{
            name?: unknown;
            browser_download_url?: unknown;
            size?: unknown;
          }>;
        };
        const tag = typeof release.tag_name === 'string' ? release.tag_name : undefined;
        const assets = Array.isArray(release.assets) ? release.assets : [];
        for (const variant of variants) {
          const pattern = variant.assetPattern ? storeWildcard(variant.assetPattern) : null;
          const asset = pattern
            ? assets.find(
                (candidate) =>
                  typeof candidate.name === 'string' && pattern.test(candidate.name)
              )
            : assets.find(
                (candidate) =>
                  typeof candidate.name === 'string' && candidate.name === variant.fileName
              );
          if (
            asset &&
            typeof asset.browser_download_url === 'string' &&
            isAllowedStoreUrl(asset.browser_download_url)
          ) {
            variant.url = asset.browser_download_url;
            if (typeof asset.name === 'string') variant.fileName = asset.name;
            if (typeof asset.size === 'number' && asset.size > 0) {
              variant.approxBytes = asset.size;
            }
            if (tag) variant.version = tag.replace(/^v/i, '');
            variant.linkStatus = 'ok';
            variant.linkCheckedAt = checkedAt;
            resolved += 1;
          } else {
            variant.linkStatus = 'unknown';
            variant.linkCheckedAt = checkedAt;
            variant.linkMessage = 'O release mais recente não tem um arquivo correspondente.';
          }
        }
      } catch (error) {
        for (const variant of variants) {
          variant.linkStatus = 'unknown';
          variant.linkCheckedAt = checkedAt;
          variant.linkMessage = `Não foi possível consultar o GitHub: ${errorMessage(error)}`;
        }
      }
    }

    const headVariants = clone.items
      .flatMap((item) => item.variants)
      .filter(
        (variant) =>
          variant.resolve === 'head' &&
          typeof variant.url === 'string' &&
          isAllowedStoreUrl(variant.url)
      );

    await this.mapLimit(headVariants, LINK_CONCURRENCY, async (variant) => {
      try {
        const response = await this.fetchWithTimeout(variant.url as string, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Preseter' },
          timeoutMs: HEAD_TIMEOUT_MS,
          redirect: 'follow',
        });
        variant.linkCheckedAt = checkedAt;
        if (response.status === 404 || response.status === 410) {
          variant.linkStatus = 'broken';
          variant.linkMessage = `Link indisponível (HTTP ${response.status}).`;
          broken += 1;
        } else if (response.ok || (response.status >= 300 && response.status < 400)) {
          variant.linkStatus = 'ok';
        } else {
          variant.linkStatus = 'unknown';
          variant.linkMessage = `O servidor respondeu HTTP ${response.status}.`;
        }
      } catch (error) {
        variant.linkStatus = 'unknown';
        variant.linkCheckedAt = checkedAt;
        variant.linkMessage = `Não foi possível validar o link: ${errorMessage(error)}`;
      }
    });

    return { catalog: clone, resolved, broken };
  }

  private async mapLimit<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index]);
      }
    });
    await Promise.all(runners);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs: number }
  ): Promise<Response> {
    const { timeoutMs, ...options } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetcher = this.options.fetchImpl ?? globalThis.fetch;
      if (!fetcher) throw new Error('fetch indisponível neste ambiente.');
      return await fetcher(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
