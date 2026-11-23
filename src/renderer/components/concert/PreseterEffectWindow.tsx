import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineParameter } from '@shared/engine-protocol';
import type { ConcertMapping, MidiBinding } from '@shared/types';
import {
  clamp01,
  groupParams,
  isChoice,
  paramDefault,
  paramNormalized,
  paramPosition,
  paramReal,
  positionToNormalized,
  type EffectDefinition,
  type EffectParam,
  type EffectPreset,
} from '@shared/effects/catalog';
import { useAppContext } from '../../context/AppContext';
import { knobArcBackground, useKnobInteraction } from './native-controls';

interface PreseterEffectWindowProps {
  /** Dono do insert: layerId, `patch` ou `aux1`..`aux4`. */
  ownerId: string;
  slot: number;
  effect: EffectDefinition;
  /** Mapeamentos atuais (para mostrar o CC de cada controle). */
  mappings?: ConcertMapping[];
  onLearnMapping?: (source: MidiBinding, parameterId: string) => void;
  onClearMapping?: (parameterId: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onOpenOriginal: () => void;
}

const USER_PRESET_KEY = (effectId: string) => `preseter.effectPresets.v1.${effectId}`;

function readUserPresets (effectId: string): EffectPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_PRESET_KEY(effectId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EffectPreset =>
      item && typeof item.id === 'string' && typeof item.label === 'string' && item.values && typeof item.values === 'object'
    );
  } catch {
    return [];
  }
}

interface KnobProps {
  label: string;
  /** Posição 0..1 do knob (já com a curva log do parâmetro). */
  value: number;
  /** Valor real do parâmetro, para o campo numérico editável. */
  numeric: {
    value: number;
    min: number;
    max: number;
    step: number;
    decimals: number;
    unit: string;
    onChange: (real: number) => void;
  };
  onChange: (value: number) => void;
  /** Duplo clique volta ao padrão do catálogo. */
  onReset?: () => void;
}

/** Unidades que não levam espaço antes (mesma regra de `formatParam`). */
const TIGHT_UNITS = new Set(['%', '°', '×', ':1']);

const unitGap = (unit: string): string =>
  unit && !TIGHT_UNITS.has(unit) && !unit.startsWith(':') ? ' ' : '';

const Knob: React.FC<KnobProps> = ({ label, value, numeric, onChange, onReset }) => {
  const interaction = useKnobInteraction(value, onChange);

  const formatValue = (real: number) => real.toFixed(numeric.decimals);
  const [text, setText] = useState(() => formatValue(numeric.value));
  const [editing, setEditing] = useState(false);
  /** Escape durante a edição: o blur descarta em vez de confirmar. */
  const cancelledRef = useRef(false);

  // Fora da edição, o campo acompanha o valor que vem do motor/preset.
  useEffect(() => {
    if (!editing) setText(formatValue(numeric.value));
  }, [numeric.value, numeric.decimals, editing]);

  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setText(formatValue(numeric.value));
      return;
    }
    const clamped = Math.max(numeric.min, Math.min(numeric.max, parsed));
    numeric.onChange(clamped);
    setText(formatValue(clamped));
  };

  return (
    <div className="flex min-w-[68px] flex-col items-center gap-1">
      <div
        ref={interaction.containerRef}
        className="relative h-12 w-12 cursor-ns-resize touch-none select-none rounded-full focus-within:ring-2 focus-within:ring-[#0A84FF]"
        data-knob-arc={Math.round(value * 270)}
        style={{ background: knobArcBackground(value) }}
        title={onReset ? 'Arraste para cima/baixo · duplo clique volta ao padrão' : 'Arraste para cima/baixo'}
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
        onPointerCancel={interaction.onPointerUp}
        onDoubleClick={onReset
          ? (event) => { event.preventDefault(); event.stopPropagation(); onReset(); }
          : undefined}
      >
        <div className="absolute inset-[4px] rounded-full" style={{ background: '#1C1C1E' }} />
        <div
          className="absolute left-1/2 top-[6px] h-2.5 w-[2px] origin-bottom rounded"
          style={{ background: '#E5E5EA', transform: `translateX(-50%) rotate(${-135 + value * 270}deg)`, transformOrigin: '50% 18px' }}
        />
        <input
          ref={interaction.inputRef}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
      <div className="flex items-baseline justify-center">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          aria-label={`Valor de ${label}`}
          title="Digite o valor (Enter confirma, Esc cancela)"
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => { setEditing(true); event.currentTarget.select(); }}
          onBlur={() => {
            setEditing(false);
            if (cancelledRef.current) {
              cancelledRef.current = false;
              setText(formatValue(numeric.value));
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              cancelledRef.current = true;
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const delta = (event.key === 'ArrowUp' ? 1 : -1) * numeric.step;
              const next = Math.max(numeric.min, Math.min(numeric.max, numeric.value + delta));
              numeric.onChange(next);
              setText(formatValue(next));
            }
          }}
          className="w-[52px] rounded bg-transparent px-0.5 py-0 text-center text-[10px] font-semibold tabular-nums text-white outline-none focus:bg-white/10"
        />
        {numeric.unit && (
          <span className="text-[9px]" style={{ color: '#8E8E93' }}>
            {unitGap(numeric.unit)}{numeric.unit}
          </span>
        )}
      </div>
      <span className="text-center text-[9px] leading-tight" style={{ color: '#8E8E93' }}>{label}</span>
    </div>
  );
};

