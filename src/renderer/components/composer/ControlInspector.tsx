import React, { useEffect, useState } from 'react';
import type { Preset, UiElement, VstPluginInfo } from '@shared/types';
import { useAppContext } from '../../context/AppContext';
import type { RawMidiEvent } from '../../services/WebMidiService';
import { armParameterLearn } from '../../services/parameter-learn';
import { noteName } from './elementFactory';

interface ControlInspectorProps {
  element: UiElement | null;
  draft: Preset;
  scannedPlugins: VstPluginInfo[];
  onUpdate: (id: string, patch: Partial<UiElement>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBringFront: (id: string) => void;
  onSendBack: (id: string) => void;
}

const classInput =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400';
const classLabel = 'block text-[11px] text-slate-400';
const classTitle = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

type BindingType = 'none' | 'cc' | 'note' | 'pc' | 'pitch' | 'aftertouch';

function currentBindingType(element: UiElement): BindingType {
  const type = element.midiCommand?.type;
  return type === 'cc' || type === 'note' || type === 'pc' || type === 'pitch' || type === 'aftertouch'
    ? type
    : 'none';
}

export const ControlInspector: React.FC<ControlInspectorProps> = ({
  element,
  draft,
  scannedPlugins,
  onUpdate,
  onRemove,
  onDuplicate,
  onBringFront,
  onSendBack,
}) => {
  const { midiDevices, listMidiDevices, subscribeMidiLearn } = useAppContext();
  const [learning, setLearning] = useState(false);

  useEffect(() => {
    void listMidiDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!learning || !element) return;
    const apply = (evt: RawMidiEvent) => {
      if (evt.kind === 'note' && evt.value === 0) return;
      if (evt.kind === 'note') {
        onUpdate(element.id, {
          midiCommand: { type: 'note', channel: evt.channel, controllerNumber: evt.number },
          noteNumber: evt.number,
          velocity: Math.max(1, evt.value),
        });
      } else if (evt.kind === 'cc') {
        onUpdate(element.id, {
          midiCommand: { type: 'cc', channel: evt.channel, controllerNumber: evt.number, min: 0, max: 127 },
        });
      } else if (evt.kind === 'pc') {
        onUpdate(element.id, {
          midiCommand: { type: 'pc', channel: evt.channel, programNumber: evt.number },
        });
      } else if (evt.kind === 'pitch') {
        onUpdate(element.id, {
          midiCommand: { type: 'pitch', channel: evt.channel },
        });
      } else {
        onUpdate(element.id, {
          midiCommand: { type: 'aftertouch', channel: evt.channel, controllerNumber: evt.number },
        });
      }
      setLearning(false);
    };
    const unsubscribe = subscribeMidiLearn(apply);
    const timer = window.setTimeout(() => setLearning(false), 15000);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning, element?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!element) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setLearning((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [element?.id]);

  if (!element) {
    return (
      <div className="rounded border border-slate-800 p-3 text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-400">Screen Control Inspector</span>
        <br />
        Selecione um controle no canvas para ver Hardware Input, aparência e mapeamentos.
      </div>
    );
  }

  const bindingType = currentBindingType(element);
  const inputs = midiDevices.filter((d) => d.type === 'input');
  const bindingNumber =
    bindingType === 'pc'
      ? element.midiCommand?.programNumber ?? ''
      : element.midiCommand?.controllerNumber ?? '';

  const setBindingType = (next: BindingType) => {
    if (next === 'none') {
      onUpdate(element.id, { midiCommand: undefined });
      return;
    }
    if (next === 'cc') {
      onUpdate(element.id, {
        midiCommand: { type: 'cc', channel: draft.midiChannel, controllerNumber: element.midiCommand?.controllerNumber ?? 1, min: 0, max: 127 },
      });
    } else if (next === 'note') {
      const note = element.noteNumber ?? element.midiCommand?.controllerNumber ?? 60;
      onUpdate(element.id, {
        midiCommand: { type: 'note', channel: draft.midiChannel, controllerNumber: note },
        noteNumber: note,
      });
    } else if (next === 'pc') {
      onUpdate(element.id, {
        midiCommand: { type: 'pc', channel: draft.midiChannel, programNumber: draft.programNumber },
      });
    } else if (next === 'pitch') {
      onUpdate(element.id, {
        midiCommand: { type: 'pitch', channel: draft.midiChannel },
      });
    } else if (next === 'aftertouch') {
      onUpdate(element.id, {
        midiCommand: { type: 'aftertouch', channel: draft.midiChannel, controllerNumber: 0 },
      });
    }
  };

  const setBindingChannel = (channel1to16: number) => {
    const channel = Math.max(0, Math.min(15, channel1to16 - 1));
    if (element.midiCommand) {
      onUpdate(element.id, { midiCommand: { ...element.midiCommand, channel } });
    }
  };

  const setBindingNumber = (raw: string) => {
    if (raw === '') return;
    const number = Math.max(0, Math.min(127, Number(raw) || 0));
    if (bindingType === 'cc') {
      onUpdate(element.id, { midiCommand: { ...(element.midiCommand as object), type: 'cc', channel: draft.midiChannel, controllerNumber: number, min: 0, max: 127 } as UiElement['midiCommand'] });
    } else if (bindingType === 'note') {
      onUpdate(element.id, {
        midiCommand: { ...(element.midiCommand as object), type: 'note', channel: draft.midiChannel, controllerNumber: number } as UiElement['midiCommand'],
        noteNumber: number,
      });
    } else if (bindingType === 'pc') {
      onUpdate(element.id, {
        midiCommand: { ...(element.midiCommand as object), type: 'pc', channel: draft.midiChannel, programNumber: number } as UiElement['midiCommand'],
      });
    } else if (bindingType === 'aftertouch') {
      onUpdate(element.id, {
        midiCommand: { ...(element.midiCommand as object), type: 'aftertouch', channel: draft.midiChannel, controllerNumber: number } as UiElement['midiCommand'],
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={classTitle}>Screen Control Inspector</h2>
        <button className="text-[11px] text-red-300 hover:text-red-200" onClick={() => onRemove(element.id)}>
          Remover
        </button>
      </div>

      <section className="space-y-2">
        <h3 className={classTitle}>Hardware Input</h3>
        <button
          onClick={() => setLearning((v) => !v)}
          className={`w-full rounded border px-2 py-1.5 text-xs font-semibold ${
            learning
              ? 'animate-pulse border-amber-300 bg-amber-300/15 text-amber-200'
              : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-300'
          }`}
          title="Toque um controle físico para vincular"
        >
          {learning ? 'Ouvindo… toque um controle' : 'Assign (MIDI Learn)'}
        </button>
        <label className={classLabel}>MIDI Port
          <select
            className={`${classInput} mt-1`}
            value={element.midiPort ?? ''}
            onChange={(event) => onUpdate(element.id, { midiPort: event.target.value || undefined })}
          >
            <option value="">Qualquer entrada</option>
            {inputs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={classLabel}>Channel
            <select
              className={`${classInput} mt-1`}
              value={(element.midiCommand?.channel ?? draft.midiChannel) + 1}
              onChange={(event) => setBindingChannel(Number(event.target.value))}
              title="Escolha o Type antes para vincular o canal"
            >
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
          <label className={classLabel}>Type
            <select
              className={`${classInput} mt-1`}
              value={bindingType}
              onChange={(event) => setBindingType(event.target.value as BindingType)}
            >
              <option value="none">Unassigned</option>
              <option value="cc">Control Change</option>
              <option value="note">Note On/Off</option>
              <option value="pc">Program Change</option>
              <option value="pitch">Pitch Bend</option>
              <option value="aftertouch">Aftertouch</option>
            </select>
          </label>
        </div>
        <label className={classLabel}>Number
          <input
            className={`${classInput} mt-1`}
            type="number"
            min={0}
            max={127}
            value={bindingNumber}
            disabled={bindingType === 'none' || bindingType === 'pitch'}
            onChange={(event) => setBindingNumber(event.target.value)}
          />
        </label>
        {bindingType === 'note' && typeof bindingNumber === 'number' && (
          <p className="text-[11px] text-slate-500">Nota: {noteName(bindingNumber)} · velocity {element.velocity ?? 100}</p>
        )}
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            className="accent-amber-300"
            checked={element.midiThru !== false}
            onChange={(event) => onUpdate(element.id, { midiThru: event.target.checked })}
          />
          Pass thru (MIDI Thru) — desmarque para Don’t pass thru
        </label>
        <label className={classLabel}>Respond to Hardware Move
          <select
            className={`${classInput} mt-1`}
            value={element.respondToHardwareMove ?? 'jump'}
            onChange={(event) => onUpdate(element.id, {
              respondToHardwareMove: event.target.value as UiElement['respondToHardwareMove'],
            })}
          >
            <option value="jump">Jump</option>
            <option value="pickup">Pickup</option>
            <option value="relative">Relative</option>
          </select>
        </label>
      </section>

      <section className="space-y-2">
        <h3 className={classTitle}>Send Value to (plugin)</h3>
        <button
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-300"
          onClick={() => armParameterLearn(element.id)}
          title="Depois clique no parâmetro do plugin no channel strip"
        >
          Aprender parâmetro (clique no channel strip)
        </button>
        <label className={classLabel}>Plugin
          <select
            className={`${classInput} mt-1`}
            value={element.pluginPath ?? ''}
            onChange={(event) =>
              onUpdate(element.id, { pluginPath: event.target.value || undefined, pluginId: undefined, parameterId: undefined })
            }
          >
            <option value="">Nenhum</option>
            {(draft.plugins ?? []).map((plugin) => (
              <option key={plugin.path} value={plugin.path}>{plugin.name}</option>
            ))}
          </select>
        </label>
        {element.pluginPath && (
          <label className={classLabel}>Parâmetro
            <select
              className={`${classInput} mt-1`}
              value={element.parameterId ?? ''}
              onChange={(event) => onUpdate(element.id, { parameterId: event.target.value || undefined })}
            >
              <option value="">Selecione parâmetro</option>
              {scannedPlugins
                .find((plugin) => plugin.path === element.pluginPath)
                ?.parameters.map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
                ))}
            </select>
          </label>
        )}
        {element.pluginPath && element.parameterId && (
          <div className="grid grid-cols-2 gap-2">
            <label className={classLabel}>Mínimo (%)
              <input
                className={`${classInput} mt-1`}
                type="number"
                min={0}
                max={100}
                value={Math.round((element.mappingMin ?? 0) * 100)}
                onChange={(event) => onUpdate(element.id, {
                  mappingMin: Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100,
                })}
              />
            </label>
            <label className={classLabel}>Máximo (%)
              <input
                className={`${classInput} mt-1`}
                type="number"
                min={0}
                max={100}
                value={Math.round((element.mappingMax ?? 1) * 100)}
                onChange={(event) => onUpdate(element.id, {
                  mappingMax: Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100,
                })}
              />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className={classTitle}>Settings</h3>
        <label className={classLabel}>Name
          <input
            className={`${classInput} mt-1`}
            value={element.label}
            onChange={(event) => onUpdate(element.id, { label: event.target.value })}
          />
        </label>
        <label className={classLabel}>Seção do palco
          <select
            className={`${classInput} mt-1`}
            value={element.section ?? ''}
            onChange={(event) => onUpdate(element.id, { section: (event.target.value || undefined) as UiElement['section'] })}
          >
            <option value="">Livre (canvas)</option>
            <option value="instrument">Instrument</option>
            <option value="effects">Effects</option>
            <option value="tone">Tone</option>
            <option value="output">Output</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={classLabel}>Largura
            <input
              className={`${classInput} mt-1`}
              type="number"
              min={32}
              value={element.width}
              onChange={(event) => onUpdate(element.id, { width: Math.max(32, Number(event.target.value) || 32) })}
            />
          </label>
          <label className={classLabel}>Altura
            <input
              className={`${classInput} mt-1`}
              type="number"
              min={24}
              value={element.height}
              onChange={(event) => onUpdate(element.id, { height: Math.max(24, Number(event.target.value) || 24) })}
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className={classTitle}>Appearance</h3>
        <label className={classLabel}>Color
          <span className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(element.color) ? element.color : '#d1ae37'}
              onChange={(event) => onUpdate(element.id, { color: event.target.value })}
              className="h-7 w-12 cursor-pointer rounded border border-slate-700 bg-slate-950"
            />
            <span className="text-[11px] text-slate-500">{element.color}</span>
          </span>
        </label>
      </section>

      <section className="space-y-2">
        <h3 className={classTitle}>Text Labels</h3>
        <label className={classLabel}>Display
          <select
            className={`${classInput} mt-1`}
            value={element.labelDisplay ?? 'name'}
            onChange={(event) => onUpdate(element.id, { labelDisplay: event.target.value as UiElement['labelDisplay'] })}
          >
            <option value="name">Nome</option>
            <option value="value">Valor</option>
            <option value="both">Nome + valor</option>
          </select>
        </label>
      </section>

      {element.type === 'keyboard' && (
        <section className="space-y-2">
          <h3 className={classTitle}>Teclado</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className={classLabel}>Channel
              <select
                className={`${classInput} mt-1`}
                value={(element.keyboardChannel ?? draft.midiChannel) + 1}
                onChange={(event) =>
                  onUpdate(element.id, { keyboardChannel: Math.max(0, Math.min(15, Number(event.target.value) - 1)) })
                }
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>
            <label className={classLabel}>Velocity
              <input
                className={`${classInput} mt-1`}
                type="number"
                min={1}
                max={127}
                value={element.velocity ?? 100}
                onChange={(event) =>
                  onUpdate(element.id, { velocity: Math.max(1, Math.min(127, Number(event.target.value) || 100)) })
                }
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={classLabel}>Nota grave
              <input
                className={`${classInput} mt-1`}
                type="number"
                min={0}
                max={127}
                value={element.keyboardLow ?? 36}
                onChange={(event) => {
                  const low = Math.max(0, Math.min(127, Number(event.target.value) || 0));
                  onUpdate(element.id, { keyboardLow: Math.min(low, (element.keyboardHigh ?? 84) - 1) });
                }}
              />
            </label>
            <label className={classLabel}>Nota aguda
              <input
                className={`${classInput} mt-1`}
                type="number"
                min={0}
                max={127}
                value={element.keyboardHigh ?? 84}
                onChange={(event) => {
                  const high = Math.max(0, Math.min(127, Number(event.target.value) || 0));
                  onUpdate(element.id, { keyboardHigh: Math.max(high, (element.keyboardLow ?? 36) + 1) });
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            Faixa: {noteName(element.keyboardLow ?? 36)} – {noteName(element.keyboardHigh ?? 84)}
          </p>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-amber-300"
              checked={element.keyboardSplit !== null && element.keyboardSplit !== undefined}
              onChange={(event) =>
                onUpdate(element.id, { keyboardSplit: event.target.checked ? 60 : null })
              }
            />
            Split de layers
          </label>
          {element.keyboardSplit !== null && element.keyboardSplit !== undefined && (
            <>
              <label className={classLabel}>Nota do split ({noteName(element.keyboardSplit)})
                <input
                  className={`${classInput} mt-1`}
                  type="number"
                  min={0}
                  max={127}
                  value={element.keyboardSplit}
                  onChange={(event) =>
                    onUpdate(element.id, { keyboardSplit: Math.max(0, Math.min(127, Number(event.target.value) || 60)) })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={classLabel}>Nome grave
                  <input
                    className={`${classInput} mt-1`}
                    value={element.keyboardLowerLabel ?? 'Lower'}
                    onChange={(event) => onUpdate(element.id, { keyboardLowerLabel: event.target.value })}
                  />
                </label>
                <label className={classLabel}>Nome agudo
                  <input
                    className={`${classInput} mt-1`}
                    value={element.keyboardUpperLabel ?? 'Upper'}
                    onChange={(event) => onUpdate(element.id, { keyboardUpperLabel: event.target.value })}
                  />
                </label>
                <label className={classLabel}>Cor grave
                  <input
                    type="color"
                    value={element.keyboardLowerColor ?? '#c9a227'}
                    onChange={(event) => onUpdate(element.id, { keyboardLowerColor: event.target.value })}
                    className="mt-1 h-7 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
                  />
                </label>
                <label className={classLabel}>Cor aguda
                  <input
                    type="color"
                    value={element.keyboardUpperColor ?? '#3fae5a'}
                    onChange={(event) => onUpdate(element.id, { keyboardUpperColor: event.target.value })}
                    className="mt-1 h-7 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
                  />
                </label>
              </div>
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">        <button className="rounded border border-slate-700 px-2 py-1.5 text-[11px] hover:bg-slate-800" onClick={() => onDuplicate(element.id)} title="Duplicar (Ctrl+D)">
          Duplicar
        </button>
        <button className="rounded border border-slate-700 px-2 py-1.5 text-[11px] hover:bg-slate-800" onClick={() => onBringFront(element.id)} title="Trazer para frente">
          Frente
        </button>
        <button className="rounded border border-slate-700 px-2 py-1.5 text-[11px] hover:bg-slate-800" onClick={() => onSendBack(element.id)} title="Enviar para trás">
          Trás
        </button>
      </section>
    </div>
  );
};
