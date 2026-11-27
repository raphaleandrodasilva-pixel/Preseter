import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

const SHOW_DELAY_MS = 250;

/**
 * Aviso flutuante de carregamento. Fica invisível nas trocas rápidas (menos de
 * 250 ms) e não bloqueia a interface: o músico pode continuar tocando enquanto
 * um patch grande termina de carregar.
 */
export const AppLoadingOverlay: React.FC = () => {
  const { loadProgress, dismissLoadProgress } = useAppContext();
  const [visible, setVisible] = useState(false);
  const active = Boolean(loadProgress?.active);
  const isError = Boolean(loadProgress?.error);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (isError) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, isError]);

  if (!active || !visible || !loadProgress) return null;

  const percent = loadProgress.percent;
  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[100] w-[min(340px,calc(100vw-3rem))]"
      role="status"
      aria-live="polite"
      aria-busy={!loadProgress.error}
    >
      <div
        className={`hw-panel p-4 shadow-2xl ${loadProgress.error ? 'pointer-events-auto' : ''}`}
        style={{ borderColor: loadProgress.error ? '#7A2A2A' : undefined }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="hw-label">Preseter</div>
            <div className="truncate text-sm font-semibold text-white">{loadProgress.title}</div>
          </div>
          {!loadProgress.error && percent !== undefined && (
            <span className="tabular-nums text-xs" style={{ color: '#9AD1FF' }}>
              {percent}%
            </span>
          )}
        </div>
        {loadProgress.detail && (
          <div className="mt-1 min-h-[16px] truncate text-[11px]" style={{ color: '#9A9AA0' }} title={loadProgress.detail}>
            {loadProgress.detail}
          </div>
        )}
        {!loadProgress.error && (
          <>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#242426' }}>
              <div
                className={percent === undefined ? 'h-full animate-pulse rounded-full' : 'h-full rounded-full'}
                style={{
                  width: `${percent ?? 35}%`,
                  background: '#0A84FF',
                  transition: 'width 200ms ease-out',
                }}
              />
            </div>
            <div className="mt-1 text-[10px]" style={{ color: '#6E6E73' }}>
              O patch atual continua soando até a troca.
            </div>
          </>
        )}
        {loadProgress.error && (
          <>
            <div className="mt-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: '#7A2A2A', background: 'rgba(122,42,42,0.25)', color: '#FFB4B4' }}>
              {loadProgress.error}
            </div>
            <button
              type="button"
              className="hw-squarebtn mt-2 px-3 py-1.5 text-xs"
              onClick={dismissLoadProgress}
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
};
