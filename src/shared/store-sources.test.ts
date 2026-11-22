import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_SOURCES,
  DEFAULT_STORE_SOURCES_TEXT,
  formatStoreConfig,
  formatStoreSources,
  isLocalStoreSource,
  mergeStoreCatalogs,
  parseStoreConfig,
  parseStoreSources,
  resolveStoreSourcePath,
  seedStoreConfig,
} from './store-sources';
import { type StoreCatalog, type StoreItem } from './store';

function item(id: string): StoreItem {
  return {
    id,
    type: 'plugin',
    name: id,
    category: 'Sintetizadores',
    author: 'Autor',
    description: 'Item de teste.',
    tier: 'verified',
    source: 'github',
    license: 'GPL-3.0',
    licenseKind: 'open-source',
    essential: false,
    defaultSelected: false,
    thumbnail: { kind: 'generated' },
    variants: [
      {
        os: 'windows',
        arch: ['x64'],
        format: 'VST3',
        kind: 'vst3-zip',
        url: 'https://github.com/example/plugin/releases/download/v1/plugin.zip',
        approxBytes: 1,
      },
    ],
  };
}

function catalog(...ids: string[]): StoreCatalog {
  return { version: 1, items: ids.map(item) };
}

describe('store sources', () => {
  it('lê linhas no estilo sources.list e desativa fontes comentadas', () => {
    const parsed = parseStoreSources(`
# comentário
main https://example.com/main.json
# extra store/extra-commented.json
extra2 ./store/extra.json
`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sources).toEqual([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'extra', url: 'store/extra-commented.json', enabled: false },
      { id: 'extra2', url: './store/extra.json', enabled: true },
    ]);
  });

  it('aponta ids repetidos e linhas inválidas', () => {
    const parsed = parseStoreSources('main https://a.example/c.json\nmain https://b.example/c.json\nlinha quebrada');
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.issues[0]).toContain('fonte repetida');
    expect(parsed.issues[1]).toContain('use "source');
  });

  it('faz round-trip do formato', () => {
    const text = formatStoreSources([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'extra', url: './store/extra.json', enabled: false },
    ]);
    const parsed = parseStoreSources(text);
    expect(parsed.sources).toEqual([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'extra', url: './store/extra.json', enabled: false },
    ]);
  });

  it('identifica fontes locais e resolve o caminho', () => {
    expect(isLocalStoreSource('./store/catalog.json')).toBe(true);
    expect(isLocalStoreSource('file:///tmp/catalog.json')).toBe(true);
    expect(isLocalStoreSource('https://example.com/catalog.json')).toBe(false);
    expect(resolveStoreSourcePath('./store/catalog.json', 'C:\\App').replace(/[\\/]+/g, '/')).toBe(
      'C:/App/store/catalog.json'
    );
  });

  it('mescla catálogos dando prioridade ao catálogo base', () => {
    const merged = mergeStoreCatalogs(catalog('a', 'b'), [
      { sourceId: 'extra', catalog: catalog('b', 'c') },
    ]);
    expect(merged.catalog.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(merged.sourceIds.get('a')).toBe('main');
    expect(merged.sourceIds.get('c')).toBe('extra');
  });

  it('mantém a fonte padrão apenas com o catálogo principal', () => {
    expect(DEFAULT_STORE_SOURCES.map((source) => source.id)).toEqual(['main']);
    expect(parseStoreSources(DEFAULT_STORE_SOURCES_TEXT).issues).toEqual([]);
  });

  it('lê source, page e address com linhas desativadas', () => {
    const parsed = parseStoreConfig(`
source main https://example.com/catalog.json
page surge-xt https://surge-synthesizer.github.io/
# address dexed windows https://github.com/asx2m10/dexed/releases/download/v1/Dexed.zip
address dexed linux https://github.com/asb2m10/dexed/releases/download/v1/Dexed-lnx.zip
`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sources).toEqual([
      { id: 'main', url: 'https://example.com/catalog.json', enabled: true },
    ]);
    expect(parsed.pages).toEqual([
      { itemId: 'surge-xt', url: 'https://surge-synthesizer.github.io/', enabled: true },
    ]);
    expect(parsed.addresses).toEqual([
      {
        itemId: 'dexed',
        os: 'windows',
        url: 'https://github.com/asx2m10/dexed/releases/download/v1/Dexed.zip',
        enabled: false,
      },
      {
        itemId: 'dexed',
        os: 'linux',
        url: 'https://github.com/asb2m10/dexed/releases/download/v1/Dexed-lnx.zip',
        enabled: true,
      },
    ]);
  });

  it('gera a configuração completa com página e downloads por sistema', () => {
    const seeded = seedStoreConfig({
      sources: DEFAULT_STORE_SOURCES,
      catalogs: [{ sourceId: 'main', catalog: catalog('a', 'b') }],
    });
    expect(seeded.sources).toEqual(DEFAULT_STORE_SOURCES);
    expect(seeded.pages.map((page) => page.itemId)).toEqual([]);
    expect(seeded.addresses).toHaveLength(2);
    expect(seeded.addresses[0]).toMatchObject({ itemId: 'a', os: 'windows' });

    const text = formatStoreConfig(seeded);
    const parsed = parseStoreConfig(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.addresses).toHaveLength(2);
  });
});
