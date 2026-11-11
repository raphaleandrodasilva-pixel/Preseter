import React, { useEffect, useMemo, useState } from 'react';
import type {
  ExternalMidiConfig,
  ExternalMidiControl,
  ExternalMidiProgram,
} from '@shared/external-midi';
import {
  buildControlMessages,
  externalMidiControlRange,
  normalizeExternalMidiConfig,
} from '@shared/external-midi';

interface ExternalMidiEditorProps {
  title: string;
  initialName: string;
  initialConfig: ExternalMidiConfig | null;
  /** Nomes das saídas MIDI disponíveis. */
  ports: string[];
  /** Atualiza a lista de saídas (quando nenhuma foi encontrada). */
  onRefreshPorts?: () => Promise<unknown>;
  onSave: (name: string, config: ExternalMidiConfig) => void;
  onClose: () => void;
}

type ControlType = 'cc' | 'nrpn' | 'rpn' | 'sysex';

interface ControlDraft {
  id: string;
  name: string;
  type: ControlType;
  cc: number;
  msb: number;
  lsb: number;
  bits: 7 | 14;
  template: string;
  valueOffset: number;
  valueBytes: 1 | 2 | 3 | 4;
  min: number;
  max: number;
  default: number;
}

const inputClass = 'mt-0.5 w-full rounded px-2 py-1.5 text-[11px] outline-none';
const inputStyle: React.CSSProperties = {
  background: '#1F1F21',
  border: '1px solid #3A3A3C',
  color: '#E5E5EA',
};
const labelClass = 'block text-[10px]';
const labelStyle: React.CSSProperties = { color: '#9A9AA0' };

