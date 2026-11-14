import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DEFAULT_STORE_SOURCES,
  DEFAULT_STORE_SOURCES_TEXT,
  formatStoreSources,
  isLocalStoreSource,
  mergeStoreCatalogs,
  parseStoreSources,
  resolveStoreSourcePath,
  STORE_BPB_CATALOG_PATH,
} from './store-sources';
import { validateStoreCatalog, type StoreCatalog, type StoreItem } from './store';

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
# bpb store/store-catalog-bpb.json
bpb2 ./store/extra.json
`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sources).toEqual([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'bpb', url: 'store/store-catalog-bpb.json', enabled: false },
      { id: 'bpb2', url: './store/extra.json', enabled: true },
    ]);
  });

  it('aponta ids repetidos e linhas inválidas', () => {
    const parsed = parseStoreSources('main https://a.example/c.json\nmain https://b.example/c.json\nlinha quebrada');
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.issues[0]).toContain('id repetido');
    expect(parsed.issues[1]).toContain('use "<id> <endereço>"');
  });

  it('faz round-trip do formato', () => {
    const text = formatStoreSources([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'bpb', url: STORE_BPB_CATALOG_PATH, enabled: false },
    ]);
    const parsed = parseStoreSources(text);
    expect(parsed.sources).toEqual([
      { id: 'main', url: 'https://example.com/main.json', enabled: true },
      { id: 'bpb', url: STORE_BPB_CATALOG_PATH, enabled: false },
    ]);
  });

  it('identifica fontes locais e resolve o caminho', () => {
    expect(isLocalStoreSource(STORE_BPB_CATALOG_PATH)).toBe(true);
    expect(isLocalStoreSource('./store/catalog.json')).toBe(true);
    expect(isLocalStoreSource('file:///tmp/catalog.json')).toBe(true);
    expect(isLocalStoreSource('https://example.com/catalog.json')).toBe(false);
    expect(resolveStoreSourcePath('./store/catalog.json', 'C:\\App').replace(/[\\/]+/g, '/')).toBe(
      'C:/App/store/catalog.json'
    );
  });

  it('mescla catálogos dando prioridade ao catálogo base', () => {
    const merged = mergeStoreCatalogs(catalog('a', 'b'), [
      { sourceId: 'bpb', catalog: catalog('b', 'c') },
    ]);
    expect(merged.catalog.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(merged.sourceIds.get('a')).toBe('main');
    expect(merged.sourceIds.get('c')).toBe('bpb');
  });

  it('traz o catálogo BPB embutido com itens válidos', async () => {
    const file = path.join(process.cwd(), 'store', 'store-catalog-bpb.json');
    const raw = await fs.readFile(file, 'utf8');
    const result = validateStoreCatalog(raw);
    expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.items.length).toBeGreaterThanOrEqual(20);
    expect(result.catalog.items.every((entry) => entry.id.startsWith('bpb-'))).toBe(true);
    expect(result.catalog.items.every((entry) => entry.source === 'bedroomproducersblog')).toBe(true);
  });

  it('mantém as fontes padrão com o catálogo principal e o BPB', () => {
    expect(DEFAULT_STORE_SOURCES.map((source) => source.id)).toEqual(['main', 'bpb']);
    expect(parseStoreSources(DEFAULT_STORE_SOURCES_TEXT).issues).toEqual([]);
  });
});
