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
}

export interface CollectionGenerateResult {
  path: string;
  sets: number;
  patches: number;
  skipped: string[];
  missing: string[];
}