function nextId(): string {
  return `midi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromControl(control: ExternalMidiControl): ControlDraft {
  const message = control.message;
  const base = {
    id: control.id,
    name: control.name,
    min: control.min ?? 0,
    max: control.max ?? 127,
    default: control.default ?? control.min ?? 0,
  };

  if (message.type === 'cc') {
    return {
      ...base,
      type: 'cc',
      cc: message.cc,
      msb: 0,
      lsb: 0,
      bits: message.bits ?? 7,
      template: '',
      valueOffset: 1,
      valueBytes: 1,
    };
  }
  if (message.type === 'nrpn' || message.type === 'rpn') {
    return {
      ...base,
      type: message.type,
      cc: 0,
      msb: message.msb,
      lsb: message.lsb,
      bits: message.bits ?? 7,
      template: '',
      valueOffset: 1,
      valueBytes: 1,
    };
  }
  return {
    ...base,
    type: 'sysex',
    cc: 0,
    msb: 0,
    lsb: 0,
    bits: 7,
    template: message.template.map((byte) => byte.toString(16).padStart(2, '0')).join(' '),
    valueOffset: message.valueOffset,
    valueBytes: message.valueBytes ?? 1,
  };
}

function parseHex(value: string): number[] | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const bytes: number[] = [];
  for (const token of tokens) {
    if (!/^[0-9a-fA-F]{2}$/.test(token)) return null;
    bytes.push(parseInt(token, 16));
  }
  return bytes;
}

function controlFromDraft(draft: ControlDraft): ExternalMidiControl {
  const name = draft.name.trim() || 'Controle';
  const base = {
    id: draft.id,
    name,
    min: draft.min,
    max: draft.max,
    default: draft.default,
  };

  if (draft.type === 'cc') {
    return { ...base, message: { type: 'cc', cc: draft.cc, bits: draft.bits } };
  }
  if (draft.type === 'nrpn' || draft.type === 'rpn') {
    return {
      ...base,
      message: { type: draft.type, msb: draft.msb, lsb: draft.lsb, bits: draft.bits },
    };
  }

  const template = parseHex(draft.template);
  if (!template) {
    throw new Error(`O SysEx de "${name}" precisa ser hex (ex.: F0 43 10 F7).`);
  }
  return {
    ...base,
    message: {
      type: 'sysex',
      template,
      valueOffset: draft.valueOffset,
      valueBytes: draft.valueBytes,
    },
  };
}

export const ExternalMidiEditor: React.FC<ExternalMidiEditorProps> = ({
  title,
  initialName,
  initialConfig,
  ports,
  onRefreshPorts,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(initialName || 'MIDI externo');
  const [portName, setPortName] = useState(initialConfig?.portName ?? ports[0] ?? '');
  const [channel, setChannel] = useState(initialConfig?.channel ?? 0);
  const [bankMsb, setBankMsb] = useState(initialConfig?.program?.bankMsb?.toString() ?? '');
  const [bankLsb, setBankLsb] = useState(initialConfig?.program?.bankLsb?.toString() ?? '');
  const [program, setProgram] = useState(initialConfig?.program?.pc?.toString() ?? '');
  const [receiveNotes, setReceiveNotes] = useState(initialConfig?.receiveNotes !== false);
  const [controls, setControls] = useState<ControlDraft[]>(() =>
    (initialConfig?.controls ?? []).map(draftFromControl)
  );
  const [error, setError] = useState<string | null>(null);

  const portOptions = useMemo(() => {
    const unique = Array.from(new Set(ports.filter((port) => port.trim() !== '')));
    if (portName && !unique.includes(portName)) unique.unshift(portName);
    return unique;
  }, [ports, portName]);

  // Quando as portas chegam depois (ex.: usuário conectou o dispositivo e
  // clicou em Atualizar), seleciona a primeira automaticamente.
  useEffect(() => {
    if (portName || portOptions.length === 0) return;
    setPortName(portOptions[0]);
  }, [portName, portOptions]);

  const patchControl = (id: string, update: Partial<ControlDraft>) => {
    setControls((previous) => previous.map((item) => (item.id === id ? { ...item, ...update } : item)));
  };

  const addControl = () => {
    setControls((previous) => [
      ...previous,
      {
        id: nextId(),
        name: `Controle ${previous.length + 1}`,
        type: 'cc',
        cc: 74,
        msb: 0,
        lsb: 0,
        bits: 7,
        template: 'F0 43 10 4C 00 00 00 00 F7',
        valueOffset: 4,
        valueBytes: 1,
        min: 0,
        max: 127,
        default: 64,
      },
    ]);
  };

  const removeControl = (id: string) => {
    setControls((previous) => previous.filter((item) => item.id !== id));
  };

  const handleSave = () => {
    setError(null);
    const trimmedPort = portName.trim();
    if (!trimmedPort) {
      setError('Escolha uma porta MIDI de saída.');
      return;
    }

    let parsedControls: ExternalMidiControl[];
    try {
      parsedControls = controls.map(controlFromDraft);
      // Valida cada controle com o mesmo construtor usado ao vivo.
      parsedControls.forEach((control) => {
        buildControlMessages(control, control.default ?? control.min ?? 0, channel);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Controle MIDI inválido.');
      return;
    }

    const programConfig: ExternalMidiProgram = {};
    if (bankMsb.trim() !== '') programConfig.bankMsb = Number(bankMsb);
    if (bankLsb.trim() !== '') programConfig.bankLsb = Number(bankLsb);
    if (program.trim() !== '') programConfig.pc = Number(program);

    const values: Record<string, number> = {};
    for (const control of parsedControls) {
      const range = externalMidiControlRange(control);
      values[control.id] = control.default ?? range.default;
    }

    const config = normalizeExternalMidiConfig({
      portName: trimmedPort,
      channel,
      program: Object.keys(programConfig).length > 0 ? programConfig : undefined,
      receiveNotes: receiveNotes ? undefined : false,
      controls: parsedControls,
      values: initialConfig?.values
        ? { ...initialConfig.values, ...values }
        : values,
    });

    if (!config) {
      setError('Confira a porta, o canal e os controles.');
      return;
    }

    onSave(name.trim() || 'MIDI externo', config);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="MIDI externo"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[88vh] w-full max-w-[760px] overflow-auto rounded-xl border p-4 shadow-2xl"
        style={{ background: '#1F1F21', borderColor: '#3A3A3C' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-white">{title}</h3>
            <p className="mt-1 text-[10px]" style={{ color: '#9A9AA0' }}>
              O timbre envia banco, programa e os controles para a porta escolhida.
              Nada é enviado se o MIDI externo estiver desligado nas Configurações.
            </p>
          </div>
          <button
            className="rounded px-2 py-1 text-xs"
            style={{ color: '#9A9AA0' }}
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={labelClass} style={labelStyle}>
            Nome do timbre
            <input
              className={inputClass}
              style={inputStyle}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Motif Part 1"
            />
          </label>
          <label className={labelClass} style={labelStyle}>
            Porta MIDI
            <select
              className={inputClass}
              style={inputStyle}
              value={portName}
              onChange={(event) => setPortName(event.target.value)}
            >
              {portOptions.length === 0 && <option value="">Nenhuma saída encontrada</option>}
              {portOptions.map((port) => (
                <option key={port} value={port}>{port}</option>
              ))}
            </select>
          </label>
          <label className={labelClass} style={labelStyle}>
            Canal (1–16)
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min={1}
              max={16}
              value={channel + 1}
              onChange={(event) => setChannel(Math.max(0, Math.min(15, Number(event.target.value) - 1)))}
            />
          </label>
          <div />
          <label className={labelClass} style={labelStyle}>
            Banco MSB (CC0)
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min={0}
              max={127}
              value={bankMsb}
              onChange={(event) => setBankMsb(event.target.value)}
              placeholder="—"
            />
          </label>
          <label className={labelClass} style={labelStyle}>
            Banco LSB (CC32)
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min={0}
              max={127}
              value={bankLsb}
              onChange={(event) => setBankLsb(event.target.value)}
              placeholder="—"
            />
          </label>
          <label className={labelClass} style={labelStyle}>
            Programa (PC 0–127)
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min={0}
              max={127}
              value={program}
              onChange={(event) => setProgram(event.target.value)}
              placeholder="—"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: '#C6C6CB' }}>
          <input
            type="checkbox"
            style={{ accentColor: '#0A84FF' }}
            checked={receiveNotes}
            onChange={(event) => setReceiveNotes(event.target.checked)}
          />
          Receber notas e performance do teclado
        </label>

        {portOptions.length === 0 && (
          <div
            className="mt-3 rounded-lg border px-3 py-2 text-[11px]"
            style={{ borderColor: '#3A3A3C', color: '#9A9AA0' }}
          >
            Nenhuma saída MIDI encontrada. Conecte o dispositivo e atualize.
            {onRefreshPorts && (
              <button
                className="ml-2 underline"
                style={{ color: '#0A84FF' }}
                onClick={() => void onRefreshPorts()}
              >
                Atualizar dispositivos
              </button>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <h4 className="hw-label">Controles</h4>
          <button
            className="rounded px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: '#0A84FF', color: '#FFFFFF' }}
            onClick={addControl}
          >
            + Adicionar controle
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {controls.length === 0 && (
            <p className="text-[11px]" style={{ color: '#9A9AA0' }}>
              Nenhum controle. Adicione um knob e escolha o comando MIDI (ex.: CC 74 para cutoff).
            </p>
          )}
          {controls.map((control, index) => (
            <div
              key={control.id}
              className="rounded-lg border p-2"
              style={{ background: '#18181A', borderColor: '#3A3A3C' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold" style={{ color: '#8E8E93' }}>
                  #{index + 1}
                </span>
                <input
                  className={`${inputClass} mt-0 flex-1`}
                  style={inputStyle}
                  value={control.name}
                  onChange={(event) => patchControl(control.id, { name: event.target.value })}
                  placeholder="Cutoff"
                />
                <select
                  className={`${inputClass} mt-0 w-[90px]`}
                  style={inputStyle}
                  value={control.type}
                  onChange={(event) => patchControl(control.id, { type: event.target.value as ControlType })}
                >
                  <option value="cc">CC</option>
                  <option value="nrpn">NRPN</option>
                  <option value="rpn">RPN</option>
                  <option value="sysex">SysEx</option>
                </select>
                <button
                  className="rounded px-1.5 py-1 text-xs"
                  style={{ color: '#FF8A80' }}
                  onClick={() => removeControl(control.id)}
                  title="Remover controle"
                >
                  🗑
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                {control.type === 'cc' && (
                  <>
                    <label className={labelClass} style={labelStyle}>
                      CC
                      <input
                        className={inputClass}
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={127}
                        value={control.cc}
                        onChange={(event) => patchControl(control.id, { cc: Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass} style={labelStyle}>
                      Bits
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={control.bits}
                        onChange={(event) => patchControl(control.id, {
                          bits: Number(event.target.value) === 14 ? 14 : 7,
                        })}
                      >
                        <option value={7}>7 bits</option>
                        <option value={14}>14 bits</option>
                      </select>
                    </label>
                  </>
                )}

                {(control.type === 'nrpn' || control.type === 'rpn') && (
                  <>
                    <label className={labelClass} style={labelStyle}>
                      MSB
                      <input
                        className={inputClass}
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={127}
                        value={control.msb}
                        onChange={(event) => patchControl(control.id, { msb: Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass} style={labelStyle}>
                      LSB
                      <input
                        className={inputClass}
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={127}
                        value={control.lsb}
                        onChange={(event) => patchControl(control.id, { lsb: Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass} style={labelStyle}>
                      Bits
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={control.bits}
                        onChange={(event) => patchControl(control.id, {
                          bits: Number(event.target.value) === 14 ? 14 : 7,
                        })}
                      >
                        <option value={7}>7 bits</option>
                        <option value={14}>14 bits</option>
                      </select>
                    </label>
                  </>
                )}

                {control.type === 'sysex' && (
                  <>
                    <label className={`${labelClass} col-span-2 sm:col-span-3`} style={labelStyle}>
                      Template hex
                      <input
                        className={inputClass}
                        style={inputStyle}
                        value={control.template}
                        onChange={(event) => patchControl(control.id, { template: event.target.value })}
                        placeholder="F0 43 10 4C 00 00 00 00 F7"
                      />
                    </label>
                    <label className={labelClass} style={labelStyle}>
                      Offset do valor
                      <input
                        className={inputClass}
                        style={inputStyle}
                        type="number"
                        min={1}
                        value={control.valueOffset}
                        onChange={(event) => patchControl(control.id, { valueOffset: Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass} style={labelStyle}>
                      Bytes do valor
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={control.valueBytes}
                        onChange={(event) => patchControl(control.id, {
                          valueBytes: Number(event.target.value) as 1 | 2 | 3 | 4,
                        })}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </label>
                  </>
                )}

                <label className={labelClass} style={labelStyle}>
                  Mín.
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="number"
                    value={control.min}
                    onChange={(event) => patchControl(control.id, { min: Number(event.target.value) })}
                  />
                </label>
                <label className={labelClass} style={labelStyle}>
                  Máx.
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="number"
                    value={control.max}
                    onChange={(event) => patchControl(control.id, { max: Number(event.target.value) })}
                  />
                </label>
                <label className={labelClass} style={labelStyle}>
                  Padrão
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="number"
                    value={control.default}
                    onChange={(event) => patchControl(control.id, { default: Number(event.target.value) })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-[11px] text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: '#3A3A3C', color: '#E5E5EA' }}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="rounded px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: '#0A84FF', color: '#FFFFFF' }}
            onClick={handleSave}
          >
            Salvar timbre
          </button>
        </div>
      </div>
    </div>
  );
};
