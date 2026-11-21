import {
  STORE_CATALOG_URL,
  type StoreCatalog,
  type StoreItem,
  type StoreOs,
  validateStoreCatalog,
} from './store';

/** Nome do arquivo de configuração, no estilo `sources.list` do apt. */
export const STORE_SOURCES_FILE = 'store-sources.list';

/** Catálogo BPB embutido no app (apenas metadados; links ficam no config). */
export const STORE_BPB_CATALOG_PATH = 'store/store-catalog-bpb.json';

export interface StoreSourceEntry {
  id: string;
  url: string;
  enabled: boolean;
}

export interface StorePageEntry {
  itemId: string;
  url: string;
  enabled: boolean;
}

export interface StoreAddressEntry {
  itemId: string;
  os: StoreOs;
  url: string;
  enabled: boolean;
}

export interface StoreConfig {
  sources: StoreSourceEntry[];
  pages: StorePageEntry[];
  addresses: StoreAddressEntry[];
}

export interface StoreConfigParseResult extends StoreConfig {
  issues: string[];
}

/** Compatibilidade com o formato antigo, que só tinha fontes. */
export interface StoreSourceParseResult {
  sources: StoreSourceEntry[];
  issues: string[];
}

export interface StoreSourceSummary extends StoreSourceEntry {
  /** Fonte local (arquivo dentro do app ou caminho absoluto). */
  local: boolean;
  itemCount: number;
  error?: string;
}

export interface StoreSourcesState {
  /** Caminho do `store-sources.list` em uso. */
  path: string;
  text: string;
  sources: StoreSourceSummary[];
  pageCount: number;
  addressCount: number;
}

/**
 * Cabeçalho explicativo gravado no `store-sources.list`. Fica no arquivo para
 * quem editar entender o formato sem precisar do código.
 */
export const STORE_CONFIG_HEADER: string[] = [
  '# Fontes e endereços da Loja do Preseter',
  '#',
  '# COMO FUNCIONA',
  '# O catálogo define QUAIS itens a Loja mostra (nome, licença, tipo).',
  '# Este arquivo define OS LINKS desses itens: página oficial e download.',
  '# Ele não cria itens: para criar um item novo, edite o catálogo.',
  '# O id precisa ser igual ao do catálogo (diferencia maiúsculas).',
  '#',
  '# COMANDOS',
  '# source  <id>   <url do catálogo>',
  '#     De onde vem a lista de itens. Pode haver mais de uma fonte.',
  '# page    <item> <url oficial>',
  '#     Define o botão "Página do autor". Não baixa nada. Aceita http e https.',
  '# address <item> <windows|linux|mac> <url de download>',
  '#     Define o botão "Baixar e instalar". Precisa ser https.',
  '#     Sem address para um sistema, o item fica sem download nele.',
  '#',
  '# REGRAS',
  '# - Linha começando com # está desativada (não é só comentário).',
  '# - Itens "manual" (Kontakt, Komplete, Spitfire...) exigem conta e app do',
  '#   fabricante: use só "page", nunca "address".',
  '# - Endereços locais de catálogo são relativos à pasta do aplicativo.',
];

export const DEFAULT_STORE_SOURCES: StoreSourceEntry[] = [
  { id: 'main', url: STORE_CATALOG_URL, enabled: true },
];

export const DEFAULT_STORE_SOURCES_TEXT = formatStoreConfig({
  sources: DEFAULT_STORE_SOURCES,
  pages: [],
  addresses: [],
});

const ENTRY_PATTERN = /^([A-Za-z0-9_.-]+)\s+(\S.*)$/;
const OS_VALUES: StoreOs[] = ['windows', 'linux', 'mac'];

/** Heurística para distinguir um endereço de um comentário em prosa. */
function looksLikeAddress(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text) || /^file:/i.test(text)) return true;
  if (/^(\.?[\\/]|[A-Za-z]:[\\/])/.test(text)) return true;
  return /[\\/]/.test(text) || /\.(json|list)(\?|#|$)/i.test(text);
}

function isOs(value: string): value is StoreOs {
  return (OS_VALUES as string[]).includes(value);
}

