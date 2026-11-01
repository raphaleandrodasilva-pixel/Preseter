import rawCatalog from './collection-catalog.json';

export type CollectionGroup = 'plugin' | 'library' | 'manual';
export type CollectionKind =
  | 'vst3-zip'
  | 'vst3-msi'
  | 'vst3-exe'
  | 'soundfont'
  | 'soundfont-zip'
  | 'manual';

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
  notes?: string;
}

export interface CollectionCatalog {
  version: number;
  items: CollectionItem[];
}

export const COLLECTION_CATALOG = rawCatalog as CollectionCatalog;

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
