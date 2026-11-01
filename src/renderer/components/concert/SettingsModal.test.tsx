import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../context/AppContext';
import { SettingsModal } from './SettingsModal';
import { createConcertState, createPreferences } from '../../../test/fixtures';

beforeEach(() => {
  localStorage.clear();
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
});
