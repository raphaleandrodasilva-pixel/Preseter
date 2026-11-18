import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../context/AppContext';
import { SettingsModal } from './SettingsModal';
import {
  createAudioDeviceSnapshot,
  createAudioSettingsSnapshot,
  createConcertState,
  createPreferences,
  createSavedAudioSettings,
} from '../../../test/fixtures';

beforeEach(() => {
  localStorage.clear();
  (window.electronAPI as unknown as { platform: string }).platform = 'win32';
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
  vi.mocked(window.electronAPI.preferencesGet).mockResolvedValue(createPreferences());
  vi.mocked(window.electronAPI.preferencesSet).mockImplementation(async (update) => ({
    ...createPreferences(),
    ...update,
  }));
});

describe('SettingsModal — gravação', () => {
  it('mostra WAV/320 por padrão e desabilita o bitrate fora do MP3', () => {
    render(
      <AppProvider>
        <SettingsModal initialTab="general" onClose={vi.fn()} />
      </AppProvider>
    );

    const format = screen.getByLabelText('Formato de gravação') as HTMLSelectElement;
    const bitrate = screen.getByLabelText('Bitrate do MP3') as HTMLSelectElement;
    expect(format.value).toBe('wav');
    expect(bitrate.value).toBe('320');
    expect(bitrate.disabled).toBe(true);
  });

  it('salva formato, bitrate e pasta nas preferências', async () => {
    render(
      <AppProvider>
        <SettingsModal initialTab="general" onClose={vi.fn()} />
      </AppProvider>
    );
    // Espera o carregamento inicial das preferências terminar antes de alterar.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const format = screen.getByLabelText('Formato de gravação') as HTMLSelectElement;
    fireEvent.change(format, { target: { value: 'mp3' } });
    await waitFor(() => {
      expect(window.electronAPI.preferencesSet).toHaveBeenCalledWith({ recordingFormat: 'mp3' });
    });
    await waitFor(() => expect((screen.getByLabelText('Bitrate do MP3') as HTMLSelectElement).disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('Bitrate do MP3'), { target: { value: '192' } });
    await waitFor(() => {
      expect(window.electronAPI.preferencesSet).toHaveBeenCalledWith({ recordingBitrate: 192 });
    });

    fireEvent.change(screen.getByLabelText('Pasta de gravação'), {
      target: { value: 'C:/Minhas Gravacoes' },
    });
    await waitFor(() => {
      expect(window.electronAPI.preferencesSet).toHaveBeenCalledWith({
        recordingFolder: 'C:/Minhas Gravacoes',
      });
    });
  });

  it('mostra JACK e ALSA no Linux e esconde ASIO', async () => {
    (window.electronAPI as unknown as { platform: string }).platform = 'linux';
    const devices = createAudioDeviceSnapshot({
      jackSupported: true,
      jackAvailable: true,
      audioTypes: [
        { type: 'ALSA', outputs: ['default'], inputs: [] },
        { type: 'JACK', outputs: ['system'], inputs: [] },
        { type: 'ASIO', outputs: ['Driver'], inputs: [] },
      ],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings(),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByText(/JACK disponível/)).toBeInTheDocument());
    expect(screen.queryByText(/ASIO não está ativo/)).not.toBeInTheDocument();
    const options = Array.from(document.querySelectorAll('select option')).map(
      (option) => (option as HTMLOptionElement).value
    );
    expect(options).toContain('ALSA');
    expect(options).toContain('JACK');
    expect(options).not.toContain('ASIO');
  });
});

describe('SettingsModal — formatos do dispositivo de áudio', () => {
  it('uses the sample rates and buffer sizes reported by the active device', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      asioSupported: true,
      asioDriverAvailable: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 48000,
        bufferSize: 256,
        inputChannels: 2,
        outputChannels: 2,
        outputLatencyMs: 8,
        availableSampleRates: [44100, 48000],
        availableBufferSizes: [128, 256],
      },
      audioTypes: [{ type: 'ASIO', outputs: ['ASIO4ALL v2'], inputs: ['ASIO4ALL v2'] }],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({
          type: 'ASIO',
          sampleRate: 44100,
          bufferSize: 512,
        }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    const rates = await screen.findByLabelText('Taxa de amostragem') as HTMLSelectElement;
    const buffers = screen.getByLabelText('Tamanho do buffer') as HTMLSelectElement;
    expect(Array.from(rates.options, (option) => Number(option.value))).toEqual([44100, 48000]);
    expect(Array.from(buffers.options, (option) => Number(option.value))).toEqual([128, 256]);
    expect(rates.value).toBe('48000');
    expect(buffers.value).toBe('256');
  });

  it('keeps fallback choices when a backend does not report supported formats', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 48000,
        bufferSize: 512,
        inputChannels: 2,
        outputChannels: 2,
        outputLatencyMs: 8,
        availableSampleRates: [],
        availableBufferSizes: [],
      },
      audioTypes: [{ type: 'ASIO', outputs: ['ASIO4ALL v2'], inputs: ['ASIO4ALL v2'] }],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({ type: 'ASIO' }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    const rates = await screen.findByLabelText('Taxa de amostragem') as HTMLSelectElement;
    const buffers = screen.getByLabelText('Tamanho do buffer') as HTMLSelectElement;
    expect(Array.from(rates.options, (option) => Number(option.value))).toContain(48000);
    expect(Array.from(buffers.options, (option) => Number(option.value))).toContain(512);
  });
});

