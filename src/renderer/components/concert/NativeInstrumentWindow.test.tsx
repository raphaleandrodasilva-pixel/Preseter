import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineParameter } from '@shared/engine-protocol';
import type { PresetPluginAssignment, VstPluginInfo } from '@shared/types';
import { AppProvider } from '../../context/AppContext';
import { NativeInstrumentWindow } from './NativeInstrumentWindow';
import { createConcertState } from '../../../test/fixtures';

const PIANO_PARAMS = [
  'Envelope Decay',
  'Envelope Release',
  'Hardness Offset',
  'Velocity to Hardness',
  'Muffling Filter',
  'Velocity to Muffling',
  'Velocity Sensitivity',
  'Stereo Width',
  'Polyphony',
  'Fine Tuning',
  'Random Detuning',
  'Stretch Tuning',
];

const DX_PARAMS = [
  'Attack',
  'Decay',
  'Release',
  'Coarse',
  'Fine',
  'Mod Init',
  'Mod Dec',
  'Mod Sus',
  'Mod Rel',
  'Mod Vel',
  'Vibrato',
  'Octave',
  'FineTune',
  'Waveform',
  'Mod Thru',
  'LFO Rate',
];

const JX_PARAMS = [
  'OSC Mix',
  'OSC Tune',
  'OSC Fine',
  'Mode',
  'Gld Rate',
  'Gld Bend',
  'VCF Freq',
  'VCF Reso',
  'VCF Env',
  'VCF LFO',
  'VCF Vel',
  'VCF Att',
  'VCF Dec',
  'VCF Sus',
  'VCF Rel',
  'ENV Att',
  'ENV Dec',
  'ENV Sus',
  'ENV Rel',
  'LFO Rate',
  'Vibrato',
  'Noise',
  'Octave',
  'Tuning',
];

function paramsOf(names: string[]): EngineParameter[] {
  return names.map((name, index) => ({
    index,
    id: String(index),
    name,
    label: '%',
    value: 0.5,
    defaultValue: 0.5,
    text: '50',
    stepCount: 0,
    automatable: true,
  }));
}

function assignmentFor(pluginId: string): PresetPluginAssignment {
  return {
    pluginId,
    layerId: 'patch:layer:0',
    name: `Layer ${pluginId}`,
    path: pluginId,
    role: 'instrument',
    minNote: 0,
    maxNote: 127,
    mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
  };
}

function pluginFor(pluginId: string, programNames: string[]): VstPluginInfo {
  return {
    id: pluginId,
    name: pluginId,
    path: pluginId,
    isLoaded: true,
    isInstrument: true,
    layerId: 'patch:layer:0',
    parameters: [],
    program: 0,
    programCount: programNames.length,
    programNames,
    manufacturer: 'Preseter',
    version: '1.0',
    category: 'Instrument',
    format: 'Native',
    arch: 'x64',
  };
}

function renderWindow(kind: 'piano' | 'dx' | 'jx', pluginId: string, names: string[]) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <AppProvider>
      <NativeInstrumentWindow
        kind={kind}
        layerId="patch:layer:0"
        assignment={assignmentFor(pluginId)}
        onClose={onClose}
        onSave={onSave}
      />
    </AppProvider>
  );
  return { onClose, onSave, parameters: paramsOf(names) };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
  vi.mocked(window.electronAPI.vstVoices).mockResolvedValue(0);
  vi.mocked(window.electronAPI.vstSetProgram).mockResolvedValue(null);
  vi.mocked(window.electronAPI.vstParams).mockResolvedValue([]);
});

describe('NativeInstrumentWindow — instrumentos MDA', () => {
  it('mostra as seções e os 12 knobs do Preseter Piano', async () => {
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(paramsOf(PIANO_PARAMS));
    vi.mocked(window.electronAPI.vstLoaded).mockResolvedValue([
      pluginFor('preseter.piano', ['mda Piano', 'Plain Piano']),
    ]);

    renderWindow('piano', 'preseter.piano', PIANO_PARAMS);

    expect(await screen.findByText('Preseter Piano')).toBeInTheDocument();
    expect(screen.getByText('Envelope')).toBeInTheDocument();
    expect(screen.getByText('Toque')).toBeInTheDocument();
    expect(screen.getByText('Estéreo e vozes')).toBeInTheDocument();
    expect(screen.getByText('Afinação')).toBeInTheDocument();
    expect(screen.getByLabelText('Decay')).toBeInTheDocument();
    expect(screen.getByLabelText('Muffling')).toBeInTheDocument();
    expect(screen.getByLabelText('Vel → Muffling')).toBeInTheDocument();
    expect(screen.getByLabelText('Stereo Width')).toBeInTheDocument();
    expect(screen.getByLabelText('Stretch tuning')).toBeInTheDocument();
  });

  it('manda o índice certo ao girar um knob e ao trocar o preset', async () => {
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(paramsOf(PIANO_PARAMS));
    vi.mocked(window.electronAPI.vstLoaded).mockResolvedValue([
      pluginFor('preseter.piano', ['mda Piano', 'Plain Piano']),
    ]);

    renderWindow('piano', 'preseter.piano', PIANO_PARAMS);

    const decay = await screen.findByLabelText('Decay');
    fireEvent.change(decay, { target: { value: '0.8' } });
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('patch:layer:0', '0', 0.8);
    });

    const preset = screen.getByLabelText('Preset do instrumento');
    expect(screen.getByText('mda Piano')).toBeInTheDocument();
    fireEvent.change(preset, { target: { value: '1' } });
    await waitFor(() => {
      expect(window.electronAPI.vstSetProgram).toHaveBeenCalledWith('patch:layer:0', 1);
    });
  });

  it('desenha as seções do DX10 e os 16 parâmetros', async () => {
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(paramsOf(DX_PARAMS));
    vi.mocked(window.electronAPI.vstLoaded).mockResolvedValue([
      pluginFor('preseter.dx', ['Bright E.Piano']),
    ]);

    renderWindow('dx', 'preseter.dx', DX_PARAMS);

    expect(await screen.findByText('Preseter DX10')).toBeInTheDocument();
    expect(screen.getByText('Postadora')).toBeInTheDocument();
    expect(screen.getByText('Modulador')).toBeInTheDocument();
    expect(screen.getByText('FM')).toBeInTheDocument();
    expect(screen.getByText('LFO e afinação')).toBeInTheDocument();
    for (const label of ['Attack', 'Decay', 'Release', 'Mod Init', 'Coarse', 'Waveform', 'LFO Rate']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('desenha as seções do JX10, os 24 parâmetros e o seletor de modo', async () => {
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(paramsOf(JX_PARAMS));
    vi.mocked(window.electronAPI.vstLoaded).mockResolvedValue([
      pluginFor('preseter.jx', ['5th Sweep Pad']),
    ]);

    renderWindow('jx', 'preseter.jx', JX_PARAMS);

    expect(await screen.findByText('Preseter JX10')).toBeInTheDocument();
    expect(screen.getByText('Osciladores')).toBeInTheDocument();
    expect(screen.getByText('Glide')).toBeInTheDocument();
    expect(screen.getByText('Filtro (VCF)')).toBeInTheDocument();
    expect(screen.getByText('Amplitude (ENV)')).toBeInTheDocument();
    for (const label of ['OSC Mix', 'OSC Tune', 'Gld Rate', 'VCF Freq', 'VCF Rel', 'ENV Att', 'Tuning']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('P-LEGATO')).toBeInTheDocument();
  });
});
