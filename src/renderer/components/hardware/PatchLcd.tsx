import React from 'react';

interface PatchLcdProps {
  programNumber: number;
  patchName: string | null;
  tempo: number;
}

/** Display LCD estilo hardware de referência (fundo #D9E3D0, texto #1C241A). */
export const PatchLcd: React.FC<PatchLcdProps> = ({ programNumber, patchName, tempo }) => (
  <div
    className="hw-lcd flex items-center gap-3 px-3 py-1.5"
    style={{ background: '#D9E3D0', color: '#1C241A', minWidth: 260 }}
    title="Patch atual"
  >
    <span
      className="font-mono font-bold tabular-nums"
      style={{ fontSize: 26, lineHeight: 1, color: '#1C241A' }}
    >
      {String(programNumber + 1).padStart(2, '0')}
    </span>
    <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(27,39,64,0.25)' }} />
    <span className="min-w-0 flex-1">
      <span
        className="block truncate text-sm font-semibold"
        style={{ color: '#1C241A' }}
      >
        {patchName ?? 'Nenhum patch'}
      </span>
      <span
        className="block text-[10px] uppercase tabular-nums"
        style={{ letterSpacing: '0.18em', color: 'rgba(27,39,64,0.7)' }}
      >
        {tempo} BPM
      </span>
    </span>
  </div>
);
