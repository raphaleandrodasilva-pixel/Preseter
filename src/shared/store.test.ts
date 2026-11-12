import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  describeStoreItem,
  formatStoreBytes,
  isAllowedStoreUrl,
  pickStoreVariant,
  storeArchForProcess,
  storeItemAvailableFormats,
  storeItemAvailablePlatforms,
  storeItemToCollectionItem,
  storeOsForPlatform,
  storeWildcard,
  validateStoreCatalog,
  type StoreCatalog,
  type StoreItem,
  type StoreVariant,
} from './store';

function variant(overrides: Partial<StoreVariant> = {}): StoreVariant {
  return {
    os: 'windows',
    arch: ['x64'],
    format: 'VST3',
    kind: 'vst3-zip',
    url: 'https://github.com/example/plugin/releases/download/v1.0/Plugin-Windows.zip',
    fileName: 'Plugin-Windows.zip',
    approxBytes: 12_000_000,
    vst3Patterns: ['Plugin.vst3'],
    ...overrides,
  } as StoreVariant;
}

function item(overrides: Partial<StoreItem> = {}): StoreItem {
  return {
    id: 'plugin',
    type: 'plugin',
    name: 'Plugin 1.0',
    category: 'Sintetizadores',
    author: 'Autor',
    description: 'Um plugin de teste.',
    version: '1.0',
    tier: 'verified',
    source: 'github',
    license: 'GPL-3.0',
    licenseKind: 'open-source',
    essential: true,
    defaultSelected: true,
    thumbnail: { kind: 'generated' },
    variants: [
      variant(),
      variant({
        os: 'linux',
        format: 'VST3',
        url: 'https://github.com/example/plugin/releases/download/v1.0/Plugin-Linux.zip',
        fileName: 'Plugin-Linux.zip',
      }),
    ],
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

describe('store catalog', () => {
  it('validates the catalog embedded in the app', () => {
    const raw = readFileSync(
      path.join(process.cwd(), 'store', 'store-catalog.json'),
      'utf8'
    );
    const result = validateStoreCatalog(raw);
    expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
    if (!result.ok) return;
    const ids = result.catalog.items.map((entry) => entry.id);
    expect(ids).toContain('sforzando');
    expect(ids).toContain('fsvr');
    expect(result.catalog.items.every((entry) => entry.essential)).toBe(true);
    expect(result.catalog.items.every((entry) => entry.thumbnail.kind === 'generated')).toBe(true);
  });

  it('validates a complete catalog and rejects unsafe or incomplete data', () => {
    const valid = validateStoreCatalog(catalog(item()));
    expect(valid.ok).toBe(true);

    const unsafe = validateStoreCatalog(
      JSON.stringify(
        catalog(
          item({
            variants: [
              variant({ url: 'http://github.com/example/plugin.zip' } as Partial<StoreVariant>),
            ],
          })
        )
      )
    );
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) {
      expect(unsafe.issues.join(' ')).toMatch(/HTTPS/);
    }

    const incomplete = validateStoreCatalog({ version: 1, items: [{ id: 'x' }] });
    expect(incomplete.ok).toBe(false);
  });

  it('accepts only HTTPS official hosts for downloads', () => {
    expect(isAllowedStoreUrl('https://github.com/example/plugin.zip')).toBe(true);
    expect(isAllowedStoreUrl('https://objects.githubusercontent.com/asset')).toBe(true);
    expect(isAllowedStoreUrl('https://sforzando.s3.us-east-1.amazonaws.com/file.zip')).toBe(true);
    expect(isAllowedStoreUrl('http://github.com/example/plugin.zip')).toBe(false);
    expect(isAllowedStoreUrl('https://malicious.example/plugin.zip')).toBe(false);
  });

  it('resolves the variant by OS and architecture', () => {
    const plugin = item();
    expect(pickStoreVariant(plugin, 'windows', 'x64')?.fileName).toBe('Plugin-Windows.zip');
    expect(pickStoreVariant(plugin, 'linux', 'x64')?.fileName).toBe('Plugin-Linux.zip');
    expect(pickStoreVariant(plugin, 'mac', 'x64')).toBeNull();
    expect(pickStoreVariant(plugin, 'windows', 'arm64')).toBeNull();
  });

  it('describes available platforms/formats and marks unavailable items', () => {
    const plugin = item();
    expect(storeItemAvailablePlatforms(plugin)).toEqual(['windows', 'linux']);
    expect(storeItemAvailableFormats(plugin)).toEqual(['VST3']);

    const description = describeStoreItem(plugin, 'mac', 'x64');
    expect(description.compatible).toBe(false);
    expect(description.variant).toBeNull();
    expect(description.format).toBe('VST3');
  });

  it('converts a resolved variant to the installer model', () => {
    const plugin = item();
    const resolved = pickStoreVariant(plugin, 'linux', 'x64');
    expect(resolved).not.toBeNull();
    const collection = storeItemToCollectionItem(plugin, resolved!);
    expect(collection).toMatchObject({
      id: 'plugin',
      group: 'plugin',
      kind: 'vst3-zip',
      url: 'https://github.com/example/plugin/releases/download/v1.0/Plugin-Linux.zip',
      fileName: 'Plugin-Linux.zip',
      approxBytes: 12_000_000,
      defaultSelected: true,
    });
  });

  it('maps platform/arch names used by the app', () => {
    expect(storeOsForPlatform('win32')).toBe('windows');
    expect(storeOsForPlatform('linux')).toBe('linux');
    expect(storeOsForPlatform('darwin')).toBe('mac');
    expect(storeArchForProcess('arm64')).toBe('arm64');
    expect(storeArchForProcess('x64')).toBe('x64');
    expect(storeArchForProcess('ia32')).toBe('x64');
  });

  it('builds wildcard matchers and formats sizes', () => {
    expect(storeWildcard('Dexed-*-win.zip').test('Dexed-1.1.0-win.zip')).toBe(true);
    expect(storeWildcard('Dexed-*-win.zip').test('Dexed-1.1.0-lnx.zip')).toBe(false);
    expect(formatStoreBytes(0)).toBe('—');
    expect(formatStoreBytes(1024)).toBe('1.0 KB');
  });
});
