import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionItemStatus } from '@shared/collection';
import { useAppContext } from '../../context/AppContext';

const groupLabels: Record<string, string> = {
  plugin: 'Plugins (VST3)',
  library: 'Bibliotecas de som',
  manual: 'Instalação manual',
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const statusLabel: Record<CollectionItemStatus['status'], string> = {
  installed: 'instalado',
  missing: 'falta',
  downloading: 'baixando',
  extracting: 'extraindo',
  ready: 'pronto',
  manual: 'manual',
  error: 'erro',
  cancelled: 'cancelado',
  unsupported: 'indisponível',
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
  unsupported: '#FF554D',
};

/** Aba Configurações → Coleção: baixa os plugins e bibliotecas oficiais. */
export const CollectionSettings: React.FC = () => {
  const {
    collectionStatus,
    collectionProgress,
    refreshCollectionStatus,
    downloadCollection,
    cancelCollectionDownload,
    openCollectionFolder,
    openCollectionInstaller,
    generateCollectionConcert,
    openConcertPath,
    preferences,
    updatePreferences,
  } = useAppContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [forceReinstall, setForceReinstall] = useState(false);
  const [soundsFolder, setSoundsFolder] = useState(preferences?.soundsFolder ?? '');
  const [generated, setGenerated] = useState<{ path: string; sets: number; patches: number; skipped: string[]; missing: string[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    void refreshCollectionStatus();
  }, [refreshCollectionStatus]);

  useEffect(() => {
    setSoundsFolder(preferences?.soundsFolder ?? '');
  }, [preferences?.soundsFolder]);

  useEffect(() => {
    if (collectionStatus.length === 0) return;
    setSelected((previous) => {
      if (initialized.current) return previous;
      initialized.current = true;
      const defaults = collectionStatus.filter((item) => item.defaultSelected && item.status === 'missing');
      return new Set(defaults.map((item) => item.id));
    });
  }, [collectionStatus]);

  const grouped = useMemo(() => {
    const map = new Map<string, CollectionItemStatus[]>();
    for (const item of collectionStatus) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [collectionStatus]);

  const selectedItems = collectionStatus.filter((item) => selected.has(item.id));
  const totalBytes = selectedItems.reduce((sum, item) => sum + item.approxBytes, 0);
  const canDownload = selectedItems.length > 0 && !busy;
  const installedCount = collectionStatus.filter((item) => item.status === 'installed' || item.status === 'ready').length;
  const missingCount = collectionStatus.filter((item) => item.status === 'missing').length;
  const overall = collectionProgress?.overall;
  const phaseLabel = overall?.phase === 'downloading'
    ? 'Baixando'
    : overall?.phase === 'extracting'
      ? 'Extraindo'
      : overall?.phase === 'done'
        ? 'Concluído'
        : overall?.phase === 'error'
          ? 'Erro'
          : overall?.phase === 'cancelled'
            ? 'Cancelado'
            : 'Preparando';

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = async () => {
    if (!canDownload) return;
    setBusy(true);
    setNotice(null);
    setGenerated(null);
    try {
      if (soundsFolder.trim() !== (preferences?.soundsFolder ?? '')) {
        await updatePreferences({ soundsFolder: soundsFolder.trim() });
      }
      const result = await downloadCollection(Array.from(selected), forceReinstall);
      if (!result) {
        setNotice('Não foi possível concluir o download.');
        return;
      }
      const { summary } = result;
      if (summary.failed > 0 || summary.cancelled > 0) {
        setNotice(
          `${summary.downloaded} baixado(s), ${summary.skipped} já instalado(s), ` +
          `${summary.failed} com erro, ${summary.cancelled} cancelado(s).`
        );
      } else if (summary.downloaded === 0 && summary.skipped > 0) {
        setNotice('Todos os itens selecionados já estão instalados. Marque “Baixar novamente” para reinstalar.');
      } else if (summary.downloaded === 0) {
        setNotice('Nada foi baixado. Verifique os itens selecionados.');
      } else {
        setNotice(
          `Download concluído: ${summary.downloaded} baixado(s)` +
          (summary.skipped > 0 ? `, ${summary.skipped} já instalado(s).` : '.')
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    await cancelCollectionDownload();
    setNotice('Cancelando…');
  };

  const handleGenerate = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await generateCollectionConcert();
      if (!result) {
        setNotice('Geração cancelada.');
        return;
      }
      setGenerated(result);
      setNotice(`Concert gerado: ${result.sets} sets, ${result.patches} patches.`);
    } finally {
      setBusy(false);
    }
  };

  const progressFor = (id: string) =>
    collectionProgress?.item.id === id ? collectionProgress.item : null;

  return (
    <div className="space-y-4">
      <section className="hw-inset space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="hw-label">Factory 40</h4>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: 'rgba(10,132,255,0.18)', color: '#7FB6FF' }}>
            {window.electronAPI.platform === 'linux'
              ? 'Linux'
              : window.electronAPI.platform === 'darwin'
                ? 'macOS'
                : 'Windows'}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#C6C6CB' }}>
          Baixa os plugins e bibliotecas de fontes oficiais para a Factory 40,
          a coleção de 40 timbres de palco.
          Nada é executado sem aviso: zips são extraídos e instaladores aparecem como “pronto”
          para você abrir.
        </p>
        <div className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: '#3A3A3C', color: '#9A9AA0' }}>
          <strong style={{ color: '#EDEDEF' }}>Licenças:</strong> Sforzando (freeware), FSVR/Surge/Dexed/Helm (GPLv3),
          sfizz (BSD-2), MuseScore_General (MIT), Sonatina (CC Sampling Plus 1.0) e Salamander
          (CC BY 3.0 — atribuição a Alexander Holm). Os arquivos são baixados dos sites oficiais
          e não são redistribuídos pelo Preseter.
        </div>
      </section>

      <section className="hw-inset space-y-2 p-3">
        <label className="block text-xs" style={{ color: '#9A9AA0' }}>
          Pasta das bibliotecas de som
          <div className="mt-1 flex gap-2">
            <input
              className="hw-inset min-w-0 flex-1 px-2 py-2 text-xs text-slate-100"
              value={soundsFolder}
              onChange={(event) => setSoundsFolder(event.target.value)}
              onBlur={() => void updatePreferences({ soundsFolder: soundsFolder.trim() })}
              placeholder="~/PreseterSons"
            />
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px]"
              onClick={() => void updatePreferences({ soundsFolder })}
            >
              Salvar
            </button>
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px]"
              onClick={() => void openCollectionFolder('sounds')}
            >
              Abrir
            </button>
          </div>
        </label>
      </section>

      {[...grouped.entries()].map(([group, items]) => (
        <section key={group} className="hw-inset space-y-2 p-3">
          <h4 className="hw-label">{groupLabels[group] ?? group}</h4>
          <div className="space-y-2">
            {items.map((item) => {
              const progress = progressFor(item.id) ?? item;
              const isManual = item.status === 'manual' || item.kind === 'manual';
              const isBusyItem = progress.status === 'downloading' || progress.status === 'extracting';
              return (
                <div
                  key={item.id}
                  className="rounded-lg border px-2.5 py-2"
                  style={{ borderColor: '#3A3A3C', background: 'rgba(15,17,19,0.5)' }}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      style={{ accentColor: '#FF9F0A' }}
                      aria-label={`Selecionar ${item.name}`}
                      checked={selected.has(item.id)}
                      disabled={isManual || busy}
                      onChange={() => toggle(item.id)}
                      title={isManual ? 'Instalação manual' : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-white">{item.name}</span>
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: statusColor[progress.status] }}>
                          {statusLabel[progress.status]}
                        </span>
                        <span className="text-[10px]" style={{ color: '#8E8E93' }}>{formatBytes(item.approxBytes)}</span>
                        <span className="text-[10px]" style={{ color: '#8E8E93' }}>{item.license}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: '#9A9AA0' }}>
                        {item.description}
                      </p>
                      {progress.message && (
                        <p className="mt-0.5 text-[10px]" style={{ color: '#C6C6CB' }}>{progress.message}</p>
                      )}
                      {isBusyItem && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#242426' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress.percent ?? 15}%`, background: '#0A84FF' }}
                          />
                        </div>
                      )}
                      {progress.filePath && progress.status === 'ready' && (
                        <button
                          type="button"
                          className="mt-1 rounded px-2 py-1 text-[10px] font-semibold"
                          style={{ background: '#FF9F0A', color: '#1A1A1A' }}
                          onClick={() => void openCollectionInstaller(progress.filePath as string)}
                        >
                          Abrir instalador
                        </button>
                      )}
                      {progress.filePath && progress.status === 'installed' && (
                        <p className="mt-0.5 truncate text-[9px]" style={{ color: '#6E6E73' }} title={progress.filePath}>
                          {progress.filePath}
                        </p>
                      )}
                      {isManual && item.page && (
                        <a
                          href={item.page}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[10px] underline"
                          style={{ color: '#7FB6FF' }}
                        >
                          Abrir página oficial
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="hw-inset space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: '#9A9AA0' }}>
            {installedCount} instalado(s) · {missingCount} faltando
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: '#9A9AA0' }}>
            <input
              type="checkbox"
              style={{ accentColor: '#FF9F0A' }}
              checked={forceReinstall}
              disabled={busy}
              onChange={(event) => setForceReinstall(event.target.checked)}
            />
            Baixar novamente os já instalados
          </label>
        </div>

        {busy && (
          <div className="space-y-1" data-testid="collection-overall-progress">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate" style={{ color: '#EDEDEF' }}>
                {phaseLabel}
                {overall ? ` ${overall.current} de ${overall.total}` : ''}
                {collectionProgress?.item?.name ? ` — ${collectionProgress.item.name}` : '…'}
              </span>
              <span className="shrink-0 tabular-nums" style={{ color: '#9AD1FF' }}>
                {overall?.percent !== undefined ? `${overall.percent}%` : '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: '#242426' }}>
              <div
                className={overall?.percent === undefined ? 'h-full animate-pulse rounded-full' : 'h-full rounded-full'}
                style={{
                  width: `${overall?.percent ?? 35}%`,
                  background: '#0A84FF',
                  transition: 'width 150ms ease-out',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px]" style={{ color: '#8E8E93' }}>
              <span>{collectionProgress?.item?.message ?? 'Iniciando…'}</span>
              <span className="tabular-nums">
                {overall ? `${formatBytes(overall.receivedBytes)} / ${formatBytes(overall.totalBytes)}` : ''}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[11px]"
            onClick={() => void refreshCollectionStatus()}
            disabled={busy}
          >
            Verificar o que falta
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            style={{ background: '#0A84FF', color: '#FFFFFF' }}
            onClick={() => void handleDownload()}
            disabled={!canDownload}
            title={selectedItems.length === 0 ? 'Selecione ao menos um item na lista acima.' : undefined}
          >
            {busy
              ? 'Baixando…'
              : `${forceReinstall ? 'Baixar novamente' : 'Baixar selecionados'}${selectedItems.length ? ` (${formatBytes(totalBytes)})` : ''}`}
          </button>
          {busy && (
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px]"
              onClick={() => void handleCancel()}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[11px]"
            onClick={() => void openCollectionFolder('plugins')}
          >
            Abrir pasta de plugins
          </button>
        </div>
        {!busy && missingCount === 0 && collectionStatus.length > 0 && (
          <p className="text-[11px]" style={{ color: '#30D158' }}>
            Tudo já está instalado. Para baixar de novo, marque “Baixar novamente” e selecione os itens.
          </p>
        )}
        {notice && (
          <p className="text-[11px]" style={{ color: '#C6C6CB' }}>{notice}</p>
        )}
        <p className="text-[11px]" style={{ color: '#8E8E93' }}>
          {window.electronAPI.platform === 'linux' ? (
            <>
              Os plugins VST3 vão para <code>~/.vst3</code> e os LV2 para{' '}
              <code>~/.lv2</code>. O sistema também é procurado em{' '}
              <code>/usr/lib/vst3</code> e <code>/usr/lib/lv2</code>.
            </>
          ) : (
            <>
              Os plugins vão para <code>%LOCALAPPDATA%\Programs\Common\VST3</code>{' '}
              (sem administrador) e também são procurados em{' '}
              <code>C:\Program Files\Common Files\VST3</code>.
            </>
          )}{' '}
          Instaladores nativos são baixados e abertos para você concluir.
        </p>
      </section>

      <section className="hw-inset space-y-2 p-3">
        <h4 className="hw-label">Concert da Factory 40</h4>
        <p className="text-[11px] leading-relaxed" style={{ color: '#9A9AA0' }}>
          Depois de instalar, gere o concert com os 40 timbres da Factory 40. O Full Set e o
          concert da coleção já carregam os instrumentos e os programas. Nos patches com Sforzando,
          carregue o SFZ/SF2 uma vez e salve o patch: o estado VST3 fica guardado no patch.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            style={{ background: '#30D158', color: '#0B1A10' }}
            onClick={() => void handleGenerate()}
            disabled={busy}
          >
            Gerar concert da Factory 40
          </button>
          {generated && (
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-[11px]"
              onClick={() => void openConcertPath(generated.path)}
            >
              Abrir concert gerado
            </button>
          )}
        </div>
        {generated && (
          <div className="text-[11px] leading-relaxed" style={{ color: '#C6C6CB' }}>
            <p>{generated.sets} sets · {generated.patches} patches · {generated.path}</p>
            {generated.skipped.length > 0 && (
              <p style={{ color: '#FFB74D' }}>Pulados: {generated.skipped.join('; ')}</p>
            )}
            {generated.missing.length > 0 && (
              <p style={{ color: '#FFB74D' }}>Faltando: {generated.missing.join(', ')}</p>
            )}
          </div>
        )}
      </section>

      {notice && (
        <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#2F5E99', background: '#14243A', color: '#CFE5FF' }}>
          {notice}
        </div>
      )}
    </div>
  );
};
