import React from 'react';

interface ModalShellProps {
  /** Rótulo pequeno em maiúsculas acima do título. */
  label?: string;
  title: string;
  /** Texto do display à direita do título. */
  lcd?: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  maxHeight?: string;
  zIndex?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Moldura padrão das janelas de configuração do Preseter.
 * Mantém o mesmo visual hardware do SettingsModal: painel escuro, rótulo,
 * título, display LCD e botão quadrado de fechar.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  label = 'Configurações',
  title,
  lcd,
  onClose,
  maxWidth = 'max-w-2xl',
  maxHeight = 'max-h-[82vh]',
  zIndex = 'z-50',
  children,
  footer,
}) => {
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`hw-panel flex ${maxHeight} w-full ${maxWidth} flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <div className="min-w-0">
            <div className="hw-label">{label}</div>
            <div className="truncate text-sm font-semibold" style={{ color: '#EDEDEF' }}>
              {title}
            </div>
          </div>
          {lcd !== undefined && (
            <div className="hw-lcd ml-auto max-w-[48%] truncate px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide">
              {lcd}
            </div>
          )}
          <button
            onClick={onClose}
            className={`hw-squarebtn px-2.5 py-1 text-sm ${lcd === undefined ? 'ml-auto' : ''}`}
            style={{ color: '#EDEDEF' }}
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: '#303032' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
