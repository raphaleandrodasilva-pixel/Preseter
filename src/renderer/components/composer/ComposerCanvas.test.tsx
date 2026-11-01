import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerCanvas } from './ComposerCanvas';
import { createElement } from '../../../test/fixtures';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    value: vi.fn(),
    configurable: true,
  });
});

function renderCanvas(overrides: Partial<React.ComponentProps<typeof ComposerCanvas>> = {}) {
  const onSelect = vi.fn();
  const props: React.ComponentProps<typeof ComposerCanvas> = {
    elements: [
      createElement({ id: 'a', type: 'knob', label: 'A', x: 10, y: 10, width: 80, height: 80 }),
      createElement({ id: 'b', type: 'knob', label: 'B', x: 120, y: 10, width: 80, height: 80 }),
    ],
    selectedId: null,
    selectedIds: [],
    armed: false,
    locked: false,
    interactivePreview: false,
    channel: 0,
    onCanvasClick: vi.fn(),
    onDropKey: vi.fn(),
    onSelect,
    onMove: vi.fn(),
    onResize: vi.fn(),
    onMidiMessage: vi.fn(),
    onSetVstParameter: vi.fn(),
    ...overrides,
  };
  const { container } = render(<ComposerCanvas {...props} />);
  return { props, onSelect, container: container.firstElementChild as HTMLElement };
}

describe('ComposerCanvas — seleção múltipla', () => {
  it('Shift+clique adiciona o controle à seleção', () => {
    const { onSelect } = renderCanvas();
    fireEvent.pointerDown(screen.getByText('B'), { shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith('b', true);
  });

  it('clique normal em um controle não selecionado vira seleção única', () => {
    const { onSelect } = renderCanvas();
    fireEvent.pointerDown(screen.getByText('B'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('clique normal em um controle já selecionado mantém a seleção múltipla', () => {
    const { onSelect } = renderCanvas({ selectedId: 'b', selectedIds: ['a', 'b'] });
    fireEvent.pointerDown(screen.getByText('B'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('clique no fundo limpa a seleção', () => {
    const { onSelect, container } = renderCanvas({ selectedId: 'a', selectedIds: ['a'] });
    fireEvent.click(container);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
