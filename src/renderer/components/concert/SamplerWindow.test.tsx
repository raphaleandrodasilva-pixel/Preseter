import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresetPluginAssignment } from '@shared/types';
import { AppProvider } from '../../context/AppContext';
import { SamplerWindow } from './SamplerWindow';
import { createConcertState } from '../../../test/fixtures';

const assignment: PresetPluginAssignment = {
  pluginId: 'preseter.sampler',
  layerId: 'patch:layer:0',
  name: 'Piano',
  path: 'preseter.sampler',
  role: 'instrument',
  sourceKind: 'sampler',
  samplePath: 'C:\\Samples\\piano.sf2',
  programIndex: 0,
  bank: 0,
  minNote: 21,
  maxNote: 108,
  mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
  sends: [-60, -60, -60, -60],
  sampler: { polyphony: 64, loop: true },
};

const info = {
  format: 'SF2',
  name: 'Piano',
  program: 0,
  programName: 'Grand',
  file: 'C:\\Samples\\piano.sf2',
  fileSize: 1_200_000,
  voices: 0,
  maxVoices: 64,
  presetList: [
    { name: 'Grand', bank: 0, program: 0, regions: 2 },
    { name: 'Upright', bank: 0, program: 1, regions: 1 },
  ],
  regions: [
    {
      keyLow: 21,
      keyHigh: 108,
      velLow: 1,
      velHigh: 127,
      rootKey: 60,
      loop: true,
      start: 0,
      end: 1000,
      sampleRate: 44100,
      gain: 1,
      label: 'piano',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
  vi.mocked(window.electronAPI.samplerInfo).mockResolvedValue(info);
  vi.mocked(window.electronAPI.vstParams).mockResolvedValue([]);
  vi.mocked(window.electronAPI.samplerReload).mockResolvedValue({});
  vi.mocked(window.electronAPI.vstSetProgram).mockResolvedValue(null);
});

function renderWindow(overrides: Partial<React.ComponentProps<typeof SamplerWindow>> = {}) {
  const onUpdate = vi.fn();
  const onUseInPatch = vi.fn();
  const onClose = vi.fn();
  render(
    <AppProvider>
      <SamplerWindow
        assignment={assignment}
        layerId="patch:layer:0"
        activeNotes={new Set([60])}
        onClose={onClose}
        onUpdate={onUpdate}
        onOpenStore={vi.fn()}
        onUseInPatch={onUseInPatch}
        {...overrides}
      />
    </AppProvider>
  );
  return { onUpdate, onUseInPatch, onClose };
}

describe('SamplerWindow', () => {
  it('mostra o instrumento, agrupa presets e troca de programa', async () => {
    renderWindow();
    expect(await screen.findByText('Leitor de Samples')).toBeInTheDocument();
    expect((await screen.findAllByText('Grand')).length).toBeGreaterThan(0);
    expect(screen.getByText('Banco 0 · 2 instrumento(s)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Upright'));
    await waitFor(() =>
      expect(window.electronAPI.vstSetProgram).toHaveBeenCalledWith('patch:layer:0', 1)
    );
  });

  it('aplica o som ao patch pelo botão Usar meu patch', async () => {
    const { onUseInPatch } = renderWindow();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar meu patch' }));
    await waitFor(() => expect(onUseInPatch).toHaveBeenCalledTimes(1));
  });

  it('salva pan e reverb na atribuição do patch', async () => {
    const { onUpdate } = renderWindow();
    const pan = await screen.findByLabelText('Pan');
    fireEvent.change(pan, { target: { value: '50' } });
    fireEvent.blur(pan);
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ mix: expect.objectContaining({ pan: 0.5 }) })
      )
    );
    const reverb = screen.getByLabelText('Reverb');
    fireEvent.change(reverb, { target: { value: '-12' } });
    fireEvent.blur(reverb);
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sends: expect.arrayContaining([-12]) })
      )
    );
  });

  it('não mostra o histograma de zonas e permite mudar a polifonia', async () => {
    const { onUpdate } = renderWindow();
    expect(screen.queryByText('Camadas de velocity')).not.toBeInTheDocument();

    const select = await screen.findByLabelText('Polifonia') as HTMLSelectElement;
    expect(select.value).toBe('64');
    fireEvent.change(select, { target: { value: '128' } });
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sampler: expect.objectContaining({ polyphony: 128 }) })
      )
    );
  });

  it('abre vazio sem erro quando o layer ainda não tem sample', async () => {
    vi.mocked(window.electronAPI.samplerInfo).mockRejectedValue(
      new Error('Nenhum sampler carregado neste layer.')
    );
    renderWindow({
      assignment: { ...assignment, samplePath: '', sampler: { loop: true, polyphony: 64 } },
    });
    expect(await screen.findByText('Nenhum sample carregado')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum sampler carregado neste layer.')).not.toBeInTheDocument();
  });
});
