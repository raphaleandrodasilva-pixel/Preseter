import React from 'react';

interface HardwarePanelProps {
  children: React.ReactNode;
  className?: string;
  screws?: boolean;
}

/** Chassi preto fosco com parafusos — linguagem do painel de referência. */
export const HardwarePanel: React.FC<HardwarePanelProps> = ({
  children,
  className = '',
  screws = true,
}) => (
  <div className={`hw-panel ${className}`}>
    {screws && (
      <>
        <span className="hw-screw" style={{ left: 10, top: 10 }} />
        <span className="hw-screw" style={{ right: 10, top: 10 }} />
        <span className="hw-screw" style={{ left: 10, bottom: 10 }} />
        <span className="hw-screw" style={{ right: 10, bottom: 10 }} />
      </>
    )}
    {children}
  </div>
);

export const HardwareLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`hw-label ${className}`}>{children}</div>;

export const HardwareBadge: React.FC<{ children: React.ReactNode; title?: string }> = ({
  children,
  title,
}) => (
  <span className="hw-badge" title={title}>
    {children}
  </span>
);
