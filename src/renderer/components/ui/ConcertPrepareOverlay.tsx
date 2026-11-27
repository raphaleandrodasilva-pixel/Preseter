import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

/**
 * Barra de preparação do concert. Bloqueia o palco até todos os instrumentos
 * estarem carregados (ou até o usuário cancelar): a troca de patch só é
 * liberada com o sampler e os bancos já prontos.
 */
export const ConcertPrepareOverlay: React.FC = () => {
  const { concertPrepare, cancelConcertPrepare, dismissConcertPrepare } = useAppContext();
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  const running = Boolean(concertPrepare && !concertPrepare.finished);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) setCancelling(false);
  }, [running]);

  if (!concertPrepare) return null;

  const finished = concertPrepare.finished;
  const problems = concertPrepare.errors.length > 0;
  const needsAttention = finished && (concertPrepare.cancelled || problems);
  const percent = finished
    ? 100
    : concertPrepare.total > 0
      ? Math.round((concertPrepare.done / concertPrepare.total) * 100)
      : 0;
  const elapsedMs = finished
    ? concertPrepare.elapsedMs
    : Math.max(0, now - concertPrepare.startedAt);
  const elapsed = `${(elapsedMs / 1000).toFixed(1)} s`;
  const current = concertPrepare.currentName
    ? ` — ${concertPrepare.currentName}`
    : '';

  const detail = finished
    ? concertPrepare.cancelled
      ? `Preparação cancelada em ${concertPrepare.done}/${concertPrepare.total} instrumentos.`
      : problems
        ? `${concertPrepare.done}/${concertPrepare.total} instrumentos; ${concertPrepare.errors.length} com problema.`
        : `${concertPrepare.done}/${concertPrepare.total} instrumentos prontos.`
    : concertPrepare.phase === 'loading'
      ? `Carregando ${concertPrepare.done + 1}/${concertPrepare.total}${current}`
      : `${concertPrepare.done}/${concertPrepare.total}${current}`;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Preparando concert"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="hw-panel w-full max-w-[520px] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="hw-label">Preseter</div>
            <div className="truncate text-base font-semibold text-white">Preparando concert</div>
          </div>
          <span className="tabular-nums text-sm" style={{ color: '#9AD1FF' }}>
            {percent}%
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: '#242426' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: concertPrepare.cancelled ? '#B26A00' : '#0A84FF',
              transition: 'width 200ms ease-out',
            }}
          />
        </div>

        <div className="mt-2 min-h-[18px] truncate text-xs" style={{ color: '#C9C9CE' }} title={detail}>
          {detail}
        </div>

        <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: '#7A7A80' }}>
          <span>
            {concertPrepare.patches} patch(es) · {concertPrepare.samplers} sampler(s) ·{' '}
            {concertPrepare.natives} nativo(s)
          </span>
          <span className="tabular-nums">{elapsed}</span>
        </div>

        {!finished && (
          <div className="mt-3 text-[11px]" style={{ color: '#7A7A80' }}>
            O patch atual continua soando. O palco libera quando todos os instrumentos estiverem prontos.
          </div>
        )}

        {finished && problems && (
          <div
            className="mt-3 max-h-40 overflow-y-auto rounded-lg border px-3 py-2 text-[11px]"
            style={{ borderColor: '#7A2A2A', background: 'rgba(122,42,42,0.25)', color: '#FFB4B4' }}
          >
            <div className="mb-1 font-semibold">Instrumentos com problema</div>
            <ul className="list-disc pl-4">
              {concertPrepare.errors.map((item) => (
                <li key={item.name}>
                  <span className="font-medium">{item.name}:</span> {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {!finished && (
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-xs"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true);
                cancelConcertPrepare();
              }}
            >
              {cancelling ? 'Cancelando…' : 'Cancelar'}
            </button>
          )}
          {needsAttention && (
            <button
              type="button"
              className="hw-squarebtn px-3 py-1.5 text-xs"
              onClick={dismissConcertPrepare}
            >
              Continuar mesmo assim
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
