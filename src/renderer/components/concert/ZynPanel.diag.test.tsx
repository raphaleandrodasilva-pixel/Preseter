import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ZynPanel } from './ZynPanel';

/**
 * Z1: banco e lista com os 1318 presets reais.
 *
 * O banco escolhido é estado da tela (só filtra). Trocar de programa não muda
 * o banco, e uma atualização do plugin não volta a lista para o banco antigo.
 */
function realProgramNames(): string[] {
  const root = path.join(process.cwd(), 'vendor', 'zyn', 'banks');
  const names: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().endsWith('.xiz')) {
        const relative = path.relative(root, path.dirname(full)).replace(/\\/g, '/');
        const bank = relative ? `Fábrica/${relative}` : 'Fábrica';
        names.push(`${bank} · ${path.basename(entry.name, '.xiz')}`);
      }
    }
  };

  walk(root);
  return names.sort(new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare);
}

const splitBanks = (names: string[]) => {
  const banks: Array<{ label: string; entries: Array<{ index: number; name: string }> }> = [];
  for (let index = 0; index < names.length; index += 1) {
    const full = names[index] ?? '';
    const separator = full.indexOf(' · ');
    const label = separator > 0 ? full.slice(0, separator) : 'Presets';
    const name = separator >= 0 ? full.slice(separator + 3) : full;
    const last = banks[banks.length - 1];
    if (!last || last.label !== label) banks.push({ label, entries: [{ index, name }] });
    else last.entries.push({ index, name });
  }
  return banks;
};

const names = realProgramNames();
const banks = splitBanks(names);

const renderPanel = (overrides: Partial<React.ComponentProps<typeof ZynPanel>> = {}) => {
  const onProgram = vi.fn(async () => undefined);
  const result = render(
    <ZynPanel
      params={[]}
      program={banks[0].entries[0].index}
      programNames={names}
      onChange={() => undefined}
      onProgram={onProgram}
      onImport={() => undefined}
      {...overrides}
    />
  );
  return { ...result, onProgram };
};

describe('ZynPanel — banco e programa (Z1)', () => {
  it('tem 1318 nomes e troca a lista na hora ao escolher o banco', () => {
    expect(names).toHaveLength(1318);
    expect(banks.length).toBeGreaterThan(10);

    const { onProgram } = renderPanel();
    const bank = screen.getByLabelText('Banco do Zyn');
    expect(bank).toHaveValue('0');

    fireEvent.change(bank, { target: { value: '5' } });

    // Escolher banco não dispara carga; só filtra.
    expect(onProgram).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('5');
    expect(screen.getByRole('option', { name: banks[5].entries[0].name })).toBeInTheDocument();
    expect(screen.getByText(`${banks[5].entries.length} programas`)).toBeInTheDocument();
  });

  it('trocar de programa não muda o banco escolhido', () => {
    const { onProgram } = renderPanel();
    fireEvent.change(screen.getByLabelText('Banco do Zyn'), { target: { value: '5' } });

    const target = banks[5].entries[1] ?? banks[5].entries[0];
    fireEvent.change(screen.getByLabelText('Programa do Zyn'), {
      target: { value: String(target.index) },
    });

    expect(onProgram).toHaveBeenCalledWith(target.index);
    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('5');
  });

  it('a seleção do banco sobrevive a uma atualização do plugin', () => {
    const { rerender, onProgram } = renderPanel();
    fireEvent.change(screen.getByLabelText('Banco do Zyn'), { target: { value: '5' } });
    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('5');

    // O plugin volta com o programa antigo (banco 0); a tela não deve voltar.
    rerender(
      <ZynPanel
        params={[]}
        program={banks[0].entries[0].index}
        programNames={names}
        onChange={() => undefined}
        onProgram={onProgram}
        onImport={() => undefined}
      />
    );

    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('5');
  });

  it('busca pelo nome dentro do banco escolhido', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Banco do Zyn'), { target: { value: '5' } });

    const first = banks[5].entries[0].name;
    const query = first.slice(0, Math.min(5, first.length));
    fireEvent.change(screen.getByLabelText('Buscar programa do Zyn'), {
      target: { value: query },
    });

    const expected = banks[5].entries.filter((entry) =>
      entry.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
    ).length;
    expect(screen.getByText(`${expected} de ${banks[5].entries.length} programas`)).toBeInTheDocument();
  });

  it('fila de 1: a última escolha vence e mostra Carregando…', async () => {
    let releaseFirst: (() => void) | null = null;
    let calls = 0;
    const onProgram = vi.fn((_index: number) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<void>((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve();
    });

    renderPanel({ onProgram });
    const bank = screen.getByLabelText('Banco do Zyn');
    fireEvent.change(bank, { target: { value: '5' } });

    const first = banks[5].entries[0];
    const last = banks[5].entries[2] ?? banks[5].entries[1];
    fireEvent.change(screen.getByLabelText('Programa do Zyn'), { target: { value: String(first.index) } });
    expect(onProgram).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Carregando…')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Programa do Zyn'), { target: { value: String(last.index) } });
    // Ainda está carregando o primeiro; o segundo fica na fila.
    expect(onProgram).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(releaseFirst).not.toBeNull());
    releaseFirst?.();
    await waitFor(() => expect(onProgram).toHaveBeenCalledTimes(2));
    expect(onProgram).toHaveBeenLastCalledWith(last.index);
  });
});
