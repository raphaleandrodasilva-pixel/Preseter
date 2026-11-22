import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStoreCatalog } from './store';

const raw = readFileSync(
  path.join(process.cwd(), 'store', 'store-catalog.json'),
  'utf8'
);
const result = validateStoreCatalog(raw);
if (!result.ok) throw new Error(result.issues.join('\n'));
const items = result.catalog.items;

function normalizePage (url: string | undefined): string {
  return String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function normalizeName (name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('catálogo da Loja — limpeza', () => {
  it('valida o catálogo gerado', () => {
    expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
  });

  it('não tem ids repetidos', () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não tem dois itens com a mesma página oficial e o mesmo nome', () => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!item.page) continue;
      const key = `${normalizePage(item.page)}|${normalizeName(item.name)}`;
      const previous = seen.get(key);
      expect(previous, `${item.id} duplica ${previous}`).toBeUndefined();
      seen.set(key, item.id);
    }
  });

  it('não tem fonte, página nem link do Bedroom Producers Blog', () => {
    for (const item of items) {
      expect(item.source).not.toBe('bedroomproducersblog');
      expect(item.page ?? '').not.toMatch(/bedroom|bpb/i);
      for (const variant of item.variants) {
        expect(variant.page ?? '').not.toMatch(/bedroom|bpb/i);
        expect(variant.url ?? '').not.toMatch(/bedroom|bpb/i);
      }
      expect(JSON.stringify(item)).not.toMatch(/bedroomproducersblog|bedroom producers blog/i);
      expect(item.id).not.toMatch(/^bpb-/);
    }
  });

  it('traz os itens migrados do catálogo antigo', () => {
    const ids = new Set(items.map((item) => item.id));
    for (const id of [
      'free-orchestra-2',
      'lux-orchestral-strings',
      'creative-toolbox-piano',
      '1928-vintage-grand-steinway',
      'sweetcase',
      'labs-soft-piano',
      'monastery-grand',
      'piano-one',
      'bfd-player',
      'triaz-player',
      'shreddage-3-stratus-free',
      'foundations-nylon-guitar',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});
