import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineParameter } from '@shared/engine-protocol';
import { findEffect, paramDefault, paramNormalized, paramPosition, positionToNormalized } from '@shared/effects/catalog';
import { AppProvider } from '../../context/AppContext';
import { PreseterEffectWindow } from './PreseterEffectWindow';
import { knobArcBackground } from './native-controls';
import { createConcertState } from '../../../test/fixtures';

const effect = findEffect('calfNXTReverb.vst3')!;

function engineParams (): EngineParameter[] {
  return effect.params.map((param) => ({
    index: param.index,
    id: String(param.index),
    name: param.engineName,
    label: param.unit,
    value: paramDefault(param),
    defaultValue: paramDefault(param),
    text: '',
    stepCount: 0,
    automatable: true,
  }));
}

function renderWindow (overrides: Partial<React.ComponentProps<typeof PreseterEffectWindow>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onOpenOriginal = vi.fn();
  render(
    <AppProvider>
      <PreseterEffectWindow
        ownerId="patch"
        slot={0}
        effect={effect}
        onClose={onClose}
        onSave={onSave}
        onOpenOriginal={onOpenOriginal}
        {...overrides}
      />
    </AppProvider>
  );
  return { onClose, onSave, onOpenOriginal };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
  vi.mocked(window.electronAPI.vstParams).mockResolvedValue(engineParams());
  vi.mocked(window.electronAPI.vstSetParam).mockResolvedValue(true);
});

