import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CollectionItemStatus, CollectionProgress } from '@shared/collection';
import {
  formatStoreBytes,
  type StoreFormat,
  type StoreItemView,
  type StoreLicenseKind,
  type StoreSnapshot,
} from '@shared/store';
import { CollectionSettings } from './CollectionSettings';

type StoreMode = 'store' | 'essential';
type TypeFilter = 'all' | 'plugin' | 'library';

const statusLabel: Record<CollectionItemStatus['status'], string> = {
  installed: 'Instalado',
  missing: 'Disponível',
  downloading: 'Baixando',
  extracting: 'Extraindo',
  ready: 'Instalador pronto',
  manual: 'Instalação manual',
  error: 'Erro',
  cancelled: 'Cancelado',
  unsupported: 'Outro sistema',
};

const statusColor: Record<CollectionItemStatus['status'], string> = {
  installed: '#30D158',
  missing: '#9A9AA0',
  downloading: '#0A84FF',
  extracting: '#FF9F0A',
  ready: '#FF9F0A',
  manual: '#C6C6CB',
  error: '#FF554D',
  cancelled: '#FFB74D',
  unsupported: '#6E6E73',
};

const licenseLabels: Record<StoreLicenseKind, string> = {
  'open-source': 'Código aberto',
  freeware: 'Freeware',
  free: 'Gratuito',
  restricted: 'Uso restrito',
};

const platformLabels: Record<string, string> = {
  windows: 'Windows',
  linux: 'Linux',
  mac: 'macOS',
};

