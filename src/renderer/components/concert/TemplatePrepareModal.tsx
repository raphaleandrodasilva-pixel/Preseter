import React, { useState } from 'react';
import type { TemplateReadiness } from '@shared/template-requirements';
import { useAppContext } from '../../context/AppContext';

interface TemplatePrepareModalProps {
  templateId: string;
  templateName?: string;
  readiness: TemplateReadiness;
  onClose: () => void;
  /** Cria o concert mesmo com itens faltando. */
  onProceed: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'tamanho desconhecido';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
};

/** Prepara um template: mostra e baixa as dependências da Loja antes de criar. */
export const TemplatePrepareModal: React.FC<TemplatePrepareModalProps> = ({
  templateId,
  templateName,
  readiness: initial,
  onClose,
  onProceed,
}) => {
  const { downloadCollection, rescanVstPlugins, openCollectionInstaller } = useAppContext();
  const [readiness, setReadiness] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Caminho do instalador baixado (itens .exe/.msi). */
  const [installers, setInstallers] = useState<Record<string, string>>({});

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await downloadCollection(readiness.missingIds);
      if (result) {
        const downloaded: Record<string, string> = {};
        for (const status of result.statuses) {
          if (status.filePath) downloaded[status.id] = status.filePath;
        }
        setInstallers(downloaded);
        if (!result.ok) setError('Alguns itens não foram baixados. Veja a lista abaixo.');
      }
      // Plugins novos só aparecem depois de um novo scan.
      await rescanVstPlugins();
      setReadiness(await window.electronAPI.templateReadiness(templateId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha ao baixar o que falta.');
    } finally {
      setBusy(false);
    }
  };

  const complete = readiness.missing.length === 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Preparar template"
        className="w-full max-w-[520px] rounded-xl p-4 shadow-2xl"
        style={{ background: '#1C1C1E', border: '1px solid #3A3A3C' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Preparar template</div>
            <div className="text-[11px]" style={{ color: '#9A9AA0' }}>
              {templateName ?? templateId} · confere os itens da Loja antes de criar o concert.
            </div>
          </div>
          <button className="px-1 text-xs" style={{ color: '#9A9AA0' }} onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        {complete ? (
          <p className="mt-3 text-[11px]" style={{ color: '#7BE38F' }}>
            Tudo instalado. Pode criar o concert.
          </p>
        ) : (
          <>
            <p className="mt-3 text-[11px]" style={{ color: '#C6C6CB' }}>
              Faltam <strong>{readiness.missing.length}</strong> de {readiness.total} item(ns)
              {' '}(~{formatBytes(readiness.approxBytes)}).
            </p>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg p-2" style={{ background: '#111113' }}>
              {readiness.missing.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-200">
                  <span className="min-w-0 truncate" title={item.name}>
                    {item.name}
                    <span className="ml-1 text-[9px]" style={{ color: '#6E6E73' }}>{item.kind}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[9px]" style={{ color: '#8E8E93' }}>{formatBytes(item.approxBytes)}</span>
                    {installers[item.id] && (
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-[9px]"
                        style={{ background: '#3A3A3C', color: '#E5E5EA' }}
                        onClick={() => void openCollectionInstaller(installers[item.id])}
                      >
                        Abrir instalador
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {error && <div className="mt-2 text-[10px]" style={{ color: '#FF8A80' }}>{error}</div>}
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: '#8E8E93' }}>
              Instaladores (.exe/.msi) são baixados e precisam ser executados. Itens manuais abrem na Loja.
              O template cria os patches; alguns instrumentos ainda podem precisar ser adicionados ao patch.
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            onClick={onClose}
          >
            Cancelar
          </button>
          {!complete && (
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
              style={{ background: '#0A84FF', color: '#fff' }}
              disabled={busy || readiness.missingIds.length === 0}
              onClick={() => void download()}
            >
              {busy ? 'Baixando…' : 'Baixar o que falta'}
            </button>
          )}
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            style={{ background: complete ? '#30D158' : '#3A3A3C', color: complete ? '#0B1A10' : '#E5E5EA' }}
            disabled={busy}
            onClick={onProceed}
          >
            {complete ? 'Criar concert' : 'Criar mesmo assim'}
          </button>
        </div>
      </div>
    </div>
  );
};
