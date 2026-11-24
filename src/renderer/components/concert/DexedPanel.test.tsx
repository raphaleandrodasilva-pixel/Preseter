import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DexedPanel } from './DexedPanel';
import type { EngineParameter } from '@shared/engine-protocol';

const param = (index: number, name: string, value = 0): EngineParameter => ({
  index,
  id: String(index),
  name,
  label: '',
  value,
  defaultValue: 0,
  text: String(Math.round(value * 99)),
  stepCount: 0,
  automatable: true,
} as EngineParameter);

const names = [
  ...Array.from({ length: 32 }, (_, index) => `Dexed 01 · Programa ${index + 1}`),
  ...Array.from({ length: 32 }, (_, index) => `Synprez 02 · Patch ${index + 1}`),
];

describe('DexedPanel', () => {
  it('separa bancos, mostra os parâmetros globais e os operadores', () => {
    const onProgram = vi.fn();
    render(
      <DexedPanel
        params={[
          param(0, 'Output'),
          param(1, 'Algorithm', 1),
          param(2, 'OP1 Eg Rate1'),
          param(3, 'OP2 Output Level'),
        ]}
        program={32}
        programNames={names}
        onChange={() => undefined}
        onProgram={onProgram}
        onImport={() => undefined}
      />
    );

    expect(screen.getByLabelText('Banco do Dexed')).toHaveValue('1');
    expect(screen.getByLabelText('Programa do Dexed')).toHaveValue('0');
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Eg Rate1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Banco do Dexed'), { target: { value: '0' } });
    expect(onProgram).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: 'OP2' }));
    expect(screen.getByText('Output Level')).toBeInTheDocument();
  });

  it('dispara a importação de cartucho', () => {
    const onImport = vi.fn();
    render(
      <DexedPanel
        params={[]}
        program={0}
        programNames={names}
        onChange={() => undefined}
        onProgram={() => undefined}
        onImport={onImport}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Importar cartucho .syx…' }));
    expect(onImport).toHaveBeenCalled();
  });
});