/** Fonte local: relativa ao app, `file:` ou caminho absoluto. */
export function isLocalStoreSource(url: string): boolean {
  if (/^file:/i.test(url)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
  return false;
}

/** Resolve o caminho de uma fonte local em relação à raiz do app. */
export function resolveStoreSourcePath(url: string, appPath: string): string {
  const raw = url.replace(/^file:\/\//i, '').replace(/^file:/i, '').replace(/^\.([\\/])/, '');
  if (/^([A-Za-z]:[\\/]|\/)/.test(raw)) return raw;
  return `${appPath.replace(/[\\/]+$/, '')}/${raw.replace(/^[\\/]+/, '')}`;
}

/**
 * Lê o arquivo de configuração completo.
 *
 * Formato:
 *   source  <id>       <url do catálogo>
 *   page    <item>     <url>
 *   address <item>     <windows|linux|mac> <url>
 *
 * Linhas começando com `#` desativam a entrada (ou são comentários). O formato
 * antigo `<id> <url>` continua aceito como fonte.
 */
export function parseStoreConfig(text: string): StoreConfigParseResult {
  const sources: StoreSourceEntry[] = [];
  const pages: StorePageEntry[] = [];
  const addresses: StoreAddressEntry[] = [];
  const issues: string[] = [];
  const sourceIds = new Set<string>();
  const pageIds = new Set<string>();
  const addressKeys = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const commented = line.startsWith('#');
    const body = commented ? line.replace(/^#+\s*/, '').trim() : line;
    if (!body) return;

    const parts = body.split(/\s+/);
    const keyword = parts[0].toLowerCase();

    if (keyword === 'source' || keyword === 'page' || keyword === 'address') {
      if (keyword === 'source') {
        if (parts.length < 3 || !looksLikeAddress(parts[2])) {
          if (!commented) issues.push(`linha ${index + 1}: use "source <id> <endereço>"`);
          return;
        }
        const id = parts[1];
        if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
          if (!commented) issues.push(`linha ${index + 1}: id inválido (${id})`);
          return;
        }
        if (sourceIds.has(id)) {
          if (!commented) issues.push(`linha ${index + 1}: fonte repetida (${id})`);
          return;
        }
        sourceIds.add(id);
        sources.push({ id, url: parts.slice(2).join(' '), enabled: !commented });
        return;
      }

      if (keyword === 'page') {
        if (parts.length < 3 || !/^https?:\/\//i.test(parts[2])) {
          if (!commented) issues.push(`linha ${index + 1}: use "page <item> <url http(s)>"`);
          return;
        }
        const itemId = parts[1];
        if (pageIds.has(itemId)) {
          if (!commented) issues.push(`linha ${index + 1}: página repetida (${itemId})`);
          return;
        }
        pageIds.add(itemId);
        pages.push({ itemId, url: parts.slice(2).join(' '), enabled: !commented });
        return;
      }

      if (parts.length < 4 || !isOs(parts[2].toLowerCase())) {
        if (!commented) {
          issues.push(`linha ${index + 1}: use "address <item> <windows|linux|mac> <url>"`);
        }
        return;
      }
      const itemId = parts[1];
      const os = parts[2].toLowerCase() as StoreOs;
      const url = parts.slice(3).join(' ');
      if (!/^https:\/\//i.test(url)) {
        if (!commented) issues.push(`linha ${index + 1}: o download precisa ser HTTPS`);
        return;
      }
      const key = `${itemId}:${os}`;
      if (addressKeys.has(key)) {
        if (!commented) issues.push(`linha ${index + 1}: endereço repetido (${key})`);
        return;
      }
      addressKeys.add(key);
      addresses.push({ itemId, os, url, enabled: !commented });
      return;
    }

    // Formato antigo: <id> <url> (somente fontes).
    const match = ENTRY_PATTERN.exec(body);
    if (!match) {
      if (!looksLikeAddress(body)) {
        if (commented) return;
        issues.push(`linha ${index + 1}: use "source <id> <endereço>", "page <item> <url>" ou "address <item> <sistema> <url>"`);
      }
      return;
    }
    const id = match[1];
    const url = match[2].trim();
    if (!looksLikeAddress(url)) {
      if (commented) return;
      issues.push(`linha ${index + 1}: use "source <id> <endereço>"`);
      return;
    }
    if (sourceIds.has(id)) {
      if (!commented) issues.push(`linha ${index + 1}: fonte repetida (${id})`);
      return;
    }
    sourceIds.add(id);
    sources.push({ id, url, enabled: !commented });
  });

  return { sources, pages, addresses, issues };
}