function initials(name: string): string {
  const cleaned = name.replace(/\b\d+(?:[._-]\d+)*\b/g, '').trim();
  const words = cleaned.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

const CATEGORY_PALETTES: Array<[string, string]> = [
  ['#1D3B6E', '#0A84FF'],
  ['#3B245F', '#9B5CFF'],
  ['#5A3512', '#FF9F0A'],
  ['#154734', '#30D158'],
  ['#4A1D2A', '#FF6482'],
  ['#1F3A3D', '#64D2FF'],
  ['#2C2C34', '#8E8E93'],
];

function paletteFor(category: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < category.length; index += 1) {
    hash = (hash * 31 + category.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_PALETTES[hash % CATEGORY_PALETTES.length];
}

interface StoreThumbnailProps {
  item: StoreItemView;
  large?: boolean;
}

const StoreThumbnail: React.FC<StoreThumbnailProps> = ({ item, large = false }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [from, to] = paletteFor(item.category);
  const size = large ? 'h-36 w-full' : 'h-11 w-11';
  const image = item.thumbnail.kind !== 'generated' ? item.thumbnail.url : undefined;

  if (image && !imageFailed) {
    return (
      <div className={`${size} overflow-hidden rounded-lg border`} style={{ borderColor: '#3A3A3C' }}>
        <img
          src={image}
          alt={`Miniatura de ${item.name}`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${size} relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border`}
      style={{
        borderColor: 'rgba(255,255,255,0.12)',
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-label={`Miniatura gerada de ${item.name}`}
    >
      <span
        className="font-bold tracking-wide text-white/90"
        style={{ fontSize: large ? 30 : 13, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        {initials(item.name)}
      </span>
      <span
        className="absolute bottom-1 right-1 rounded px-1 py-0.5 font-semibold text-white"
        style={{
          background: 'rgba(0,0,0,0.38)',
          fontSize: large ? 10 : 7,
          letterSpacing: '0.04em',
        }}
      >
        {item.format}
      </span>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-md px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.035)' }}>
    <div className="text-[9px] uppercase tracking-wide" style={{ color: '#6E6E73' }}>
      {label}
    </div>
    <div className="mt-0.5 break-words text-[11px]" style={{ color: '#E5E5EA' }}>
      {value}
    </div>
  </div>
);

/** Substitui a antiga aba Coleção: Loja de plugins/samples + Kit essencial. */
export const StoreSettings: React.FC = () => {
  const [mode, setMode] = useState<StoreMode>('store');
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [category, setCategory] = useState('Todas');
  const [format, setFormat] = useState<'all' | StoreFormat>('all');
  const [license, setLicense] = useState<'all' | StoreLicenseKind>('all');
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [forceReinstall, setForceReinstall] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectionProgress | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI.storeList();
      setSnapshot(next);
      setError(next.error ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a Loja.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const offProgress = window.electronAPI.onStoreProgress((next) => {
      setProgress(next);
      setSnapshot((previous) => {
        if (!previous) return previous;
        const item = next.item;
        return {
          ...previous,
          items: previous.items.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: item.status,
                  filePath: item.filePath ?? entry.filePath,
                  receivedBytes: item.receivedBytes,
                  totalBytes: item.totalBytes,
                  percent: item.percent,
                  message: item.message,
                }
              : entry
          ),
        };
      });
    });
    const offUpdated = window.electronAPI.onStoreCatalogUpdated((result) => {
      if (result.snapshot) setSnapshot(result.snapshot);
    });
    return () => {
      if (typeof offProgress === 'function') offProgress();
      if (typeof offUpdated === 'function') offUpdated();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    setSelectedId((previous) => {
      if (previous && snapshot.items.some((item) => item.id === previous)) return previous;
      return (
        snapshot.items.find((item) => item.compatible)?.id ??
        snapshot.items[0]?.id ??
        null
      );
    });
  }, [snapshot]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of snapshot?.items ?? []) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [snapshot]);

  const formats = useMemo(() => {
    const values = new Set<StoreFormat>();
    for (const item of snapshot?.items ?? []) {
      for (const value of item.availableFormats) values.add(value);
    }
    return Array.from(values).sort();
  }, [snapshot]);

  const licenses = useMemo(() => {
    const values = new Set<StoreLicenseKind>();
    for (const item of snapshot?.items ?? []) values.add(item.licenseKind);
    return Array.from(values).sort();
  }, [snapshot]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (snapshot?.items ?? []).filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (category !== 'Todas' && item.category !== category) return false;
      if (format !== 'all' && !item.availableFormats.includes(format)) return false;
      if (license !== 'all' && item.licenseKind !== license) return false;
      if (!showIncompatible && !item.compatible) return false;
      if (needle) {
        const haystack = [
          item.name,
          item.author,
          item.category,
          item.description,
          ...(item.tags ?? []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [snapshot, typeFilter, category, format, license, showIncompatible, query]);

  const detail =
    filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setCategory('Todas');
    setFormat('all');
    setLicense('all');
    setShowIncompatible(false);
  };

  const applyStatus = useCallback((status: CollectionItemStatus) => {
    setSnapshot((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        items: previous.items.map((item) =>
          item.id === status.id
            ? {
                ...item,
                status: status.status,
                filePath: status.filePath,
                receivedBytes: status.receivedBytes,
                totalBytes: status.totalBytes,
                percent: status.percent,
                message: status.message,
              }
            : item
        ),
      };
    });
  }, []);

  const handleDownload = async (item: StoreItemView) => {
    if (!item.compatible || item.variant?.kind === 'manual' || busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const force =
        forceReinstall || item.status === 'installed' || item.status === 'ready';
      const result = await window.electronAPI.storeDownload([item.id], force);
      const status = result.statuses.find((entry) => entry.id === item.id);
      if (status) applyStatus(status);
      if (result.summary.failed > 0) {
        setNotice('O download falhou. Veja a mensagem no cartão do item.');
      } else if (result.summary.cancelled > 0) {
        setNotice('Download cancelado.');
      } else if (result.summary.downloaded === 0 && result.summary.skipped > 0) {
        setNotice('O item já está instalado. Marque “Baixar novamente” para reinstalar.');
      } else {
        setNotice('Download concluído.');
      }
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível baixar o item.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI.storeCancel();
    setNotice('Cancelando…');
  };

  const handleUpdateCatalog = async () => {
    setUpdating(true);
    setNotice(null);
    setError(null);
    try {
      const result = await window.electronAPI.storeCheckUpdates(true);
      if (result.snapshot) setSnapshot(result.snapshot);
      if (!result.ok) {
        setNotice(`Não foi possível atualizar: ${result.error ?? 'erro desconhecido'}`);
      } else if (result.notModified || result.skipped) {
        setNotice('O catálogo já está atualizado.');
      } else {
        setNotice(
          result.updated
            ? `Catálogo atualizado${result.brokenLinks ? ` — ${result.brokenLinks} link(s) indisponível(is)` : ''}.`
            : 'Nenhuma novidade no catálogo.'
        );
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao atualizar o catálogo.');
    } finally {
      setUpdating(false);
    }
  };

  const openPage = async (item: StoreItemView) => {
    const page = item.variant?.page ?? item.page;
    if (page) await window.electronAPI.storeOpenUrl(page);
  };

  const openFolder = async (item: StoreItemView) => {
    await window.electronAPI.storeOpenFolder(item.type === 'library' ? 'sounds' : 'plugins');
  };

  const installedCount = snapshot?.installedCount ?? 0;
  const missingCount = snapshot?.missingCount ?? 0;
  const totalCount = snapshot?.totalCount ?? 0;
  const sourceLabel =
    snapshot?.source === 'remote'
      ? 'Remoto'
      : snapshot?.source === 'cache'
        ? 'Cache local'
        : 'Embutido';

  return (
    <div className="space-y-4">
      <section className="hw-inset space-y-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="hw-label">Loja</h4>
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}
              >
                {sourceLabel}
              </span>
              {snapshot && (
                <span className="text-[10px]" style={{ color: '#6E6E73' }}>
                  {snapshot.platform === 'windows' ? 'Windows' : snapshot.platform === 'linux' ? 'Linux' : 'macOS'}
                  {' '}· {snapshot.arch}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-xl text-xs leading-relaxed" style={{ color: '#C6C6CB' }}>
              Plugins e samples oficiais para o Preseter. O catálogo se atualiza
              sozinho pelo GitHub; os links são validados antes de aparecer aqui.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px] disabled:opacity-50"
              onClick={() => void handleUpdateCatalog()}
              disabled={updating}
            >
              {updating ? 'Atualizando…' : 'Atualizar catálogo'}
            </button>
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px]"
              onClick={() => void window.electronAPI.storeOpenFolder('plugins')}
            >
              Abrir pasta
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: '#151517' }}>
            <button
              type="button"
              className="rounded-md px-3 py-1 text-[11px] font-semibold"
              style={mode === 'store'
                ? { background: '#0A84FF', color: '#FFFFFF' }
                : { color: '#9A9AA0' }}
              onClick={() => setMode('store')}
              aria-pressed={mode === 'store'}
            >
              Loja
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1 text-[11px] font-semibold"
              style={mode === 'essential'
                ? { background: '#FF9F0A', color: '#1A1A1A' }
                : { color: '#9A9AA0' }}
              onClick={() => setMode('essential')}
              aria-pressed={mode === 'essential'}
            >
              Kit essencial
            </button>
          </div>
          <span className="text-[10px]" style={{ color: '#6E6E73' }}>
            {snapshot?.lastCheckedAt
              ? `Última checagem: ${new Date(snapshot.lastCheckedAt).toLocaleString()}`
              : 'Catálogo embutido; atualização automática em segundo plano.'}
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-100">
            {error}
          </div>
        )}
      </section>

      {mode === 'essential' ? (
        <div className="space-y-3">
          <section className="hw-inset space-y-2 p-3">
            <h4 className="hw-label">Kit essencial · 40 patches</h4>
            <p className="text-[11px] leading-relaxed" style={{ color: '#9A9AA0' }}>
              Os mesmos instrumentos da coleção, com download em lote e o gerador
              do concert de 40 patches. Use a Loja para descobrir e instalar itens
              individuais; use o Kit essencial para montar o concert completo.
            </p>
          </section>
          <CollectionSettings />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_310px]">
          <aside className="hw-inset space-y-3 p-3">
            <label className="block text-[10px]" style={{ color: '#9A9AA0' }}>
              Buscar
              <input
                className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-slate-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, autor, tag…"
                aria-label="Buscar na loja"
              />
            </label>

            <div>
              <div className="hw-label mb-1.5">Tipo</div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['all', 'Todos'],
                    ['plugin', 'Plugins'],
                    ['library', 'Samples'],
                  ] as Array<[TypeFilter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="rounded px-2 py-1 text-[10px]"
                    style={typeFilter === value
                      ? { background: 'rgba(10,132,255,0.2)', color: '#7FB6FF', border: '1px solid #0A84FF' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#9A9AA0', border: '1px solid #3A3A3C' }}
                    onClick={() => setTypeFilter(value)}
                    aria-pressed={typeFilter === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="hw-label mb-1.5">Categoria</div>
              <div className="max-h-44 space-y-0.5 overflow-y-auto pr-1">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[10px]"
                  style={category === 'Todas' ? { background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' } : { color: '#9A9AA0' }}
                  onClick={() => setCategory('Todas')}
                >
                  <span>Todas</span>
                  <span>{snapshot?.items.length ?? 0}</span>
                </button>
                {categories.map(([value, count]) => (
                  <button
                    key={value}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[10px]"
                    style={category === value ? { background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' } : { color: '#9A9AA0' }}
                    onClick={() => setCategory(value)}
                  >
                    <span className="truncate">{value}</span>
                    <span className="shrink-0">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-[10px]" style={{ color: '#9A9AA0' }}>
              Formato
              <select
                className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-slate-100"
                value={format}
                onChange={(event) => setFormat(event.target.value as 'all' | StoreFormat)}
                aria-label="Filtrar por formato"
              >
                <option value="all">Todos</option>
                {formats.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="block text-[10px]" style={{ color: '#9A9AA0' }}>
              Licença
              <select
                className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-slate-100"
                value={license}
                onChange={(event) => setLicense(event.target.value as 'all' | StoreLicenseKind)}
                aria-label="Filtrar por licença"
              >
                <option value="all">Todas</option>
                {licenses.map((value) => (
                  <option key={value} value={value}>{licenseLabels[value]}</option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-2 text-[10px]" style={{ color: '#9A9AA0' }}>
              <input
                type="checkbox"
                className="mt-0.5"
                style={{ accentColor: '#0A84FF' }}
                checked={showIncompatible}
                onChange={(event) => setShowIncompatible(event.target.checked)}
              />
              Mostrar itens de outros sistemas
            </label>

            <button
              type="button"
              className="hw-squarebtn w-full px-2 py-1.5 text-[10px]"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </aside>

          <section className="hw-inset flex min-h-[360px] min-w-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: '#2C2C2E' }}>
              <span className="text-[11px] font-semibold" style={{ color: '#EDEDEF' }}>
                {filtered.length} de {snapshot?.items.length ?? 0} itens
              </span>
              <span className="text-[10px]" style={{ color: '#6E6E73' }}>
                {installedCount} instalado(s)
              </span>
            </div>
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-2">
              {!snapshot && (
                <p className="p-3 text-[11px]" style={{ color: '#9A9AA0' }}>Carregando catálogo…</p>
              )}
              {snapshot && filtered.length === 0 && (
                <p className="p-3 text-[11px]" style={{ color: '#9A9AA0' }}>
                  Nenhum item combina com os filtros.
                </p>
              )}
              {filtered.map((item) => {
                const active = detail?.id === item.id;
                const downloading =
                  item.status === 'downloading' || item.status === 'extracting';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors"
                    style={{
                      borderColor: active ? '#0A84FF' : '#3A3A3C',
                      background: active ? 'rgba(10,132,255,0.1)' : 'rgba(15,17,19,0.45)',
                      opacity: item.compatible ? 1 : 0.6,
                    }}
                    aria-pressed={active}
                  >
                    <StoreThumbnail item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-semibold text-white">{item.name}</span>
                        {item.tier === 'verified' && (
                          <span title="Fonte oficial verificada" style={{ color: '#30D158', fontSize: 9 }}>✓</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px]" style={{ color: '#8E8E93' }}>
                        {item.author} · {item.category}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[9px]" style={{ color: '#6E6E73' }}>
                        <span>{item.format}</span>
                        <span>·</span>
                        <span>{formatStoreBytes(item.approxBytes)}</span>
                        <span>·</span>
                        <span style={{ color: item.compatible ? statusColor[item.status] : '#6E6E73' }}>
                          {item.compatible ? statusLabel[item.status] : 'Outro sistema'}
                        </span>
                      </span>
                      {downloading && (
                        <span className="mt-1 block h-1 overflow-hidden rounded-full" style={{ background: '#242426' }}>
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${item.percent ?? 20}%`, background: '#0A84FF' }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="hw-inset min-w-0 space-y-3 p-3">
            {!detail ? (
              <p className="text-[11px]" style={{ color: '#9A9AA0' }}>
                Selecione um item para ver detalhes, licença e download.
              </p>
            ) : (
              <>
                <StoreThumbnail item={detail} large />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{detail.name}</h4>
                    <span
                      className="rounded px-1.5 py-0.5 text-[8px] font-semibold"
                      style={detail.tier === 'verified'
                        ? { background: 'rgba(48,209,88,0.16)', color: '#30D158' }
                        : { background: 'rgba(142,142,147,0.16)', color: '#C6C6CB' }}
                    >
                      {detail.tier === 'verified' ? 'Verificado' : 'Indexado'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px]" style={{ color: '#8E8E93' }}>
                    {detail.author} · {detail.category}
                  </p>
                </div>

                <p className="text-[11px] leading-relaxed" style={{ color: '#C6C6CB' }}>
                  {detail.description}
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  <DetailRow label="Versão" value={detail.variant?.version ?? detail.version ?? '—'} />
                  <DetailRow label="Formato" value={detail.format} />
                  <DetailRow label="Tamanho" value={formatStoreBytes(detail.approxBytes)} />
                  <DetailRow label="Licença" value={detail.license} />
                  <DetailRow
                    label="Sistemas"
                    value={detail.availablePlatforms.map((value) => platformLabels[value] ?? value).join(', ') || '—'}
                  />
                  <DetailRow
                    label="Arquitetura"
                    value={detail.variant?.arch.join(', ') ?? '—'}
                  />
                </div>

                {detail.tags && detail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {detail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded px-1.5 py-0.5 text-[9px]"
                        style={{ background: 'rgba(255,255,255,0.06)', color: '#9A9AA0' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {detail.notes && (
                  <div className="rounded-md border px-2.5 py-2 text-[10px] leading-relaxed" style={{ borderColor: '#3A3A3C', color: '#9A9AA0' }}>
                    <strong style={{ color: '#C6C6CB' }}>Como usar: </strong>
                    {detail.notes}
                  </div>
                )}

                {detail.variant?.linkStatus === 'broken' && (
                  <div className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100">
                    O link direto está indisponível. Abra a página do autor para baixar
                    a versão atual.
                  </div>
                )}

                {detail.message && (
                  <p className="text-[10px]" style={{ color: statusColor[detail.status] }}>
                    {detail.message}
                  </p>
                )}

                {(detail.status === 'downloading' || detail.status === 'extracting') && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]" style={{ color: '#9A9AA0' }}>
                      <span>{statusLabel[detail.status]}</span>
                      <span>{detail.percent !== undefined ? `${detail.percent}%` : '…'}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: '#242426' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${detail.percent ?? 20}%`, background: '#0A84FF' }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {detail.compatible && detail.variant?.kind !== 'manual' && (
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                      style={{ background: '#0A84FF', color: '#FFFFFF' }}
                      onClick={() => void handleDownload(detail)}
                      disabled={busy || detail.variant?.linkStatus === 'broken'}
                    >
                      {busy && progress?.item.id === detail.id
                        ? 'Baixando…'
                        : detail.status === 'installed' || detail.status === 'ready'
                          ? 'Baixar novamente'
                          : 'Baixar e instalar'}
                    </button>
                  )}
                  {busy && progress?.item.id === detail.id && (
                    <button
                      type="button"
                      className="hw-squarebtn w-full px-3 py-1.5 text-[10px]"
                      onClick={() => void handleCancel()}
                    >
                      Cancelar download
                    </button>
                  )}
                  {detail.status === 'ready' && detail.filePath && (
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-[11px] font-semibold"
                      style={{ background: '#FF9F0A', color: '#1A1A1A' }}
                      onClick={() => void window.electronAPI.storeOpenInstaller(detail.filePath as string)}
                    >
                      Abrir instalador
                    </button>
                  )}
                  {detail.status === 'installed' && (
                    <button
                      type="button"
                      className="hw-squarebtn w-full px-3 py-1.5 text-[10px]"
                      onClick={() => void openFolder(detail)}
                    >
                      Mostrar na pasta
                    </button>
                  )}
                  {(detail.variant?.page ?? detail.page) && (
                    <button
                      type="button"
                      className="hw-squarebtn w-full px-3 py-1.5 text-[10px]"
                      onClick={() => void openPage(detail)}
                    >
                      Página do autor
                    </button>
                  )}
                  {detail.licenseUrl && (
                    <button
                      type="button"
                      className="w-full text-left text-[9px] underline"
                      style={{ color: '#7FB6FF' }}
                      onClick={() => void window.electronAPI.storeOpenUrl(detail.licenseUrl as string)}
                    >
                      Licença: {detail.license}
                    </button>
                  )}
                </div>

                {detail.filePath && (
                  <p className="break-all text-[9px]" style={{ color: '#6E6E73' }} title={detail.filePath}>
                    {detail.filePath}
                  </p>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-[10px]" style={{ color: '#9A9AA0' }}>
                  <input
                    type="checkbox"
                    style={{ accentColor: '#0A84FF' }}
                    checked={forceReinstall}
                    onChange={(event) => setForceReinstall(event.target.checked)}
                  />
                  Baixar novamente se já estiver instalado
                </label>
              </>
            )}
          </aside>
        </div>
      )}

      {notice && (
        <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#2F5E99', background: '#14243A', color: '#CFE5FF' }}>
          {notice}
        </div>
      )}

      <section className="hw-inset flex flex-wrap items-center justify-between gap-2 p-3 text-[10px]" style={{ color: '#9A9AA0' }}>
        <span>
          {installedCount} instalado(s) · {missingCount} disponível(is) · {totalCount} compatível(is)
        </span>
        <span>
          Espaço estimado instalado: <strong style={{ color: '#C6C6CB' }}>{formatStoreBytes(snapshot?.installedBytes ?? 0)}</strong>
          {' '}· links oficiais, nada é redistribuído pelo Preseter.
        </span>
      </section>
    </div>
  );
};
