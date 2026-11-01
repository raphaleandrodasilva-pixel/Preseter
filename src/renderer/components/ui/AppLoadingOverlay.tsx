import React from 'react';
import { useAppContext } from '../../context/AppContext';

/** Overlay global que bloqueia a interface durante abertura de arquivos/patch. */
export const AppLoadingOverlay: React.FC = () => {
  const { loadProgress, dismissLoadProgress } = useAppContext();
  if (!loadProgress?.active) return null;
  const percent = loadProgress.percent;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy={!loadProgress.error}
      aria-label={loadProgress.title}
    >
      <div className="hw-panel w-full max-w-md p-5">
        <div className="hw-label">Preseter</div>
        <div className="mt-1 text-base font-semibold text-white">{loadProgress.title}</div>
        {loadProgress.detail && (
          <div className="mt-1 min-h-[16px] truncate text-xs" style={{ color: '#9A9AA0' }} title={loadProgress.detail}>
            {loadProgress.detail}
          </div>
        )}
        {!loadProgress.error && (
          <>
            <div className="mt-4 flex items-center justify-between text-[11px]" style={{ color: '#C6C6CB' }}>
              <span>
                {loadProgress.total && loadProgress.total > 0
                  ? `Etapa ${Math.min(loadProgress.current ?? 0, loadProgress.total)} de ${loadProgress.total}`
                  : 'Preparando…'}
              </span>
              <span className="tabular-nums" style={{ color: '#9AD1FF' }}>
                {percent !== undefined ? `${percent}%` : '—'}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: '#242426' }}>
              <div
                className={percent === undefined ? 'h-full animate-pulse rounded-full' : 'h-full rounded-full'}
                style={{
                  width: `${percent ?? 35}%`,
                  background: '#0A84FF',
                  transition: 'width 200ms ease-out',
                }}
              />
            </div>
          </>
        )}
        {loadProgress.error && (
          <div className="mt-4 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#7A2A2A', background: 'rgba(122,42,42,0.25)', color: '#FFB4B4' }}>
            {loadProgress.error}
          </div>
        )}
        {loadProgress.error && (
          <button
            type="button"
            className="hw-squarebtn mt-3 px-3 py-1.5 text-xs"
            onClick={dismissLoadProgress}
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};