/** Compatibilidade: lê apenas as fontes de catálogo do arquivo. */
export function parseStoreSources(text: string): StoreSourceParseResult {
  const parsed = parseStoreConfig(text);
  return { sources: parsed.sources, issues: parsed.issues };
}

/** Serializa a configuração inteira em texto editável. */
export function formatStoreConfig(config: StoreConfig): string {
  const lines = [
    ...STORE_CONFIG_HEADER,
    '',
    '# Catálogos',
    ...config.sources.map((source) => `${source.enabled ? '' : '# '}source ${source.id} ${source.url}`),
    '',
    '# Páginas oficiais',
    ...config.pages.map((page) => `${page.enabled ? '' : '# '}page ${page.itemId} ${page.url}`),
    '',
    '# Downloads',
    ...config.addresses.map(
      (address) => `${address.enabled ? '' : '# '}address ${address.itemId} ${address.os} ${address.url}`
    ),
    '',
  ];
  return lines.join('\n');
}

/** Compatibilidade: serializa apenas as fontes no formato antigo-ish. */
export function formatStoreSources(sources: StoreSourceEntry[]): string {
  return formatStoreConfig({ sources, pages: [], addresses: [] });
}

export interface SeedStoreConfigInput {
  sources: StoreSourceEntry[];
  catalogs: Array<{ sourceId: string; catalog: StoreCatalog }>;
}

/**
 * Cria a configuração completa a partir dos catálogos: todas as páginas e todos
 * os downloads por sistema. O primeiro catálogo que define um item vence.
 */
export function seedStoreConfig(input: SeedStoreConfigInput): StoreConfig {
  const pages = new Map<string, StorePageEntry>();
  const addresses = new Map<string, StoreAddressEntry>();

  for (const { catalog } of input.catalogs) {
    for (const item of catalog.items) {
      const page = item.page ?? item.variants.find((variant) => variant.page)?.page;
      if (page && /^https?:\/\//i.test(page) && !pages.has(item.id)) {
        pages.set(item.id, { itemId: item.id, url: page, enabled: true });
      }
      for (const variant of item.variants) {
        if (!variant.url || !/^https:\/\//i.test(variant.url)) continue;
        const key = `${item.id}:${variant.os}`;
        if (addresses.has(key)) continue;
        addresses.set(key, {
          itemId: item.id,
          os: variant.os,
          url: variant.url,
          enabled: true,
        });
      }
    }
  }

  return {
    sources: input.sources.map((source) => ({ ...source })),
    pages: Array.from(pages.values()).sort((a, b) => a.itemId.localeCompare(b.itemId)),
    addresses: Array.from(addresses.values()).sort(
      (a, b) => a.itemId.localeCompare(b.itemId) || a.os.localeCompare(b.os)
    ),
  };
}

/** Mescla catálogos sem repetir ids; o primeiro catálogo tem prioridade. */
export function mergeStoreCatalogs(
  base: StoreCatalog,
  extras: Array<{ sourceId: string; catalog: StoreCatalog }>
): { catalog: StoreCatalog; sourceIds: Map<string, string> } {
  const items: StoreItem[] = [];
  const ids = new Set<string>();
  const sourceIds = new Map<string, string>();

  for (const item of base.items) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    items.push(item);
    sourceIds.set(item.id, 'main');
  }

  for (const extra of extras) {
    for (const item of extra.catalog.items) {
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      items.push(item);
      sourceIds.set(item.id, extra.sourceId);
    }
  }

  return { catalog: { ...base, items }, sourceIds };
}

/** Valida e lê um catálogo de fonte (JSON ou objeto). */
export function readStoreCatalog(raw: unknown): StoreCatalog | null {
  const result = validateStoreCatalog(raw);
  return result.ok ? result.catalog : null;
}
