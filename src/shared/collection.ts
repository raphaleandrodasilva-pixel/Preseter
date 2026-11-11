import rawCatalog from './collection-catalog.json';

export type CollectionGroup = 'plugin' | 'library' | 'manual';
export type CollectionKind =
  | 'vst3-zip'
  | 'vst3-msi'
  | 'installer'
  | 'vst3-exe'
  | 'soundfont'
  | 'soundfont-zip'
  | 'manual';

/** Sistemas com catálogo próprio. */
export type CollectionPlatform = 'win32' | 'linux' | 'darwin';

/** Pasta de dados que o pacote copia para o perfil do usuário. */
export interface CollectionDataFolder {
  /** Caminho relativo dentro do ZIP extraído. */
  from: string;
  /** Destino; aceita ~, %APPDATA%, %LOCALAPPDATA%, %XDG_*% e %USERPROFILE%. */
  to: string;
}

/** Ajustes de um item para uma plataforma específica. */
export interface CollectionPlatformSpec {
  kind?: CollectionKind;
  url?: string;
  fileName?: string;
  approxBytes?: number;
  destSubfolder?: string;
  page?: string;
  notes?: string;
  vst3Patterns?: string[];
  soundfontPatterns?: string[];
  dataFolders?: CollectionDataFolder[];
  /** Monta um bundle VST3 a partir de um .so avulso (comum no Linux). */
  vst3Bundle?: { source: string; name: string };
  /** Marca itens que não têm build para a plataforma. */
  unsupported?: boolean;
}

export interface CollectionItem {
  id: string;
  name: string;
  description: string;
  group: CollectionGroup;
  kind: CollectionKind;
  url?: string;
  fileName?: string;
  destSubfolder?: string;
  approxBytes: number;
  license: string;
  licenseUrl?: string;
  page?: string;
  defaultSelected: boolean;
  vst3Patterns?: string[];
  soundfontPatterns?: string[];
  /** Pastas extras copiadas do ZIP para o perfil do usuário. */
  dataFolders?: CollectionDataFolder[];
  /** Monta um bundle VST3 a partir de um .so avulso (comum no Linux). */
  vst3Bundle?: { source: string; name: string };
  /** Ajustes por plataforma; o restante é comum. */
  platforms?: Partial<Record<CollectionPlatform, CollectionPlatformSpec>>;
  /** Preenchido pelo resolvedor quando não há build para a plataforma. */
  unsupported?: boolean;
  notes?: string;
}

export interface CollectionCatalog {
  version: number;
  items: CollectionItem[];
}

export const COLLECTION_CATALOG = rawCatalog as CollectionCatalog;

/**
 * Resolve os campos específicos da plataforma. Itens que declaram `platforms`
 * mas não têm entrada para o sistema atual são marcados como indisponíveis.
 */
export function resolveCollectionItem(
  item: CollectionItem,
  platform: CollectionPlatform
): CollectionItem {
  if (!item.platforms) return item;
  const spec = item.platforms[platform];
  const { platforms, ...base } = item;
  // Os campos do topo são o padrão Windows. Itens sem entrada win32 usam esse
  // padrão somente quando realmente têm um download/instalador de Windows.
  if (!spec && platform === 'win32' && (item.url || item.kind !== 'manual')) {
    return item;
  }
  if (!spec || spec.unsupported) {
    return {
      ...base,
      kind: 'manual',
      url: undefined,
      fileName: undefined,
      unsupported: true,
      platforms,
      notes: spec?.notes ?? item.notes ?? `Sem versão oficial para ${platform}.`,
    };
  }
  return {
    ...base,
    ...spec,
    platforms,
    unsupported: false,
  };
}

/** Itens visíveis no sistema atual, já com os links e caminhos resolvidos. */
export function resolveCollectionItems(
  items: CollectionItem[],
  platform: CollectionPlatform
): CollectionItem[] {
  return items
    .map((item) => resolveCollectionItem(item, platform))
    .filter((item) => !item.unsupported);
}

export type CollectionItemStatusValue =
  | 'installed'
  | 'missing'
  | 'downloading'
  | 'extracting'
  | 'ready'
  | 'manual'
  | 'error'
  | 'cancelled'
  | 'unsupported';

export interface CollectionItemStatus {
  id: string;
  name: string;
  description: string;
  group: CollectionGroup;
  kind: CollectionKind;
  approxBytes: number;
  license: string;
  licenseUrl?: string;
  page?: string;
  notes?: string;
  defaultSelected: boolean;
  status: CollectionItemStatusValue;
  /** Caminho encontrado/instalado (plugin, soundfont ou instalador). */
  filePath?: string;
  /** Progresso do download atual. */
  receivedBytes?: number;
  totalBytes?: number;
  /** Percentual 0..100 quando há progresso. */
  percent?: number;
  message?: string;
}

export interface CollectionProgress {
  item: CollectionItemStatus;
  /** true quando o lote terminou (sucesso ou erro). */
  done?: boolean;
  /** Progresso do lote inteiro (itens e bytes). */
  overall?: CollectionOverallProgress;
}

/** Progresso agregado do lote de download da coleção. */
export interface CollectionOverallProgress {
  /** Item atual, começando em 1. */
  current: number;
  /** Total de itens selecionados. */
  total: number;
  /** Itens já concluídos (baixados, pulados ou com erro). */
  completed: number;
  /** 0..100; ausente quando o tamanho total é desconhecido. */
  percent?: number;
  receivedBytes: number;
  totalBytes: number;
  /** Fase do item atual. */
  phase: 'preparing' | 'downloading' | 'extracting' | 'done' | 'error' | 'cancelled';
}

/** Resumo de um lote de download da coleção. */
export interface CollectionDownloadSummary {
  total: number;
  downloaded: number;
  installed: number;
  skipped: number;
  failed: number;
  cancelled: number;
  manual: number;
}

/** Resultado do download com a lista completa de status (inclui erros). */
export interface CollectionDownloadResult {
  ok: boolean;
  statuses: CollectionItemStatus[];
  summary: CollectionDownloadSummary;
}

export interface CollectionGenerateResult {
  path: string;
  sets: number;
  patches: number;
  skipped: string[];
  missing: string[];
}
