import type {
  CollectionDataFolder,
  CollectionItem,
  CollectionItemStatusValue,
  CollectionKind,
} from './collection';

/** Sistemas usados pelas variantes da Loja. */
export type StoreOs = 'windows' | 'linux' | 'mac';
export type StoreArch = 'x64' | 'arm64';
export type StoreFormat =
  | 'VST3'
  | 'LV2'
  | 'VST2'
  | 'CLAP'
  | 'SFZ'
  | 'SF2'
  | 'Instalador'
  | 'Preset';
export type StoreItemType = 'plugin' | 'library';
export type StoreTier = 'verified' | 'indexed';
export type StoreSource =
  | 'github'
  | 'official'
  | 'archive'
  | 'musical-artifacts'
  | 'polyphone'
  | 'manual';
export type StoreLicenseKind =
  | 'open-source'
  | 'freeware'
  | 'free'
  | 'restricted'
  | 'unknown';
export type StoreThumbnailKind = 'generated' | 'official' | 'captured' | 'package';
export type StoreLinkStatus = 'ok' | 'broken' | 'unknown';
export type StoreCatalogSource = 'embedded' | 'cache' | 'remote';

/** Catálogo remoto usado para atualizar links e metadados sem nova versão do app. */
export const STORE_CATALOG_URL =
  'https://raw.githubusercontent.com/raphaleandrodasilva-pixel/Preseter/main/store/store-catalog.json';

/** Quanto tempo o catálogo remoto fica válido antes de uma nova checagem automática. */
export const STORE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Intervalo mínimo entre checagens manuais repetidas. */
export const STORE_MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface StoreThumbnail {
  kind: StoreThumbnailKind;
  /** Imagem oficial opcional; quando ausente a UI desenha a miniatura gerada. */
  url?: string;
  attribution?: string;
}

export interface StoreVariant {
  os: StoreOs;
  arch: StoreArch[];
  format: StoreFormat;
  kind: CollectionKind;
  url?: string;
  fileName?: string;
  page?: string;
  approxBytes: number;
  destSubfolder?: string;
  vst3Patterns?: string[];
  soundfontPatterns?: string[];
  dataFolders?: CollectionDataFolder[];
  vst3Bundle?: { source: string; name: string };
  notes?: string;
  /** Versão encontrada no release (pode ser mais nova que `StoreItem.version`). */
  version?: string;
  /** Como o link deve ser atualizado/validado. */
  resolve?: 'github-latest' | 'head';
  /** Curinga do asset procurado no release mais recente do GitHub. */
  assetPattern?: string;
  /** Repositório `owner/name` do GitHub. */
  repository?: string;
  /** Download exige conta no site de origem (Polyphone, por exemplo). */
  requiresAccount?: boolean;
  /** Explica por que o item é manual (login, Cloudflare, link externo…). */
  manualReason?: string;
  linkStatus?: StoreLinkStatus;
  linkCheckedAt?: string;
  linkMessage?: string;
}

export interface StoreItem {
  id: string;
  type: StoreItemType;
  name: string;
  category: string;
  author: string;
  description: string;
  version?: string;
  tier: StoreTier;
  source: StoreSource;
  license: string;
  licenseKind: StoreLicenseKind;
  licenseUrl?: string;
  page?: string;
  tags?: string[];
  /** Faz parte do Kit essencial (os 40 patches da coleção). */
  essential: boolean;
  defaultSelected: boolean;
  thumbnail: StoreThumbnail;
  notes?: string;
  format?: StoreFormat;
  approxBytes?: number;
  variants: StoreVariant[];
}

export interface StoreCatalog {
  version: number;
  updatedAt?: string;
  source?: string;
  items: StoreItem[];
}

/** Item já resolvido para o SO/arquitetura atuais. */
export interface StoreItemView extends StoreItem {
  variant: StoreVariant | null;
  compatible: boolean;
  format: StoreFormat;
  approxBytes: number;
  availablePlatforms: StoreOs[];
  availableFormats: StoreFormat[];
  status: CollectionItemStatusValue;
  filePath?: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
  message?: string;
}

