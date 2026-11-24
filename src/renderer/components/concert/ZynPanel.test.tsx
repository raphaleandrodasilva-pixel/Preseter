import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ZynPanel } from './ZynPanel';
import type { EngineParameter } from '@shared/engine-protocol';

const param = (index: number, name: string, value = 0, text = ''): EngineParameter => ({
  index,
  id: String(index),
  name,
  label: '',
  value,
  defaultValue: 0,
  text,
  stepCount: 0,
  automatable: true,
} as EngineParameter);

const names = [
  'Fabrica/Rhodes · DX Rhodes 1',
  'Fabrica/Rhodes · DX Rhodes 2',
  'Fabrica/Bass · FM Bass',
];

describe('ZynPanel', () => {
  it('agrupa bancos, troca programa e mostra a parte', () => {
    const onProgram = vi.fn();
    render(
      <ZynPanel
        params={[
          param(0, 'Volume', 0.5, '0.0 dB'),
          param(1, 'Pan', 0.5, 'C'),
          param(2, 'Voices', 0.5, '32'),
          param(3, 'Key Shift', 0.5, '0'),
          param(4, 'Mono', 0, 'Off'),
        ]}
        program={1}
        programNames={names}
        onChange={() => undefined}
        onProgram={onProgram}
        onImport={() => undefined}
      />
    );

    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('0');
    expect(screen.getByLabelText('Programa do Zyn')).toHaveValue('1');
    expect(screen.getByText('DX Rhodes 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Programa do Zyn'), { target: { value: '0' } });
    expect(onProgram).toHaveBeenCalledWith(0);
  });

  it('dispara a importação de preset', () => {
    const onImport = vi.fn();
    render(
      <ZynPanel
        params={[]}
        program={0}
        programNames={names}
        onChange={() => undefined}
        onProgram={() => undefined}
        onImport={onImport}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Importar preset .xiz…' }));
    expect(onImport).toHaveBeenCalled();
  });
});