const Toggle: React.FC<{ label: string; active: boolean; onChange: (next: boolean) => void }> = ({ label, active, onChange }) => (
  <div className="flex min-w-[92px] flex-col items-center gap-1 py-2">
    <button
      type="button"
      onClick={() => onChange(!active)}
      aria-pressed={active}
      aria-label={label}
      className="rounded-lg px-3 py-1.5 text-[10px] font-semibold"
      style={active
        ? { background: 'rgba(10,132,255,0.2)', color: '#7FB6FF', border: '1px solid #0A84FF' }
        : { background: 'rgba(255,255,255,0.05)', color: '#C6C6CB', border: '1px solid #3A3A3C' }}
    >
      {active ? 'Ligado' : 'Desligado'}
    </button>
    <span className="text-center text-[9px] leading-tight" style={{ color: '#8E8E93' }}>{label}</span>
  </div>
);

const Section: React.FC<{ title: string; collapsed: boolean; children: React.ReactNode }> = ({ title, collapsed, children }) => {
  const [open, setOpen] = useState(!collapsed);
  return (
    <details
      className="hw-inset p-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="hw-label cursor-pointer select-none">{title}</summary>
      <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-3">{children}</div>
    </details>
  );
};

const CcBadge: React.FC<{ controller?: number; armed: boolean; onClear: () => void }> = ({ controller, armed, onClear }) => {
  if (armed) {
    return (
      <span className="rounded px-1 text-[8px] font-semibold" style={{ background: 'rgba(10,132,255,0.2)', color: '#7FB6FF' }}>
        aguardando CC…
      </span>
    );
  }
  if (controller === undefined) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      title="Remover o mapeamento MIDI"
      className="rounded px-1 text-[8px] font-semibold"
      style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}
    >
      CC {controller}
    </button>
  );
};