export interface StoreSnapshot {
  catalogVersion: number;
  updatedAt?: string;
  source: StoreCatalogSource;
  lastCheckedAt?: string;
  platform: StoreOs;
  arch: StoreArch;
  items: StoreItemView[];
  installedCount: number;
  missingCount: number;
  totalCount: number;
  installedBytes: number;
  error?: string;
}

export interface StoreUpdateResult {
  ok: boolean;
  updated: boolean;
  skipped?: boolean;
  notModified?: boolean;
  source: StoreCatalogSource;
  checkedAt: string;
  snapshot: StoreSnapshot;
  resolvedLinks?: number;
  brokenLinks?: number;
  error?: string;
}

export interface StoreValidationSuccess {
  ok: true;
  catalog: StoreCatalog;
}

export interface StoreValidationFailure {
  ok: false;
  issues: string[];
}

export type StoreValidationResult = StoreValidationSuccess | StoreValidationFailure;

const STORE_OS: StoreOs[] = ['windows', 'linux', 'mac'];
const STORE_ARCH: StoreArch[] = ['x64', 'arm64'];
const STORE_FORMATS: StoreFormat[] = [
  'VST3',
  'LV2',
  'VST2',
  'CLAP',
  'SFZ',
  'SF2',
  'Instalador',
  'Preset',
];
const STORE_ITEM_TYPES: StoreItemType[] = ['plugin', 'library'];
const STORE_TIERS: StoreTier[] = ['verified', 'indexed'];
const STORE_SOURCES: StoreSource[] = [
  'github',
  'official',
  'archive',
  'musical-artifacts',
  'polyphone',
  'manual',
];
const STORE_LICENSE_KINDS: StoreLicenseKind[] = [
  'open-source',
  'freeware',
  'free',
  'restricted',
  'unknown',
];
const STORE_THUMBNAIL_KINDS: StoreThumbnailKind[] = [
  'generated',
  'official',
  'captured',
  'package',
];
const STORE_KINDS: CollectionKind[] = [
  'vst3-zip',
  'vst3-msi',
  'installer',
  'vst3-exe',
  'soundfont',
  'soundfont-zip',
  'manual',
];

/**
 * Hosts oficiais aceitos no catálogo. Novos links remotos precisam estar nesta
 * lista (ou em um subdomínio dela) para não virarem um download arbitrário.
 */
const STORE_URL_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  's3.amazonaws.com',
  'amazonaws.com',
  'tytel.org',
  'blaukraut.info',
  'ftp.osuosl.org',
  'osuosl.org',
  'archive.org',
  'sfz.tools',
  'setbfree.org',
  'software.opensuse.org',
  'download.opensuse.org',
  'plogue.com',
];

export function storeOsForPlatform(platform: string): StoreOs {
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin' || platform === 'mac') return 'mac';
  return 'windows';
}

export function storeArchForProcess(arch: string): StoreArch {
  return arch === 'arm64' ? 'arm64' : 'x64';
}

export function isAllowedStoreHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return STORE_URL_HOSTS.some(
    (allowed) =>
      normalized === allowed ||
      normalized.endsWith(`.${allowed}`) ||
      ((allowed === 'github.com' || allowed === 'raw.githubusercontent.com') &&
        normalized.endsWith('.githubusercontent.com'))
  );
}

/** URL de download aceita pela Loja: HTTPS e host oficial. */
export function isAllowedStoreUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isAllowedStoreHost(url.hostname);
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * Valida o catálogo antes de usá-lo. O arquivo remoto é tratado como dado
 * externo: somente depois desta validação ele substitui o cache local.
 */
