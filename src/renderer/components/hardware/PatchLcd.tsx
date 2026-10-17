import React from 'react';

interface PatchLcdProps {
  programNumber: number;
  patchName: string | null;
  tempo: number;
}

/** Display central da barra de ferramentas (estilo MainStage: tela escura com texto claro). */
export const PatchLcd: React.FC<PatchLcdProps> = ({ programNumber, patchName, tempo }) => (
  <div
    className="hw-lcd flex items-center gap-3 px-3 py-1.5"
    style={{ minWidth: 300 }}
    title="Patch atual"
  >
    <span
      className="font-semibold tabular-nums"
      style={{ fontSize: 24, lineHeight: 1, color: '#F2F2F7', letterSpacing: '0.02em' }}
    >
      {String(programNumber + 1).padStart(3, '0')}
    </span>
    <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.14)' }} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold" style={{ color: '#F2F2F7' }}>
        {patchName ?? 'Nenhum patch'}
      </span>
      <span
        className="block text-[10px] uppercase tabular-nums"
        style={{ letterSpacing: '0.16em', color: '#8E8E93' }}
      >
        ♩ = {tempo}
      </span>
    </span>
  </div>
);
