import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ZynPanel } from './ZynPanel';

/**
 * Z0: documenta o comportamento atual do painel com os 1318 presets reais.
 *
 * O banco exibido é derivado de `program`; escolher outro banco só chama
 * `onProgram(primeiro)`. Enquanto a prop `program` não muda (porque o load
 * falhou ou ainda está carregando), a lista continua no banco antigo.
 * Este teste passa de propósito: ele é a prova do defeito. No Z1 ele será
 * substituído pelo teste do banco como estado da tela.
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

describe('ZynPanel — Z0 (comportamento atual)', () => {
  it('tem 1318 nomes e só troca a lista quando a prop program muda', () => {
    const names = realProgramNames();
    const banks = splitBanks(names);
    expect(names).toHaveLength(1318);
    expect(banks.length).toBeGreaterThan(10);

    const firstProgram = banks[0].entries[0].index;
    const onProgram = vi.fn();

    const renderStart = performance.now();
    const { rerender } = render(
      <ZynPanel
        params={[]}
        program={firstProgram}
        programNames={names}
        onChange={() => undefined}
        onProgram={onProgram}
        onImport={() => undefined}
      />
    );
    const renderMs = performance.now() - renderStart;

    const bank = screen.getByLabelText('Banco do Zyn');
    expect(bank).toHaveValue('0');

    fireEvent.change(bank, { target: { value: '5' } });
    expect(onProgram).toHaveBeenCalledWith(banks[5].entries[0].index);

    // Sem uma nova prop `program`, a tela continua no banco antigo. É o
    // sintoma que o Rafael vê quando o preset do banco novo não carrega.
    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('0');

    // Quando a prop muda (load concluído), a lista acompanha.
    const updateStart = performance.now();
    rerender(
      <ZynPanel
        params={[]}
        program={banks[5].entries[0].index}
        programNames={names}
        onChange={() => undefined}
        onProgram={onProgram}
        onImport={() => undefined}
      />
    );
    const updateMs = performance.now() - updateStart;
    expect(screen.getByLabelText('Banco do Zyn')).toHaveValue('5');

    // Proxy de jsdom, não pintura real no app (a confirmar).
    console.log(`[Z0] ZynPanel 1318 nomes: render ${renderMs.toFixed(1)} ms, troca de banco ${updateMs.toFixed(1)} ms`);
  });
});
