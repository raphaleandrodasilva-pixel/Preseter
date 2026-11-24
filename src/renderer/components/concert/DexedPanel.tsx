import React, { useMemo, useState } from 'react';
import type { EngineParameter } from '@shared/engine-protocol';
import { ChoiceButton, Knob } from './native-controls';

interface DexedPanelProps {
  params: EngineParameter[];
  /** Programa plano atual (banco * 32 + programa). */
  program: number;
  programNames: string[];
  onChange: (name: string, value: number) => void | Promise<void>;
  onProgram: (index: number) => void | Promise<void>;
  onImport: () => void | Promise<void>;
  importBusy?: boolean;
  importMessage?: string | null;
}

const PROGRAM_PER_BANK = 32;
const OPERATORS = [1, 2, 3, 4, 5, 6];

/** Remove o prefixo "OPn " do nome do parâmetro (o operador já está na aba). */
const shortName = (name: string): string => name.replace(/^OP\d\s*/i, '').trim();

const displayOf = (param: EngineParameter): string => {
  if (param.text && param.text.trim().length > 0) return param.text.trim();
  return `${Math.round(param.value * 100)}%`;
};

const DexedKnob: React.FC<{
  param: EngineParameter;
  onChange: (name: string, value: number) => void | Promise<void>;
}> = ({ param, onChange }) => (
  <Knob
    label={shortName(param.name)}
    value={param.value}
    display={displayOf(param)}
    onChange={(value) => void onChange(param.name, value)}
    onReset={() => void onChange(param.name, param.defaultValue)}
    step={param.stepCount > 0 ? 1 / param.stepCount : 0.01}
  />
);

interface Bank {
  label: string;
  names: string[];
}

const splitBanks = (names: string[]): Bank[] => {
  const banks: Bank[] = [];
  for (let start = 0; start < names.length; start += PROGRAM_PER_BANK) {
    const chunk = names.slice(start, start + PROGRAM_PER_BANK);
    const first = chunk[0] ?? '';
    const separator = first.indexOf(' · ');
    const label = separator > 0 ? first.slice(0, separator) : `Banco ${banks.length + 1}`;
    banks.push({
      label,
      names: chunk.map((name) => {
        const cut = name.indexOf(' · ');
        return cut >= 0 ? name.slice(cut + 3) : name;
      }),
    });
  }
  if (banks.length === 0) banks.push({ label: 'Banco 1', names: [] });
  return banks;
};

/**
 * Painel do Preseter Dexed.
 *
 * Os parâmetros vêm do AudioProcessor do Dexed (mesmos nomes do plugin) e são
 * agrupados por prefixo: globais e operadores OP1..OP6. Assim qualquer
 * parâmetro novo do motor aparece sem precisar de uma lista paralela.
 */
export const DexedPanel: React.FC<DexedPanelProps> = ({
  params,
  program,
  programNames,
  onChange,
  onProgram,
  onImport,
  importBusy = false,
  importMessage = null,
}) => {
  const [operator, setOperator] = useState(1);
  const banks = useMemo(() => splitBanks(programNames), [programNames]);

  const globals = useMemo(
    () => params.filter((param) => !/^OP\d/i.test(param.name)),
    [params]
  );
  const operatorParams = useMemo(
    () => params.filter((param) => param.name.toUpperCase().startsWith(`OP${operator}`)),
    [params, operator]
  );

  const bankIndex = Math.min(
    banks.length - 1,
    Math.max(0, Math.floor(program / PROGRAM_PER_BANK))
  );
  const bank = banks[bankIndex];
  const programInBank = Math.max(0, program % PROGRAM_PER_BANK);

  const chooseBank = (nextBank: number) => {
    void onProgram(nextBank * PROGRAM_PER_BANK + Math.min(programInBank, PROGRAM_PER_BANK - 1));
  };
  const chooseProgram = (nextProgram: number) => {
    void onProgram(bankIndex * PROGRAM_PER_BANK + nextProgram);
  };

  const algorithm = globals.find((param) => /algorithm/i.test(param.name));

  return (
    <div className="space-y-3">
      <section className="hw-inset p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-[10px]" style={{ color: '#9A9AA0' }}>
            Banco
            <select
              aria-label="Banco do Dexed"
              className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-white"
              value={bankIndex}
              onChange={(event) => chooseBank(Number(event.target.value))}
            >
              {banks.map((item, index) => (
                <option key={`${item.label}-${index}`} value={index}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-[2] text-[10px]" style={{ color: '#9A9AA0' }}>
            Programa
            <select
              aria-label="Programa do Dexed"
              className="hw-inset mt-1 w-full px-2 py-1.5 text-[11px] text-white"
              value={programInBank}
              onChange={(event) => chooseProgram(Number(event.target.value))}
            >
              {bank.names.map((name, index) => (
                <option key={`${index}-${name}`} value={index}>
                  {String(index + 1).padStart(2, '0')} · {name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-right">
            <div className="text-[9px]" style={{ color: '#8E8E93' }}>Algoritmo</div>
            <div className="text-2xl font-bold leading-none text-white">
              {algorithm ? (algorithm.text || Math.round(algorithm.value * 31 + 1)) : '—'}
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            disabled={importBusy}
            onClick={() => void onImport()}
          >
            {importBusy ? 'Importando…' : 'Importar cartucho .syx…'}
          </button>
        </div>
        {importMessage && (
          <p className="mt-2 text-[10px]" style={{ color: importMessage.startsWith('Erro') ? '#FF8A80' : '#7BE38F' }}>
            {importMessage}
          </p>
        )}
      </section>

      <section className="hw-inset p-3">
        <div className="hw-label mb-3">Global</div>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
          {globals.map((param) => (
            <DexedKnob key={param.index} param={param} onChange={onChange} />
          ))}
        </div>
      </section>

      <section className="hw-inset p-3">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="hw-label mr-2">Operador</span>
          {OPERATORS.map((value) => (
            <ChoiceButton key={value} active={operator === value} onClick={() => setOperator(value)}>
              OP{value}
            </ChoiceButton>
          ))}
        </div>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
          {operatorParams.map((param) => (
            <DexedKnob key={param.index} param={param} onChange={onChange} />
          ))}
          {operatorParams.length === 0 && (
            <p className="text-[10px]" style={{ color: '#8E8E93' }}>Sem parâmetros para este operador.</p>
          )}
        </div>
      </section>

      <p className="px-1 text-[9px] leading-relaxed" style={{ color: '#6E6E73' }}>
        Motor FM de 6 operadores baseado no Dexed 1.1.0 (Pascal Gauthier, GPL-3.0). Os cartuchos
        de fábrica e os arquivos .syx importados aparecem em Banco/Programa.
      </p>
    </div>
  );
};
