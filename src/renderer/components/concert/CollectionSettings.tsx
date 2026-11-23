import React, { useCallback, useEffect, useState } from 'react';
import type { CollectionReadiness, WorkstationGenerateResult } from '@shared/collection';
import { useAppContext } from '../../context/AppContext';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Configurações → Factory 40: só o que falta para gerar os 40 timbres. */
export const CollectionSettings: React.FC = () => {
  const {
    collectionProgress,
    downloadCollection,
    cancelCollectionDownload,
    openCollectionFolder,
    generateCollectionConcert,
    openConcertPath,
    preferences,
    updatePreferences,
  } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [soundsFolder, setSoundsFolder] = useState(preferences?.soundsFolder ?? '');
  const [generated, setGenerated] = useState<{
    path: string;
    sets: number;
    patches: number;
    skipped: string[];
    missing: string[];
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<CollectionReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [workstationBusy, setWorkstationBusy] = useState(false);
  const [workstation, setWorkstation] = useState<WorkstationGenerateResult | null>(null);
  const [workstationNotice, setWorkstationNotice] = useState<string | null>(null);

  const checkReadiness = useCallback(async () => {
    setChecking(true);
    try {
      setReadiness(await window.electronAPI.collectionReadiness());
    } catch {
      setReadiness(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkReadiness();
  }, [checkReadiness]);

  useEffect(() => {
    setSoundsFolder(preferences?.soundsFolder ?? '');
  }, [preferences?.soundsFolder]);

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

  const handleDownloadMissing = async () => {
    if (!readiness?.missingIds.length || busy) return;
    setBusy(true);
    setNotice(null);
    setGenerated(null);
    try {
      if (soundsFolder.trim() !== (preferences?.soundsFolder ?? '')) {
        await updatePreferences({ soundsFolder: soundsFolder.trim() });
      }
      const result = await downloadCollection(readiness.missingIds, true);
      if (!result) {
        setNotice('Não foi possível baixar as dependências pendentes.');
        return;
      }
      setNotice(
        result.summary.failed > 0
          ? `${result.summary.downloaded} baixado(s), ${result.summary.failed} com erro.`
          : `${result.summary.downloaded} dependência(s) baixada(s).`
      );
      await checkReadiness();
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

  const handleGenerateWorkstation = async () => {
    setWorkstationBusy(true);
    setWorkstationNotice(null);
    try {
      const result = await window.electronAPI.collectionWorkstationGenerate();
      if (!result) {
        setWorkstationNotice('Geração cancelada.');
        return;
      }
      setWorkstation(result);
      setWorkstationNotice(`${result.patches} de 768 patches gerados em ${result.folder}.`);
    } catch (error) {
      setWorkstationNotice(error instanceof Error ? error.message : 'Falha ao gerar a coleção Workstation.');
    } finally {
      setWorkstationBusy(false);
    }
  };

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
          Mostra apenas o que falta para gerar os 40 timbres. Os instrumentos
          sampleados usam o sampler nativo; plugins externos são opcionais.
        </p>
      </section>

      <section className="hw-inset space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="hw-label">Prontidão da Factory 40</h4>
          <span className="text-[10px]" style={{ color: '#8E8E93' }}>
            {readiness ? `${readiness.ready}/${readiness.total} timbres` : '40 timbres'}
          </span>
        </div>

        {checking ? (
          <p className="text-xs" style={{ color: '#9A9AA0' }}>Verificando dependências…</p>
        ) : readiness?.readyToGenerate ? (
          <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#2F6B43', background: '#12251A', color: '#8FE3A8' }}>
            <strong>Tudo pronto.</strong> Os 40 timbres podem ser gerados.
          </div>
        ) : readiness ? (
          <div className="space-y-2">
            <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#7A5A1E', background: '#2A2110', color: '#FFD60A' }}>
              <strong>{readiness.blocked > 0 ? `${readiness.blocked} timbre(s) bloqueado(s).` : 'Faltam dependências.'}</strong>
              {' '}{readiness.ready} de {readiness.total} timbres prontos.
            </div>
            {readiness.missing.length > 0 && (
              <ul className="space-y-1 text-[11px]" style={{ color: '#C6C6CB' }}>
                {readiness.missing.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span style={{ color: '#FF9F0A' }}>✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: '#9A9AA0' }}>
            Clique em “Verificar novamente” para ver o que falta.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[11px] disabled:opacity-50"
            onClick={() => void checkReadiness()}
            disabled={checking || busy}
          >
            {checking ? 'Verificando…' : 'Verificar novamente'}
          </button>
          {readiness && !readiness.readyToGenerate && readiness.missingIds.length > 0 && (
            <button
              type="button"
              className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              style={{ background: '#FF9F0A', color: '#1A1A1A' }}
              onClick={() => void handleDownloadMissing()}
              disabled={busy}
            >
              Baixar o que falta
            </button>
          )}
          <button
            type="button"
            className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            style={{ background: '#30D158', color: '#0B1A10' }}
            onClick={() => void handleGenerate()}
            disabled={busy || checking || (readiness !== null && !readiness.readyToGenerate)}
            title={readiness && !readiness.readyToGenerate ? 'Resolva as dependências pendentes primeiro.' : undefined}
          >
            Gerar concert da Factory 40
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
        {notice && <p className="text-[11px]" style={{ color: '#C6C6CB' }}>{notice}</p>}
      </section>

      <section className="hw-inset space-y-2 p-3" data-testid="workstation-collection">
        <h4 className="hw-label">Coleção Workstation</h4>
        <p className="text-[11px] leading-relaxed" style={{ color: '#9A9AA0' }}>
          6 bancos (PRE1 a PRE6) com 128 timbres cada, em concerts separados da Factory 40.
          Arquivos existentes não são sobrescritos.
        </p>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: '#0A84FF', color: '#fff' }}
          onClick={() => void handleGenerateWorkstation()}
          disabled={workstationBusy}
        >
          {workstationBusy ? 'Gerando…' : 'Gerar os 6 bancos'}
        </button>
        {workstation && (
          <div className="flex flex-wrap gap-1.5">
            {workstation.banks.map((item) => (
              <button
                key={item.bank}
                type="button"
                className="hw-squarebtn px-2 py-1 text-[11px] disabled:opacity-40"
                disabled={!item.path}
                title={item.path ?? 'Nenhum patch disponível neste banco'}
                onClick={() => { if (item.path) void openConcertPath(item.path); }}
              >
                Abrir {item.bank} ({item.patches})
              </button>
            ))}
          </div>
        )}
        {workstation && workstation.skipped.length > 0 && (
          <p className="text-[11px]" style={{ color: '#FFB74D' }}>
            {workstation.skipped.length} patches pulados. Faltando: {workstation.missing.join(', ')}
          </p>
        )}
        {workstationNotice && <p className="text-[11px]" style={{ color: '#C6C6CB' }}>{workstationNotice}</p>}
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
    </div>
  );
};
