import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CollectionItem, CollectionItemStatus, CollectionItemStatusValue } from '../../shared/collection';
import type { StoreCatalog, StoreItem, StoreVariant } from '../../shared/store';
import { StoreService, type StoreInstaller } from './StoreService';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

function variant(overrides: Partial<StoreVariant> = {}): StoreVariant {
  return {
    os: 'windows',
    arch: ['x64'],
    format: 'VST3',
    kind: 'vst3-zip',
    url: 'https://github.com/example/plugin/releases/download/v1.0/Plugin-Windows.zip',
    fileName: 'Plugin-Windows.zip',
    approxBytes: 10_000,
    vst3Patterns: ['Plugin.vst3'],
    resolve: 'github-latest',
    repository: 'example/plugin',
    assetPattern: 'Plugin-*.zip',
    ...overrides,
  };
}

function item(overrides: Partial<StoreItem> = {}): StoreItem {
  return {
    id: 'plugin',
    type: 'plugin',
    name: 'Plugin 1.0',
    category: 'Sintetizadores',
    author: 'Autor',
    description: 'Plugin de teste.',
    version: '1.0',
    tier: 'verified',
    source: 'github',
    license: 'GPL-3.0',
    licenseKind: 'open-source',
    essential: true,
    defaultSelected: true,
    thumbnail: { kind: 'generated' },
    variants: [variant()],
    ...overrides,
  };
}

function catalog(...items: StoreItem[]): StoreCatalog {
  return {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    items,
  };
}

function statusOf(item: CollectionItem, value: CollectionItemStatusValue): CollectionItemStatus {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    group: item.group,
    kind: item.kind,
    approxBytes: item.approxBytes,
    license: item.license,
    defaultSelected: item.defaultSelected,
    status: value,
  };
}