describe('SettingsModal — dispositivos de áudio selecionados', () => {
  it('restores saved and active devices when reopening the audio tab', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      asioSupported: true,
      asioDriverAvailable: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 44100,
        bufferSize: 512,
        inputChannels: 2,
        outputChannels: 2,
        outputLatencyMs: 13,
      },
      audioTypes: [
        { type: 'ASIO', outputs: ['ASIO4ALL v2', 'ASIO Output 1'], inputs: ['ASIO4ALL v2', 'ASIO Input 1'] },
      ],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({
          type: 'ASIO',
          input: 'ASIO Input 1',
          output: 'ASIO Output 1',
          inputs: 2,
          outputs: 2,
        }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="general" onClose={vi.fn()} />
      </AppProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Áudio' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Entrada') as HTMLSelectElement).value).toBe('ASIO Input 1');
      expect((screen.getByLabelText('Saída') as HTMLSelectElement).value).toBe('ASIO Output 1');
      expect(screen.getByRole('checkbox', { name: /Seguir o dispositivo/ })).toBeChecked();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Geral' }));
    fireEvent.click(screen.getByRole('button', { name: 'Áudio' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Entrada') as HTMLSelectElement).value).toBe('ASIO Input 1');
      expect((screen.getByLabelText('Saída') as HTMLSelectElement).value).toBe('ASIO Output 1');
      expect(screen.getByRole('checkbox', { name: /Seguir o dispositivo/ })).toBeChecked();
    });
  });

  it('uses the active device when saved input and output names are absent', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 44100,
        bufferSize: 512,
        inputChannels: 2,
        outputChannels: 2,
        outputLatencyMs: 13,
      },
      audioTypes: [
        { type: 'ASIO', outputs: ['ASIO4ALL v2'], inputs: ['ASIO4ALL v2'] },
      ],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({ type: 'ASIO', inputs: 2, outputs: 2 }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Entrada') as HTMLSelectElement).value).toBe('ASIO4ALL v2');
      expect((screen.getByLabelText('Saída') as HTMLSelectElement).value).toBe('ASIO4ALL v2');
    });
  });

  it('clears device selections when the backend changes', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      asioSupported: true,
      asioDriverAvailable: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 44100,
        bufferSize: 512,
        inputChannels: 2,
        outputChannels: 2,
        outputLatencyMs: 13,
      },
      audioTypes: [
        { type: 'ASIO', outputs: ['ASIO4ALL v2'], inputs: ['ASIO4ALL v2'] },
        { type: 'Windows Audio', outputs: ['Speakers'], inputs: ['Microphone'] },
      ],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({
          type: 'ASIO',
          input: 'ASIO4ALL v2',
          output: 'ASIO4ALL v2',
          inputs: 2,
          outputs: 2,
        }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Entrada') as HTMLSelectElement).value).toBe('ASIO4ALL v2');
      expect((screen.getByLabelText('Saída') as HTMLSelectElement).value).toBe('ASIO4ALL v2');
    });

    fireEvent.change(screen.getByLabelText('Backend de áudio'), {
      target: { value: 'Windows Audio' },
    });
    expect((screen.getByLabelText('Entrada') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Saída') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('checkbox', { name: /Seguir o dispositivo/ })).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Backend de áudio'), {
      target: { value: 'ASIO' },
    });
    expect(screen.getByRole('checkbox', { name: /Seguir o dispositivo/ })).toBeChecked();
  });

  it('preserves an explicit manual ASIO configuration', async () => {
    const devices = createAudioDeviceSnapshot({
      running: true,
      asioSupported: true,
      asioDriverAvailable: true,
      current: {
        type: 'ASIO',
        name: 'ASIO4ALL v2',
        sampleRate: 44100,
        bufferSize: 512,
        inputChannels: 0,
        outputChannels: 2,
        outputLatencyMs: 13,
      },
      audioTypes: [{ type: 'ASIO', outputs: ['ASIO4ALL v2'], inputs: [] }],
    });
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot({
        devices,
        settings: createSavedAudioSettings({ type: 'ASIO', followDevice: false }),
      })
    );

    render(
      <AppProvider>
        <SettingsModal initialTab="audio" onClose={vi.fn()} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Seguir o dispositivo/ })).not.toBeChecked();
    });
  });
});
