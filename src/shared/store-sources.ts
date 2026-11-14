import {
  STORE_CATALOG_URL,
  type StoreItem,
  type StoreCatalog,
  validateStoreCatalog,
} from './store';

/** Nome do arquivo de fontes, no estilo `sources.list` do apt. */
export const STORE_SOURCES_FILE = 'store-sources.list';

/** Catálogo BPB embutido no app. */
export const STORE_BPB_CATALOG_PATH = 'store/store-catalog-bpb.json';

export interface StoreSourceEntry {
  id: string;
  url: string;
  enabled: boolean;
}

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
  /** Caminho do `sources.list` em uso. */
  path: string;
  text: string;
  sources: StoreSourceSummary[];
  /** Caminho do arquivo de endereços editados manualmente. */
  addressesPath: string;
}

export const DEFAULT_STORE_SOURCES: StoreSourceEntry[] = [
  { id: 'main', url: STORE_CATALOG_URL, enabled: true },
  { id: 'bpb', url: STORE_BPB_CATALOG_PATH, enabled: true },
];

export const DEFAULT_STORE_SOURCES_TEXT = formatStoreSources(DEFAULT_STORE_SOURCES);

const LINE_PATTERN = /^([A-Za-z0-9_.-]+)\s+(\S.*)$/;

/** Heurística para distinguir um endereço de um comentário em prosa. */
function looksLikeAddress(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text) || /^file:/i.test(text)) return true;
  if (/^(\.?[\\/]|[A-Za-z]:[\\/])/.test(text)) return true;
  return /[\\/]/.test(text) || /\.(json|list)(\?|#|$)/i.test(text);
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
 * Lê o `sources.list`: uma fonte por linha no formato `<id> <endereço>`.
 * Linhas comentadas com `#` são ignoradas; `# <id> <endereço>` desativa a
 * fonte (mesmo comportamento do apt).
 */
export function parseStoreSources(text: string): StoreSourceParseResult {
  const sources: StoreSourceEntry[] = [];
  const issues: string[] = [];
  const ids = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const commented = line.startsWith('#');
    const body = commented ? line.replace(/^#+\s*/, '').trim() : line;
    if (!body) return;

    const match = LINE_PATTERN.exec(body);
    if (!match) {
      // Um endereço sozinho ganha um id automático, como em sources.list.
      if (looksLikeAddress(body)) {
        const id = `source-${sources.length + 1}`;
        if (ids.has(id)) {
          issues.push(`linha ${index + 1}: id repetido (${id})`);
          return;
        }
        ids.add(id);
        sources.push({ id, url: body, enabled: !commented });
        return;
      }
      // Comentários em prosa (cabeçalho do arquivo) são ignorados.
      if (commented) return;
      issues.push(`linha ${index + 1}: use "<id> <endereço>"`);
      return;
    }

    const id = match[1];
    const url = match[2].trim();
    if (!looksLikeAddress(url)) {
      if (commented) return;
      issues.push(`linha ${index + 1}: use "<id> <endereço>"`);
      return;
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
      issues.push(`linha ${index + 1}: id inválido (${id})`);
      return;
    }
    if (ids.has(id)) {
      issues.push(`linha ${index + 1}: id repetido (${id})`);
      return;
    }
    ids.add(id);
    sources.push({ id, url, enabled: !commented });
  });

  return { sources, issues };
}

/** Serializa as fontes no formato `<id> <endereço>`; desativadas viram comentário. */
export function formatStoreSources(sources: StoreSourceEntry[]): string {
  const lines = [
    '# Fontes da Loja do Preseter',
    '# Formato: <id> <endereço> — uma por linha. Use # no começo para desativar.',
    '# Endereços locais são relativos à pasta do aplicativo.',
    '',
    ...sources.map(
      (source) => `${source.enabled ? '' : '# '}${source.id} ${source.url}`
    ),
    '',
  ];
  return lines.join('\n');
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