function createInstaller(
  initial: Record<string, CollectionItemStatusValue> = {}
): StoreInstaller & { install: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
  const states = new Map(Object.entries(initial));
  return {
    status: vi.fn((items: CollectionItem[]) =>
      items.map((item) => statusOf(item, states.get(item.id) ?? 'missing'))
    ),
    install: vi.fn(async (items: CollectionItem[], ids: string[]) => {
      const selected = items.filter((item) => ids.includes(item.id));
      for (const item of selected) states.set(item.id, 'installed');
      return {
        statuses: selected.map((item) => statusOf(item, 'installed' as const)),
        summary: {
          total: selected.length,
          downloaded: selected.length,
          installed: selected.length,
          skipped: 0,
          failed: 0,
          cancelled: 0,
          manual: 0,
        },
      };
    }),
    cancel: vi.fn(),
  } as StoreInstaller & { install: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
}

describe('StoreService', () => {
  let root: string;
  let appPath: string;
  let userData: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'preseter-store-'));
    appPath = path.join(root, 'app');
    userData = path.join(root, 'user');
    await fs.mkdir(path.join(appPath, 'store'), { recursive: true });
    await fs.mkdir(userData, { recursive: true });
    await fs.writeFile(
      path.join(appPath, 'store', 'store-catalog.json'),
      JSON.stringify(catalog(item())),
      'utf8'
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function service(
    installer: StoreInstaller,
    fetchImpl?: typeof fetch,
    overrides: Partial<ConstructorParameters<typeof StoreService>[0]> = {}
  ) {
    return new StoreService({
      appPath,
      userData,
      platform: 'win32',
      arch: 'x64',
      installer,
      fetchImpl,
      now: () => NOW,
      autoResolveLinks: false,
      ...overrides,
    });
  }

  it('loads the embedded catalog and resolves items for the current system', async () => {
    const installer = createInstaller({ plugin: 'installed' });
    const store = service(installer);
    const snapshot = await store.snapshot();

    expect(snapshot.source).toBe('embedded');
    expect(snapshot.platform).toBe('windows');
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      id: 'plugin',
      compatible: true,
      format: 'VST3',
      status: 'installed',
    });
    expect(snapshot.installedCount).toBe(1);
    expect(snapshot.installedBytes).toBe(10_000);
  });

  it('prefers a newer cached catalog over the embedded one', async () => {
    await fs.writeFile(
      path.join(userData, 'store-catalog.json'),
      JSON.stringify({
        catalog: {
          ...catalog(item({ name: 'Plugin do cache', version: '2.0' })),
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
        checkedAt: '2026-02-01T00:00:00.000Z',
        etag: 'cache-etag',
      }),
      'utf8'
    );
    const store = service(createInstaller());
    const snapshot = await store.snapshot();
    expect(snapshot.source).toBe('cache');
    expect(snapshot.items[0].name).toBe('Plugin do cache');
    expect(snapshot.lastCheckedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('downloads through the shared installer and returns updated statuses', async () => {
    const installer = createInstaller();
    const store = service(installer);
    const result = await store.download(['plugin', 'unknown'], true);

    expect(installer.install).toHaveBeenCalledTimes(1);
    const [items, ids, force] = installer.install.mock.calls[0];
    expect(items[0]).toMatchObject({ id: 'plugin', group: 'plugin', kind: 'vst3-zip' });
    expect(ids).toEqual(['plugin']);
    expect(force).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.statuses[0].status).toBe('installed');
  });

  it('cancels the shared installer', () => {
    const installer = createInstaller();
    const store = service(installer);
    store.cancel();
    expect(installer.cancel).toHaveBeenCalled();
  });

  it('updates from the remote catalog, resolves links and writes the cache', async () => {
    const remote = catalog(
      item({
        name: 'Plugin remoto',
        variants: [
          variant({
            url: 'https://github.com/example/plugin/releases/download/v1.0/Plugin-Windows.zip',
          }),
        ],
      })
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.github.com')) {
        return new Response(
          JSON.stringify({
            tag_name: 'v2.0',
            assets: [
              {
                name: 'Plugin-2.0.zip',
                browser_download_url:
                  'https://github.com/example/plugin/releases/download/v2.0/Plugin-2.0.zip',
                size: 42_000,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      return new Response(JSON.stringify(remote), {
        status: 200,
        headers: { etag: '"remote-etag"' },
      });
    }) as unknown as typeof fetch;

    const store = service(createInstaller(), fetcher, { autoResolveLinks: true });
    const result = await store.checkUpdates(true);

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.source).toBe('remote');
    expect(result.resolvedLinks).toBe(1);
    expect(result.snapshot.items[0].variant).toMatchObject({
      url: 'https://github.com/example/plugin/releases/download/v2.0/Plugin-2.0.zip',
      fileName: 'Plugin-2.0.zip',
      version: '2.0',
      linkStatus: 'ok',
    });
    expect(result.snapshot.items[0].approxBytes).toBe(42_000);

    const cache = JSON.parse(
      await fs.readFile(path.join(userData, 'store-catalog.json'), 'utf8')
    );
    expect(cache.etag).toBe('"remote-etag"');
    expect(cache.catalog.items[0].name).toBe('Plugin remoto');
  });

  it('marks direct links as broken on 404 and keeps unknown on network errors', async () => {
    const remote = catalog(
      item({
        variants: [
          variant({
            resolve: 'head',
            repository: undefined,
            assetPattern: undefined,
            url: 'https://tytel.org/arquivo.msi',
            fileName: 'arquivo.msi',
          }),
        ],
      }),
      item({
        id: 'outro',
        name: 'Outro',
        variants: [
          variant({
            resolve: 'head',
            repository: undefined,
            assetPattern: undefined,
            url: 'https://blaukraut.info/arquivo.zip',
            fileName: 'arquivo.zip',
          }),
        ],
      })
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'HEAD' && url.includes('tytel.org')) {
        return new Response(null, { status: 404 });
      }
      if (init?.method === 'HEAD') throw new Error('offline');
      return new Response(JSON.stringify(remote), { status: 200 });
    }) as unknown as typeof fetch;

    const store = service(createInstaller(), fetcher, { autoResolveLinks: true });
    const result = await store.checkUpdates(true);
    const [first, second] = result.snapshot.items;
    expect(first.variant?.linkStatus).toBe('broken');
    expect(second.variant?.linkStatus).toBe('unknown');
    expect(result.brokenLinks).toBe(1);
  });

  it('keeps the current catalog when the remote response is invalid', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ version: 1, items: [{ id: 'quebrado' }] }), {
        status: 200,
      })
    ) as unknown as typeof fetch;

    const store = service(createInstaller(), fetcher);
    const before = await store.snapshot();
    const result = await store.checkUpdates(true);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/inválido/i);
    expect(result.snapshot.items[0].id).toBe(before.items[0].id);
  });

  it('busca a imagem oficial da página do item e usa fallback quando não existe', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://example.com/plugin') {
        return new Response(
          '<html><head><meta property="og:image" content="https://cdn.example.com/plugin.png"></head></html>',
          { status: 200 }
        );
      }
      return new Response('<html><head></head></html>', { status: 200 });
    }) as unknown as typeof fetch;
    const store = service(createInstaller(), fetcher, { autoResolveLinks: false });
    // Substitui o catálogo embutido por um item com página oficial.
    await fs.writeFile(
      path.join(appPath, 'store', 'store-catalog.json'),
      JSON.stringify(
        catalog(
          item({
            page: 'https://example.com/plugin',
            thumbnail: { kind: 'generated' },
          })
        )
      ),
      'utf8'
    );

    const result = await store.refreshImages(true);
    expect(result.updated).toBe(1);
    expect(result.snapshot.items[0].thumbnail).toMatchObject({
      kind: 'official',
      url: 'https://cdn.example.com/plugin.png',
    });
    const cache = JSON.parse(
      await fs.readFile(path.join(userData, 'store-thumbnails.json'), 'utf8')
    );
    expect(cache.images.plugin.url).toBe('https://cdn.example.com/plugin.png');
  });

  it('keeps a newer embedded catalog when the remote is older', async () => {
    await fs.writeFile(
      path.join(appPath, 'store', 'store-catalog.json'),
      JSON.stringify({
        ...catalog(item({ name: 'Embutido novo' })),
        updatedAt: '2026-03-01T00:00:00.000Z',
      }),
      'utf8'
    );
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(catalog(item({ name: 'Remoto antigo' }))), {
        status: 200,
      })
    ) as unknown as typeof fetch;

    const store = service(createInstaller(), fetcher);
    const result = await store.checkUpdates(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mais antigo/i);
    expect(result.snapshot.items[0].name).toBe('Embutido novo');
  });

  it('accepts a 304 response without replacing the catalog', async () => {
    await fs.writeFile(
      path.join(userData, 'store-catalog.json'),
      JSON.stringify({
        catalog: catalog(item()),
        checkedAt: '2026-01-01T00:00:00.000Z',
        etag: '"same"',
      }),
      'utf8'
    );
    const fetcher = vi.fn(async () => new Response(null, { status: 304 })) as unknown as typeof fetch;
    const store = service(createInstaller(), fetcher);
    const result = await store.checkUpdates(true);
    expect(result.ok).toBe(true);
    expect(result.notModified).toBe(true);
    expect(result.updated).toBe(false);
  });
});