describe('PreseterEffectWindow', () => {
  it('mostra a identidade Preseter, as seções e os knobs do reverb', async () => {
    renderWindow();

    expect(await screen.findByText('Preseter Reverb')).toBeInTheDocument();
    expect(screen.getByText('EFEITO')).toBeInTheDocument();
    expect(screen.getByText('CALFNXT')).toBeInTheDocument();
    expect(screen.getByText('Espaço')).toBeInTheDocument();
    expect(screen.getByText('Cor')).toBeInTheDocument();
    expect(screen.getByText('Dinâmica')).toBeInTheDocument();
    expect(screen.getByText('Avançado')).toBeInTheDocument();
    expect(screen.getByLabelText('Tamanho da sala')).toBeInTheDocument();
    expect(screen.getByLabelText('Decaimento')).toBeInTheDocument();
    expect(screen.getByText('calfnXT · GPL-3.0-or-later')).toBeInTheDocument();
  });

  it('aplica o preset de fábrica em todos os parâmetros do insert', async () => {
    renderWindow();

    const hall = await screen.findByRole('option', { name: 'Hall' });
    const select = screen.getByLabelText('Preset do efeito');
    fireEvent.change(select, { target: { value: hall.getAttribute('value') ?? 'hall' } });

    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledTimes(effect.paramCount);
    });
    // Decay é o índice 5 do schema do reverb.
    expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('patch', '5', expect.any(Number), 0);
  });

  it('manda o valor do knob com o slot do insert', async () => {
    renderWindow();

    const room = await screen.findByLabelText('Tamanho da sala');
    fireEvent.change(room, { target: { value: '0.5' } });
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('patch', '3', 0.5, 0);
    });
  });

  it('desenha o arco do knob a partir do mínimo (270°)', async () => {
    renderWindow();
    const param = effect.params.find((item) => item.label === 'Tamanho da sala')!;
    const room = await screen.findByLabelText('Tamanho da sala');
    const knob = room.parentElement as HTMLElement;
    const degrees = Math.round(paramPosition(param, paramDefault(param)) * 270);

    // jsdom não guarda `conic-gradient` no style: confere a geometria pela
    // função compartilhada e o ângulo aplicado ao DOM.
    expect(knobArcBackground(paramPosition(param, paramDefault(param)))).toContain('from -135deg');
    expect(knob.dataset.knobArc).toBe(String(degrees));
  });

  it('volta ao padrão do catálogo no duplo clique', async () => {
    renderWindow();
    const param = effect.params.find((item) => item.label === 'Tamanho da sala')!;
    const room = await screen.findByLabelText('Tamanho da sala');
    fireEvent.change(room, { target: { value: '0.9' } });
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('patch', '3', 0.9, 0);
    });
    vi.mocked(window.electronAPI.vstSetParam).mockClear();

    fireEvent.doubleClick(room);
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('patch', '3', paramDefault(param), 0);
    });
  });

  it('ajusta o knob com a roda do mouse', async () => {
    renderWindow();
    const param = effect.params.find((item) => item.label === 'Tamanho da sala')!;
    const room = await screen.findByLabelText('Tamanho da sala');
    const expected = positionToNormalized(param, Math.min(1, paramPosition(param, paramDefault(param)) + 0.01));

    fireEvent.wheel(room, { deltaY: -100 });
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalled();
    });
    const last = vi.mocked(window.electronAPI.vstSetParam).mock.calls.at(-1)!;
    expect(last[0]).toBe('patch');
    expect(last[1]).toBe('3');
    expect(last[2]).toBeCloseTo(expected, 5);
    expect(last[3]).toBe(0);
  });

  it('ajusta o knob arrastando para cima (Shift = fino)', async () => {
    renderWindow();
    const param = effect.params.find((item) => item.label === 'Tamanho da sala')!;
    const room = await screen.findByLabelText('Tamanho da sala');
    const knob = room.parentElement as HTMLElement;
    const start = paramPosition(param, paramDefault(param));

    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(knob, { clientY: 100, pointerId: 1 });

    const afterDrag = Math.min(1, start + 100 / 150);
    const expected = positionToNormalized(param, afterDrag);
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalled();
    });
    const last = vi.mocked(window.electronAPI.vstSetParam).mock.calls.at(-1)!;
    expect(last[1]).toBe('3');
    expect(last[2]).toBeCloseTo(expected, 5);

    vi.mocked(window.electronAPI.vstSetParam).mockClear();
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(knob, { clientY: 100, pointerId: 2, shiftKey: true });
    fireEvent.pointerUp(knob, { clientY: 100, pointerId: 2 });

    const fine = positionToNormalized(param, Math.min(1, afterDrag + (100 / 150) * 0.2));
    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalled();
    });
    const lastFine = vi.mocked(window.electronAPI.vstSetParam).mock.calls.at(-1)!;
    expect(lastFine[2]).toBeCloseTo(fine, 5);
  });

  it('aplica o valor digitado no campo numérico', async () => {
    renderWindow();
    const param = effect.params.find((item) => item.label === 'Tamanho da sala')!;
    const field = await screen.findByLabelText('Valor de Tamanho da sala');

    fireEvent.change(field, { target: { value: '20' } });
    fireEvent.blur(field);

    await waitFor(() => {
      expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith(
        'patch',
        '3',
        paramNormalized(param, 20),
        0
      );
    });
  });

  it('descarta o valor digitado ao apertar Esc', async () => {
    renderWindow();
    const field = await screen.findByLabelText('Valor de Tamanho da sala') as HTMLInputElement;

    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '20' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    // jsdom não tira o foco sozinho: simula o blur disparado pelo Escape.
    fireEvent.blur(field);

    await waitFor(() => expect(field.value).toBe('12.0'));
    expect(window.electronAPI.vstSetParam).not.toHaveBeenCalled();
  });

  it('salva o estado atual como preset do usuário', async () => {
    renderWindow();

    await screen.findByText('Preseter Reverb');
    fireEvent.click(screen.getByText('+ Preset'));
    expect(screen.getByRole('option', { name: 'Meu 1' })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(`preseter.effectPresets.v1.${effect.id}`) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0].values)).toHaveLength(effect.paramCount);
  });

  it('arma o learn com o botão direito e mostra o CC mapeado', async () => {
    const onLearnMapping = vi.fn();
    const onClearMapping = vi.fn();
    renderWindow({
      mappings: [
        {
          id: 'm1',
          source: { type: 'cc', channel: 0, controllerNumber: 74 },
          patchId: 'patch-1',
          pluginPath: 'C:/plugins/calfNXTReverb.vst3',
          parameterId: '5',
          paramOwner: 'patch',
          paramSlot: 0,
        },
      ],
      onLearnMapping,
      onClearMapping,
    });

    expect(await screen.findByText('CC 74')).toBeInTheDocument();
    fireEvent.click(screen.getByText('CC 74'));
    expect(onClearMapping).toHaveBeenCalledWith('5');

    fireEvent.contextMenu(screen.getByLabelText('Tamanho da sala'));
    expect(screen.getByText('aguardando CC…')).toBeInTheDocument();
    expect(screen.getByText(/Aguardando CC/)).toBeInTheDocument();
    expect(onLearnMapping).not.toHaveBeenCalled();
  });

  it('usa o badge GUITARIX e esconde o editor original quando não há UI', async () => {
    const guitarix = findEffect('GxTubeScreamer')!;
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(
      guitarix.params.map((param) => ({
        index: param.index,
        id: String(param.index),
        name: param.engineName,
        label: param.unit,
        value: paramDefault(param),
        defaultValue: paramDefault(param),
        text: '',
        stepCount: 0,
        automatable: true,
      }))
    );

    renderWindow({ effect: guitarix, ownerId: 'layer-1', slot: 1 });

    expect(await screen.findByText('Preseter Overdrive')).toBeInTheDocument();
    expect(screen.getByText('GUITARIX')).toBeInTheDocument();
    expect(screen.queryByText('Editor original')).toBeNull();
    expect(screen.getByLabelText('Drive')).toBeInTheDocument();
    expect(screen.getByText('Guitarix · GPL-3.0-or-later')).toBeInTheDocument();
    expect(screen.getByText(/usa o DSP do Guitarix \(GPL-3\.0-or-later\)/)).toBeInTheDocument();
  });

  it('mostra as escolhas do Amp como select com os rotulos do LV2', async () => {
    const amp = findEffect('GxAmplifier-X')!;
    vi.mocked(window.electronAPI.vstParams).mockResolvedValue(
      amp.params.map((param) => ({
        index: param.index,
        id: String(param.index),
        name: param.engineName,
        label: param.unit,
        value: paramDefault(param),
        defaultValue: paramDefault(param),
        text: '',
        stepCount: 0,
        automatable: true,
      }))
    );

    renderWindow({ effect: amp, ownerId: 'layer-1', slot: 1 });

    const select = await screen.findByLabelText('Modelo do amp');
    expect(select.tagName).toBe('SELECT');
    expect(select.querySelectorAll('option')).toHaveLength(19);
    expect(screen.getByRole('option', { name: '12AU7' })).toBeInTheDocument();
  });

  it('abre o editor original pelo rodapé', async () => {
    const { onOpenOriginal } = renderWindow();
    await screen.findByText('Preseter Reverb');
    fireEvent.click(screen.getByText('Editor original'));
    expect(onOpenOriginal).toHaveBeenCalled();
  });
});
