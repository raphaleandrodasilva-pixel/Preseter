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

const params = [
  param(0, 'Volume', 0.5, '0.0 dB'),
  param(1, 'Pan', 0.5, 'C'),
  param(2, 'Voices', 0.5, '32'),
  param(3, 'Key Shift', 0.5, '0'),
  param(4, 'Mono', 0, 'Off'),
  param(5, 'Vel Sensitivity', 0.5, '64'),
  param(6, 'Bend Range', 0.5, '2'),
  param(7, 'AD Engine', 0, '-1'),
  param(8, 'Legato', 0, 'Off'),
];

const names = [
  'Fabrica/Rhodes · DX Rhodes 1',
  'Fabrica/Rhodes · DX Rhodes 2',
];

const renderPanel = () => {
  const onChange = vi.fn();
  render(
    <ZynPanel
      params={params}
      program={0}
      programNames={names}
      onChange={onChange}
      onProgram={() => undefined}
      onImport={() => undefined}
    />
  );
  return { onChange };
};

describe('ZynPanel — controles da primeira leva (Z4a)', () => {
  it('mostra Parte, Controladores e Motores', () => {
    renderPanel();
    expect(screen.getByText('Parte')).toBeInTheDocument();
    expect(screen.getByText('Controladores')).toBeInTheDocument();
    expect(screen.getByText('Motores')).toBeInTheDocument();
    expect(screen.getByLabelText('Vel Sensitivity')).toBeInTheDocument();
    expect(screen.getByLabelText('Bend Range')).toBeInTheDocument();
    expect(screen.getByLabelText('ADsynth')).toBeInTheDocument();
    expect(screen.getByText('2 st')).toBeInTheDocument();
  });

  it('manda o nome e o valor normalizado de cada controle', () => {
    const { onChange } = renderPanel();

    fireEvent.change(screen.getByLabelText('Vel Sensitivity'), { target: { value: '0.8' } });
    expect(onChange).toHaveBeenCalledWith('Vel Sensitivity', 0.8);

    fireEvent.change(screen.getByLabelText('ADsynth'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('AD Engine', 1);

    fireEvent.click(screen.getByRole('button', { name: 'Legato' }));
    expect(onChange).toHaveBeenCalledWith('Legato', 1);
  });
});
