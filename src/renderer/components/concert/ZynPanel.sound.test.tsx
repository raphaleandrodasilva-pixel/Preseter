import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ZYN_EFFECT_TYPES, ZynPanel } from './ZynPanel';
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

// Mesma ordem e faixas do createLayout do ZynFactory.cpp (Z4b–d).
const params = [
  param(30, 'PAD Engine', 0, '-1'),
  param(31, 'AD Volume', 24 / 36, '0'),
  param(32, 'SUB Volume', 30 / 36, '6'),
  param(33, 'PAD Volume', 24 / 36, '0'),
  param(34, 'Cutoff', 0.5, '0'),
  param(35, 'Resonance', 0.5, '0'),
  param(36, 'Attack', 0.75, '32'),
  param(37, 'Decay', 0.5, '0'),
  param(38, 'Sustain', 0.25, '-32'),
  param(39, 'Release', 0.5, '0'),
  param(40, 'FX1 Type', 0, '-1'),
  param(41, 'FX2 Type', 3 / 11, '2'),
  param(42, 'FX3 Type', 0, '-1'),
  param(43, 'FX1 Mix', 0, '-1'),
  param(44, 'FX2 Mix', 65 / 128, '64'),
  param(45, 'FX3 Mix', 0, '-1'),
];

const renderPanel = () => {
  const onChange = vi.fn();
  render(
    <ZynPanel
      params={params}
      program={0}
      programNames={['Fábrica/Pads · 0065-Soft Pad']}
      onChange={onChange}
      onProgram={() => undefined}
      onImport={() => undefined}
    />
  );
  return { onChange };
};

describe('ZynPanel — som, motores e efeitos internos (Z4b–d)', () => {
  it('mostra os macros de som com sinal e os volumes em dB', () => {
    renderPanel();
    expect(screen.getByText('Som')).toBeInTheDocument();
    for (const name of ['Cutoff', 'Resonance', 'Attack', 'Decay', 'Sustain', 'Release']) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('+32')).toBeInTheDocument();
    expect(screen.getByText('-32')).toBeInTheDocument();
    expect(screen.getByText('+6 dB')).toBeInTheDocument();
    expect(screen.getByLabelText('PADsynth')).toBeInTheDocument();
  });

  it('liga o PADsynth com o valor normalizado de -1..1', () => {
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByLabelText('PADsynth'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('PAD Engine', 1);
    fireEvent.change(screen.getByLabelText('PADsynth'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith('PAD Engine', 0.5);
  });

  it('escolhe o tipo do efeito interno e mostra o mix do preset', () => {
    const { onChange } = renderPanel();
    expect(screen.getByLabelText('FX2')).toHaveValue('2');
    expect(screen.getAllByText('Preset').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('FX1'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('FX1 Type', 2 / 11);
    fireEvent.change(screen.getByLabelText('FX3'), { target: { value: '-1' } });
    expect(onChange).toHaveBeenCalledWith('FX3 Type', 0);
  });

  it('lista os 10 efeitos do Zyn e as opções Preset/Nenhum', () => {
    expect(ZYN_EFFECT_TYPES.map(([value]) => value)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
