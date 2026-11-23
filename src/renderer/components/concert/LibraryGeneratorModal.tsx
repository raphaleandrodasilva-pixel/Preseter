import React, { useCallback, useEffect, useState } from 'react';
import {
  EXTERNAL_LIBRARY_SOURCE,
  type LibraryGenerateResult,
  type LibraryInspection,
  type LibrarySummary,
} from '@shared/library/format';
import { useAppContext } from '../../context/AppContext';

const messageOf = (error: unknown, fallback: string): string => {
  const text = error instanceof Error ? error.message : fallback;
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
};

/** Arquivo → Gerar Biblioteca…: transforma um arquivo de instruções em concerts. */
export const LibraryGeneratorModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { downloadCollection, collectionProgress, openConcertPath } = useAppContext();
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [source, setSource] = useState('');
  const [inspection, setInspection] = useState<LibraryInspection | null>(null);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState<'inspect' | 'download' | 'generate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LibraryGenerateResult | null>(null);

  const inspect = useCallback(async (next: string) => {
    setSource(next);
    setResult(null);
    setError(null);
    setInspection(null);
    if (!next) return;
    setBusy('inspect');
    try {
      setInspection(await window.electronAPI.libraryInspect(next));
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível ler a biblioteca.'));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void window.electronAPI.libraryList()
      .then(({ libraries: list, defaultFolder }) => {
        if (!active) return;
        setLibraries(list);
        setFolder(defaultFolder);
        const first = list.find((item) => !item.error);
        if (first) void inspect(first.id);
      })
      .catch((failure: unknown) => {
        if (active) setError(messageOf(failure, 'Não foi possível listar as bibliotecas.'));
      });
    return () => {
      active = false;
    };
  }, [inspect]);

  const pickFile = async () => {
    setError(null);
    try {
      const picked = await window.electronAPI.libraryPickFile();
      if (!picked) return;
      setResult(null);
      setSource(EXTERNAL_LIBRARY_SOURCE);
      setInspection(picked);
    } catch (failure) {
      setSource(EXTERNAL_LIBRARY_SOURCE);
      setInspection(null);
      setError(messageOf(failure, 'Não foi possível ler o arquivo.'));
    }
  };

  const pickFolder = async () => {
    const picked = await window.electronAPI.libraryPickFolder(folder);
    if (picked) setFolder(picked);
  };

  const downloadMissing = async () => {
    if (!inspection) return;
    setBusy('download');
    setError(null);
    try {
      const downloaded = await downloadCollection(inspection.missingIds);
      if (!downloaded?.ok) setError('Alguns itens não foram baixados.');
      setInspection(await window.electronAPI.libraryInspect(source));
    } catch (failure) {
      setError(messageOf(failure, 'Falha ao baixar o que falta.'));
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('generate');
    setError(null);
    setResult(null);
    try {
      setResult(await window.electronAPI.libraryGenerate(source, folder));
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível gerar a biblioteca.'));
    } finally {
      setBusy(null);
    }
  };

  const openGenerated = async (filePath: string) => {
    const opened = await openConcertPath(filePath);
    if (opened) onClose();
  };

  const canGenerate = !busy && !!inspection && inspection.ready > 0 && !!folder;
  const partial = inspection !== null && inspection.ready < inspection.total;
  const setsTotal = inspection?.concerts.reduce((sum, concert) => sum + concert.sets, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Gerar Biblioteca"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div className="hw-panel flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pt-4">
          <div className="hw-label">Arquivo</div>
          <div className="text-sm font-semibold" style={{ color: '#EDEDEF' }}>Gerar Biblioteca</div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-xs" style={{ color: '#9A9AA0' }}>
            Biblioteca
            <div className="mt-1 flex gap-2">
              <select
                aria-label="Biblioteca"
                value={source}
                disabled={!!busy}
                onChange={(event) => void inspect(event.target.value)}
                className="hw-inset min-w-0 flex-1 px-2 py-2 text-xs text-slate-100"
              >
                {libraries.map((item) => (
                  <option key={item.id} value={item.id} disabled={!!item.error}>
                    {item.name}{item.error ? ' (inválida)' : ` · ${item.patches} timbres`}
                  </option>
                ))}
                {source === EXTERNAL_LIBRARY_SOURCE && (
                  <option value={EXTERNAL_LIBRARY_SOURCE}>{inspection?.name ?? 'Arquivo escolhido'}</option>
                )}
              </select>
              <button type="button" className="hw-squarebtn shrink-0 px-3 py-1.5 text-[11px]" disabled={!!busy} onClick={() => void pickFile()}>
                Escolher arquivo…
              </button>
            </div>
          </label>

          {busy === 'inspect' && <p className="text-[11px]" style={{ color: '#C6C6CB' }}>Verificando a biblioteca…</p>}

          {inspection && (
            <section className="hw-inset space-y-2 p-3 text-[11px]" style={{ color: '#C6C6CB' }}>
              {inspection.description && <p>{inspection.description}</p>}
              <p className="font-semibold" style={{ color: '#EDEDEF' }}>
                {inspection.concerts.length} {inspection.concerts.length === 1 ? 'concert' : 'concerts'} · {setsTotal} sets · {inspection.total} timbres
              </p>
              {inspection.missing.length === 0 ? (
                <p style={{ color: '#30D158' }}>✓ Tudo pronto para gerar.</p>
              ) : (
                <div className="space-y-1">
                  <p style={{ color: '#FFB74D' }}>
                    Faltando: {inspection.missing.join(', ')}
                  </p>
                  {partial && (
                    <p style={{ color: '#FFB74D' }}>
                      Sem isso, {inspection.total - inspection.ready} timbres serão pulados.
                    </p>
                  )}
                  {inspection.missingIds.length > 0 && (
                    <button type="button" className="hw-squarebtn px-3 py-1 text-[11px]" disabled={!!busy} onClick={() => void downloadMissing()}>
                      {busy === 'download' ? 'Baixando…' : 'Baixar o que falta'}
                    </button>
                  )}
                  {busy === 'download' && collectionProgress?.item?.name && <p>{collectionProgress.item.name}</p>}
                </div>
              )}
            </section>
          )}

          <label className="block text-xs" style={{ color: '#9A9AA0' }}>
            Salvar em
            <div className="mt-1 flex gap-2">
              <input aria-label="Pasta de destino" readOnly value={folder} className="hw-inset min-w-0 flex-1 px-2 py-2 text-xs text-slate-100" />
              <button type="button" className="hw-squarebtn shrink-0 px-3 py-1.5 text-[11px]" disabled={!!busy} onClick={() => void pickFolder()}>
                Trocar…
              </button>
            </div>
          </label>
          <p className="text-[10px]" style={{ color: '#8E8E93' }}>Arquivos existentes não são sobrescritos.</p>

          {error && <p role="alert" className="whitespace-pre-wrap text-[11px]" style={{ color: '#FF6B6B' }}>{error}</p>}

          {result && (
            <section className="hw-inset space-y-2 p-3 text-[11px]" style={{ color: '#C6C6CB' }}>
              <p style={{ color: '#30D158' }}>{result.patches} timbres gerados em {result.folder}</p>
              {result.skipped.length > 0 && <p style={{ color: '#FFB74D' }}>{result.skipped.length} timbres pulados.</p>}
              <div className="flex flex-wrap gap-1.5">
                {result.concerts.map((concert) => (
                  <button key={concert.id} type="button" className="hw-squarebtn px-2 py-1 text-[11px]" onClick={() => void openGenerated(concert.path)}>
                    Abrir {concert.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" className="hw-squarebtn px-3 py-1.5 text-xs" disabled={!!busy} onClick={onClose}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="button"
            className="rounded px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ background: '#30D158', color: '#0B1A10' }}
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            {busy === 'generate' ? 'Gerando…' : partial && inspection ? `Gerar ${inspection.ready} de ${inspection.total}` : 'Gerar'}
          </button>
        </div>
      </div>
    </div>
  );
};