export function validateStoreCatalog(raw: unknown): StoreValidationResult {
  const issues: string[] = [];
  const fail = (path: string, message: string) => {
    if (issues.length < 40) issues.push(`${path}: ${message}`);
  };

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, issues: ['catálogo: JSON inválido'] };
    }
  }
  if (!isRecord(parsed)) return { ok: false, issues: ['catálogo: precisa ser um objeto'] };
  if (
    typeof parsed.version !== 'number' ||
    !Number.isFinite(parsed.version) ||
    parsed.version < 1
  ) {
    fail('version', 'número inteiro maior que zero é obrigatório');
  }
  if (parsed.updatedAt !== undefined && !nonEmptyString(parsed.updatedAt)) {
    fail('updatedAt', 'deve ser uma data ISO');
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    fail('items', 'lista de itens não pode ser vazia');
    return { ok: false, issues };
  }

  const ids = new Set<string>();
  parsed.items.forEach((itemRaw, index) => {
    const path = `items[${index}]`;
    if (!isRecord(itemRaw)) {
      fail(path, 'precisa ser um objeto');
      return;
    }
    const id = itemRaw.id;
    if (!nonEmptyString(id)) fail(`${path}.id`, 'obrigatório');
    else if (ids.has(id)) fail(`${path}.id`, `duplicado (${id})`);
    else ids.add(id);

    for (const field of ['name', 'category', 'author', 'description', 'license']) {
      if (!nonEmptyString(itemRaw[field])) fail(`${path}.${field}`, 'obrigatório');
    }
    if (itemRaw.version !== undefined && !nonEmptyString(itemRaw.version)) {
      fail(`${path}.version`, 'deve ser texto');
    }
    if (!oneOf(itemRaw.type, STORE_ITEM_TYPES)) {
      fail(`${path}.type`, 'use plugin ou library');
    }
    if (!oneOf(itemRaw.tier, STORE_TIERS)) {
      fail(`${path}.tier`, 'use verified ou indexed');
    }
    if (!oneOf(itemRaw.source, STORE_SOURCES)) {
      fail(`${path}.source`, 'use github, official ou manual');
    }
    if (!oneOf(itemRaw.licenseKind, STORE_LICENSE_KINDS)) {
      fail(`${path}.licenseKind`, 'tipo de licença desconhecido');
    }
    if (typeof itemRaw.essential !== 'boolean') fail(`${path}.essential`, 'booleano obrigatório');
    if (typeof itemRaw.defaultSelected !== 'boolean') {
      fail(`${path}.defaultSelected`, 'booleano obrigatório');
    }
    if (itemRaw.licenseUrl !== undefined && !isHttpUrl(String(itemRaw.licenseUrl))) {
      fail(`${path}.licenseUrl`, 'precisa ser http(s)');
    }
    if (itemRaw.page !== undefined && !isHttpUrl(String(itemRaw.page))) {
      fail(`${path}.page`, 'precisa ser http(s)');
    }

    if (!isRecord(itemRaw.thumbnail)) {
      fail(`${path}.thumbnail`, 'objeto obrigatório');
    } else {
      if (!oneOf(itemRaw.thumbnail.kind, STORE_THUMBNAIL_KINDS)) {
        fail(`${path}.thumbnail.kind`, 'tipo de miniatura desconhecido');
      }
      if (itemRaw.thumbnail.url !== undefined && !isHttpUrl(String(itemRaw.thumbnail.url))) {
        fail(`${path}.thumbnail.url`, 'precisa ser http(s)');
      }
    }

    if (!Array.isArray(itemRaw.variants) || itemRaw.variants.length === 0) {
      fail(`${path}.variants`, 'precisa de ao menos uma variante');
      return;
    }
    itemRaw.variants.forEach((variantRaw, variantIndex) => {
      const vpath = `${path}.variants[${variantIndex}]`;
      if (!isRecord(variantRaw)) {
        fail(vpath, 'precisa ser um objeto');
        return;
      }
      if (!oneOf(variantRaw.os, STORE_OS)) fail(`${vpath}.os`, 'SO desconhecido');
      if (
        !Array.isArray(variantRaw.arch) ||
        variantRaw.arch.length === 0 ||
        variantRaw.arch.some((arch) => !oneOf(arch, STORE_ARCH))
      ) {
        fail(`${vpath}.arch`, 'arquiteturas desconhecidas');
      }
      if (!oneOf(variantRaw.format, STORE_FORMATS)) {
        fail(`${vpath}.format`, 'formato desconhecido');
      }
      if (!oneOf(variantRaw.kind, STORE_KINDS)) {
        fail(`${vpath}.kind`, 'tipo de instalação desconhecido');
      }
      if (
        typeof variantRaw.approxBytes !== 'number' ||
        !Number.isFinite(variantRaw.approxBytes) ||
        variantRaw.approxBytes < 0
      ) {
        fail(`${vpath}.approxBytes`, 'precisa ser um número não negativo');
      }
      if (variantRaw.url !== undefined) {
        if (!nonEmptyString(variantRaw.url) || !isAllowedStoreUrl(variantRaw.url)) {
          fail(`${vpath}.url`, 'precisa ser HTTPS de um host oficial');
        }
      }
      if (variantRaw.page !== undefined && !isHttpUrl(String(variantRaw.page))) {
        fail(`${vpath}.page`, 'precisa ser http(s)');
      }
      if (variantRaw.resolve !== undefined && !oneOf(variantRaw.resolve, ['github-latest', 'head'])) {
        fail(`${vpath}.resolve`, 'modo de resolução desconhecido');
      }
      if (variantRaw.requiresAccount !== undefined && typeof variantRaw.requiresAccount !== 'boolean') {
        fail(`${vpath}.requiresAccount`, 'deve ser booleano');
      }
      if (variantRaw.manualReason !== undefined && !nonEmptyString(variantRaw.manualReason)) {
        fail(`${vpath}.manualReason`, 'deve ser texto');
      }
      if (variantRaw.repository !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(String(variantRaw.repository))) {
        fail(`${vpath}.repository`, 'use owner/repositório');
      }
      if (variantRaw.linkStatus !== undefined && !oneOf(variantRaw.linkStatus, ['ok', 'broken', 'unknown'])) {
        fail(`${vpath}.linkStatus`, 'status de link desconhecido');
      }
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, catalog: parsed as unknown as StoreCatalog };
}

/** Escolhe a variante exata para SO + arquitetura. */
export function pickStoreVariant(
  item: StoreItem,
  os: StoreOs,
  arch: StoreArch
): StoreVariant | null {
  const matches = item.variants.filter((variant) => variant.os === os);
  return matches.find((variant) => variant.arch.includes(arch)) ?? null;
}

export function storeItemAvailablePlatforms(item: StoreItem): StoreOs[] {
  return STORE_OS.filter((os) => item.variants.some((variant) => variant.os === os));
}

export function storeItemAvailableFormats(item: StoreItem): StoreFormat[] {
  return STORE_FORMATS.filter((format) =>
    item.variants.some((variant) => variant.format === format)
  );
}

/**
 * Converte a variante resolvida para o formato que o CollectionInstaller já
 * entende. Assim a Loja reutiliza download, extração, cópia de VST3/LV2 e
 * pastas de dados sem duplicar a lógica.
 */
export function storeItemToCollectionItem(
  item: StoreItem,
  variant: StoreVariant
): CollectionItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    group: item.type === 'library' ? 'library' : 'plugin',
    kind: variant.kind,
    url: variant.url,
    fileName: variant.fileName,
    destSubfolder: variant.destSubfolder,
    approxBytes: variant.approxBytes,
    license: item.license,
    licenseUrl: item.licenseUrl,
    page: variant.page ?? item.page,
    defaultSelected: item.defaultSelected,
    vst3Patterns: variant.vst3Patterns,
    soundfontPatterns: variant.soundfontPatterns,
    dataFolders: variant.dataFolders,
    vst3Bundle: variant.vst3Bundle,
    notes: variant.notes ?? item.notes,
  };
}

export interface StoreItemDescription {
  item: StoreItem;
  variant: StoreVariant | null;
  compatible: boolean;
  format: StoreFormat;
  approxBytes: number;
  availablePlatforms: StoreOs[];
  availableFormats: StoreFormat[];
}

/** Metadados de exibição de um item para o sistema atual. */
export function describeStoreItem(
  item: StoreItem,
  os: StoreOs,
  arch: StoreArch
): StoreItemDescription {
  const variant = pickStoreVariant(item, os, arch);
  return {
    item,
    variant,
    compatible: variant !== null,
    format: variant?.format ?? item.format ?? item.variants[0]?.format ?? 'Instalador',
    approxBytes: variant?.approxBytes ?? item.approxBytes ?? 0,
    availablePlatforms: storeItemAvailablePlatforms(item),
    availableFormats: storeItemAvailableFormats(item),
  };
}

/** Formata bytes para os cartões da Loja. */
export function formatStoreBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Converte um padrão simples (`*.vst3`, `Dexed-*-win.zip`) em RegExp. */
export function storeWildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