export const PreseterEffectWindow: React.FC<PreseterEffectWindowProps> = ({
  ownerId,
  slot,
  effect,
  mappings = [],
  onLearnMapping,
  onClearMapping,
  onClose,
  onSave,
  onOpenOriginal,
}) => {
  const { getVstParameters, setVstParameter, subscribeMidiLearn } = useAppContext();
  const [params, setParams] = useState<EngineParameter[]>([]);
  const [presetId, setPresetId] = useState('default');
  const [userPresets, setUserPresets] = useState<EffectPreset[]>(() => readUserPresets(effect.id));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [learnIndex, setLearnIndex] = useState<number | null>(null);
  const [box, setBox] = useState({ x: 120, y: 60, w: 940, h: 640 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const byIndex = useMemo(() => {
    const map = new Map<number, EngineParameter>();
    for (const parameter of params) map.set(parameter.index, parameter);
    return map;
  }, [params]);

  const loadedParams = useMemo(
    () => effect.params.filter((param) => byIndex.has(param.index)),
    [effect.params, byIndex]
  );

  const groups = useMemo(() => groupParams(loadedParams), [loadedParams]);
  const presets = useMemo(() => [...effect.presets, ...userPresets], [effect.presets, userPresets]);

  const refresh = useCallback(async () => {
    try {
      const list = await getVstParameters(ownerId, slot);
      setParams(list);
      setError(list.length === 0 ? 'O insert ainda não está carregado. Carregue o patch primeiro.' : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao ler os parâmetros do efeito.');
    }
  }, [getVstParameters, ownerId, slot]);

  useEffect(() => { void refresh(); }, [refresh]);

  // O insert pode estar carregando quando a janela abre: tenta de novo até os
  // parâmetros chegarem (ou desiste depois de ~10 s).
  useEffect(() => {
    if (params.length > 0) return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void refresh();
      if (tries >= 20) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [params.length, refresh]);

  const setValue = useCallback(async (param: EffectParam, normalized: number) => {
    const value = clamp01(normalized);
    setParams((previous) => previous.map((item) => (item.index === param.index ? { ...item, value } : item)));
    setPresetId('');
    if (!await setVstParameter(ownerId, String(param.index), value, slot)) {
      setError(`Não foi possível aplicar “${param.label}”.`);
    }
  }, [ownerId, setVstParameter, slot]);

  const applyPreset = useCallback(async (preset: EffectPreset) => {
    if (loadedParams.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const values = loadedParams.map((param) => ({
        param,
        value: clamp01(preset.values[String(param.index)] ?? paramDefault(param)),
      }));
      setParams((previous) => previous.map((item) => {
        const match = values.find((entry) => entry.param.index === item.index);
        return match ? { ...item, value: match.value } : item;
      }));
      await Promise.all(values.map(({ param, value }) =>
        setVstParameter(ownerId, String(param.index), value, slot)
      ));
      setPresetId(preset.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao aplicar o preset.');
    } finally {
      setBusy(false);
    }
  }, [loadedParams, ownerId, setVstParameter, slot]);

  const saveUserPreset = useCallback(() => {
    const values: Record<string, number> = {};
    for (const parameter of params) values[String(parameter.index)] = parameter.value;
    const next: EffectPreset = {
      id: `user-${Date.now()}`,
      label: `Meu ${readUserPresets(effect.id).length + 1}`,
      values,
    };
    const list = [...readUserPresets(effect.id), next];
    localStorage.setItem(USER_PRESET_KEY(effect.id), JSON.stringify(list));
    setUserPresets(list);
    setPresetId(next.id);
    setError(null);
  }, [effect.id, params]);

  const activeParam = byIndex.get(effect.params.find((param) => param.id === 'active')?.index ?? -1);
  const bypassParam = byIndex.get(effect.params.find((param) => param.id === 'bypass')?.index ?? -1);
  const onOff = activeParam ?? bypassParam;
  const isOn = onOff ? onOff.value >= 0.5 : true;

  const mappingFor = useCallback((index: number): ConcertMapping | undefined =>
    mappings.find((mapping) =>
      mapping.paramOwner === ownerId
      && mapping.paramSlot === slot
      && mapping.parameterId === String(index)
    ), [mappings, ownerId, slot]);

  // Learn: armado num controle, o próximo CC vira o mapeamento do insert.
  useEffect(() => {
    if (learnIndex === null) return undefined;
    const unsubscribe = subscribeMidiLearn((event) => {
      if (event.kind !== 'cc') return;
      const source: MidiBinding = {
        type: 'cc',
        channel: event.channel,
        controllerNumber: event.number,
      };
      onLearnMapping?.(source, String(learnIndex));
      setLearnIndex(null);
    });
    return unsubscribe;
  }, [learnIndex, onLearnMapping, subscribeMidiLearn]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, background: '#151517', border: '1px solid #3A3A3C' }}
      >
        <header
          className="flex flex-wrap items-center gap-2 py-3 pl-4 pr-12"
          style={{ borderBottom: '1px solid #3A3A3C', cursor: 'move', touchAction: 'none' }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button,input,select,textarea')) return;
            dragRef.current = { dx: event.clientX - box.x, dy: event.clientY - box.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            setBox((current) => ({
              ...current,
              x: Math.max(-current.w + 140, Math.min(window.innerWidth - 140, event.clientX - drag.dx)),
              y: Math.max(0, Math.min(window.innerHeight - 48, event.clientY - drag.dy)),
            }));
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <div className="mr-auto min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{effect.displayName}</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(48,209,88,0.16)', color: '#30D158' }}>EFEITO</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}>
                {effect.source === 'guitarix' ? 'GUITARIX' : 'CALFNXT'}
              </span>
            </div>
            <div className="truncate text-[10px]" style={{ color: '#8E8E93' }}>{effect.subtitle}</div>
          </div>
          <select
            value={presetId}
            onChange={(event) => {
              const preset = presets.find((item) => item.id === event.target.value);
              if (preset) void applyPreset(preset);
            }}
            disabled={busy || loadedParams.length === 0}
            className="hw-inset max-w-[220px] px-2 py-1 text-[10px] text-white"
            aria-label="Preset do efeito"
          >
            {presetId === '' && <option value="">Editado</option>}
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg px-2 py-1.5 text-[10px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', border: '1px solid #3A3A3C' }}
            onClick={saveUserPreset}
            disabled={loadedParams.length === 0}
            title="Salvar os valores atuais como preset do usuário"
          >
            + Preset
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold"
            style={{ background: '#0A84FF', color: '#fff' }}
            onClick={() => void onSave()}
          >
            Salvar
          </button>
          <button
            type="button"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-[12px] hover:bg-white/10"
            style={{ color: '#8E8E93' }}
            onClick={onClose}
            aria-label="Fechar janela"
            title="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {loadedParams.length === 0 && (
              <div className="hw-inset p-4 text-[11px]" style={{ color: '#9A9AA0' }}>
                {error ?? 'Carregando os parâmetros do efeito…'}
              </div>
            )}

            {groups.map((group) => (
              <Section key={group.title} title={group.title} collapsed={group.collapsed}>
                {group.params.map((param) => {
                  const parameter = byIndex.get(param.index);
                  const normalized = parameter?.value ?? paramDefault(param);
                  const mapping = mappingFor(param.index);
                  const armed = learnIndex === param.index;
                  const controller = mapping?.source.type === 'cc' ? mapping.source.controllerNumber : undefined;
                  const shell = (children: React.ReactNode) => (
                    <div
                      key={param.index}
                      onContextMenu={(event) => { event.preventDefault(); setLearnIndex(param.index); }}
                      className="flex flex-col items-center gap-0.5"
                    >
                      {children}
                      <CcBadge
                        controller={controller}
                        armed={armed}
                        onClear={() => onClearMapping?.(String(param.index))}
                      />
                    </div>
                  );

                  if (param.toggle) {
                    return shell(
                      <Toggle
                        label={param.label}
                        active={normalized >= 0.5}
                        onChange={(next) => void setValue(param, next ? 1 : 0)}
                      />
                    );
                  }
                  if (isChoice(param)) {
                    const options: number[] = [];
                    for (let value = param.min; value <= param.max; value += 1) options.push(value);
                    return shell(
                      <label className="flex min-w-[110px] flex-col gap-1">
                        <span className="text-[9px]" style={{ color: '#8E8E93' }}>{param.label}</span>
                        <select
                          value={Math.round(param.min + normalized * (param.max - param.min))}
                          onChange={(event) => {
                            const real = Number(event.target.value);
                            void setValue(param, (real - param.min) / (param.max - param.min));
                          }}
                          className="hw-inset px-2 py-1 text-[10px] text-white"
                          aria-label={param.label}
                        >
                          {options.map((value) => (
                            <option key={value} value={value}>{param.choices?.[value] ?? value}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return shell(
                    <Knob
                      label={param.label}
                      value={paramPosition(param, normalized)}
                      numeric={{
                        value: paramReal(param, normalized),
                        min: param.min,
                        max: param.max,
                        step: param.precision > 0 ? Math.pow(10, -param.precision) : 1,
                        decimals: param.precision,
                        unit: param.unit,
                        onChange: (value) => void setValue(param, paramNormalized(param, value)),
                      }}
                      onChange={(position) => void setValue(param, positionToNormalized(param, position))}
                      onReset={() => void setValue(param, paramDefault(param))}
                    />
                  );
                })}
              </Section>
            ))}

            <section className="hw-inset p-3">
              <div className="hw-label mb-2">Sobre</div>
              <p className="text-[9px] leading-relaxed" style={{ color: '#8E8E93' }}>
                {effect.source === 'guitarix'
                  ? `${effect.displayName} usa o DSP do Guitarix (GPL-3.0-or-later) dentro do Preseter.`
                  : `${effect.displayName} usa o DSP do calfnXT/Calf (GPL-3.0-or-later) dentro do Preseter.`}
                Clique com o botão direito num controle para mapear um CC (ou use a tabela de
                mapeamentos). Insert {slot + 1} de {ownerId === 'patch' ? 'Master do Patch' : ownerId}.
                “Salvar” grava o estado no patch; “+ Preset” guarda os valores atuais na sua lista.
              </p>
            </section>

            {error && <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>{error}</div>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
          <span style={{ color: isOn ? '#30D158' : '#8E8E93' }}>● {isOn ? 'Ativo' : 'Desligado'}</span>
          <span>{effect.paramCount} parâmetros</span>
          {learnIndex !== null ? (
            <span className="rounded px-2 py-0.5" style={{ background: 'rgba(10,132,255,0.2)', color: '#7FB6FF' }}>
              Aguardando CC…{' '}
              <button type="button" className="underline" onClick={() => setLearnIndex(null)}>cancelar</button>
            </span>
          ) : (
            <span className="hidden sm:inline">Botão direito num controle = mapear CC</span>
          )}
          {effect.originalEditor !== false && (
            <button
              type="button"
              className="rounded px-2 py-0.5 text-[10px] hover:bg-white/10"
              style={{ color: '#7FB6FF' }}
              onClick={onOpenOriginal}
              title="Abrir a interface original do plugin"
            >
              Editor original
            </button>
          )}
          <span className="ml-auto truncate">
            {effect.source === 'guitarix' ? 'Guitarix · GPL-3.0-or-later' : 'calfnXT · GPL-3.0-or-later'}
          </span>
        </footer>
      </div>
    </div>
  );
};
