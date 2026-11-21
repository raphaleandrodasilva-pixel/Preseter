import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EngineDrumsState } from '@shared/types';
import { DrumMachinePanel } from './DrumMachinePanel';

const TEST_TIMEOUT = 20000;

const makeInfo = (overrides: Partial<EngineDrumsState> = {}): EngineDrumsState => {
  const steps = Array.from({ length: 16 }, (_, index) => ({
    on: index === 0,
    velocity: index === 0 ? 120 : 100,
  }));
  return {
    enabled: true,
    currentStep: -1,
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    trackCount: 1,
    totalSteps: 16,
    kit: 'SF2 · MuseScore_General',
    gainDb: 0,
    tracks: [{ pad: 0, mute: false, level: 0, steps }],
    pads: Array.from({ length: 16 }, (_, index) => ({
      index,
      note: 36 + index,
      name: '',
      levelDb: 0,
      muted: false,
      solo: false,
    })),
    ...overrides,
  };
};

const lastSetPayload = () => {
  const calls = vi.mocked(window.electronAPI.drumsSet).mock.calls;
  return calls[calls.length - 1]?.[1] as {
    enabled?: boolean;
    pattern?: {
      stepsPerBar: number;
      bars: number;
      swing: number;
      tracks: Array<{ pad: number; steps: Array<{ on: boolean; velocity: number }> }>;
    };
    gainDb?: number;
    soloPad?: number;
  };
};

describe('DrumMachinePanel', () => {
  it('mostra a grade, alterna um passo e envia o padrão', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    const step2 = await screen.findByTestId('step-0-1');
    expect(step2).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(step2);

    await waitFor(() => expect(window.electronAPI.drumsSet).toHaveBeenCalled());
    const payload = lastSetPayload();
    expect(payload.pattern?.stepsPerBar).toBe(16);
    expect(payload.pattern?.tracks[0].steps[1]).toMatchObject({ on: true, velocity: 100 });
    expect(step2).toHaveAttribute('aria-pressed', 'true');
  }, TEST_TIMEOUT);

  it('muda a resolução e os compassos', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    await screen.findByTestId('step-0-1');

    fireEvent.change(screen.getByLabelText('Resolução'), { target: { value: '8' } });
    await waitFor(() => expect(lastSetPayload()?.pattern?.stepsPerBar).toBe(8));
    expect(lastSetPayload()?.pattern?.tracks[0].steps).toHaveLength(8);

    fireEvent.change(screen.getByLabelText('Compassos'), { target: { value: '2' } });
    await waitFor(() => expect(lastSetPayload()?.pattern?.bars).toBe(2));
    expect(lastSetPayload()?.pattern?.tracks[0].steps).toHaveLength(16);
  }, TEST_TIMEOUT);

  it('muda o swing', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    await screen.findByTestId('step-0-1');
    fireEvent.change(screen.getByLabelText('Swing'), { target: { value: '40' } });

    await waitFor(() => expect(lastSetPayload()?.pattern?.swing).toBe(40));
  }, TEST_TIMEOUT);

  it('liga/desliga o sequenciador e muda o volume geral', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo({ enabled: false }));
    render(<DrumMachinePanel layerId="drums-1" />);

    const toggle = await screen.findByRole('button', { name: 'Sequenciador desligado' });
    fireEvent.click(toggle);
    await waitFor(() => expect(lastSetPayload()?.enabled).toBe(true));

    fireEvent.change(screen.getByLabelText('Volume geral'), { target: { value: '-6' } });
    await waitFor(() => expect(lastSetPayload()?.gainDb).toBe(-6));
  }, TEST_TIMEOUT);

  it('pré-ouve o pad e aplica solo', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    const pad = await screen.findByTestId('pad-0');
    fireEvent.pointerDown(pad);
    expect(window.electronAPI.engineMidi).toHaveBeenCalledWith([0x90, 36, 100]);

    fireEvent.click(screen.getByRole('button', { name: 'Solo Caixa' }));
    await waitFor(() => expect(lastSetPayload()?.soloPad).toBe(2));
  }, TEST_TIMEOUT);

  it('limpa o padrão', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    await screen.findByTestId('step-0-1');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar padrão' }));

    await waitFor(() => {
      const pattern = lastSetPayload()?.pattern;
      expect(pattern?.tracks.every((track) => track.steps.every((step) => !step.on))).toBe(true);
    });
  }, TEST_TIMEOUT);

  it('marca o passo atual vindo do motor', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    vi.mocked(window.electronAPI.drumsPosition).mockResolvedValue({ enabled: true, currentStep: 2 });
    render(<DrumMachinePanel layerId="drums-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('step-0-2')).toHaveAttribute('data-current', 'true')
    );
  }, TEST_TIMEOUT);

  it('navega e alterna pelo teclado', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    const step1 = await screen.findByTestId('step-0-0');
    step1.focus();
    fireEvent.keyDown(step1, { key: 'ArrowRight' });
    const step2 = screen.getByTestId('step-0-1');
    await waitFor(() => expect(step2).toHaveFocus());

    fireEvent.keyDown(step2, { key: ' ' });
    await waitFor(() => expect(lastSetPayload()?.pattern?.tracks[0].steps[1].on).toBe(true));
  }, TEST_TIMEOUT);

  it('carrega um padrão de fábrica', async () => {
    vi.mocked(window.electronAPI.drumsInfo).mockResolvedValue(makeInfo());
    render(<DrumMachinePanel layerId="drums-1" />);

    await screen.findByTestId('step-0-1');
    fireEvent.change(screen.getByLabelText('Padrão de fábrica'), { target: { value: 'shuffle' } });

    await waitFor(() => {
      const pattern = lastSetPayload()?.pattern;
      expect(pattern?.stepsPerBar).toBe(12);
      expect(pattern?.swing).toBe(62);
    });
    const pattern = lastSetPayload()?.pattern;
    const kick = pattern?.tracks.find((track) => track.pad === 0);
    expect(kick?.steps[0]).toMatchObject({ on: true, velocity: 112 });
    expect(kick?.steps).toHaveLength(12);
    expect(screen.getByTestId('step-0-0')).toHaveAttribute('aria-pressed', 'true');
  }, TEST_TIMEOUT);
});
