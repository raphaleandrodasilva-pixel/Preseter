import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PresetPluginAssignment, ConcertMapping, MidiBinding } from '@shared/types';
import type { EngineParameter } from '@shared/engine-protocol';
import { useAppContext } from '../../context/AppContext';
import { ChoiceButton, Knob, NumberField, ParamKnob } from './native-controls';
import { Synth2Panel } from './Synth2Panel';
import { DrumMachinePanel } from './DrumMachinePanel';
import { DexedPanel } from './DexedPanel';
import { ZynPanel } from './ZynPanel';

export type NativeInstrumentKind = 'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx' | 'dexed' | 'zyn' | 'synth2' | 'drums';

interface NativeInstrumentWindowProps {
  kind: NativeInstrumentKind;
  layerId: string;
  assignment: PresetPluginAssignment;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  /** Mappings do concert (usado pelo Synth2 para mostrar/aprender CCs). */
  mappings?: ConcertMapping[];
  onLearnMapping?: (source: MidiBinding, parameterId: string) => void;
  onClearMapping?: (parameterId: string) => void;
  /** Play/Stop do concert (usado pelo Preseter Drums). */
  transportPlaying?: boolean;
  onToggleTransport?: () => void;
}

const DRAW_BARS: Array<[string, string]> = [
  ["Drawbar 16'", "16'"],
  ["Drawbar 5 1/3'", "5⅓'"],
  ["Drawbar 8'", "8'"],
  ["Drawbar 4'", "4'"],
  ["Drawbar 2 2/3'", "2⅔'"],
  ["Drawbar 2'", "2'"],
  ["Drawbar 1 3/5'", "1⅗'"],
  ["Drawbar 1 1/3'", "1⅓'"],
  ["Drawbar 1'", "1'"],
];

const TITLES: Record<NativeInstrumentKind, { name: string; badge: string; subtitle: string }> = {
  organ: { name: 'Preseter Organ', badge: 'Cópia tonewheel — um manual', subtitle: 'Órgão tonewheel nativo' },
  tines: { name: 'Preseter Tines (Rhodes)', badge: 'BASE MDA ePIANO', subtitle: 'Piano elétrico de tines — samples e DSP do MDA (MIT)' },
  reeds: { name: 'Preseter Wurly', badge: 'OPENWURLI', subtitle: 'Wurlitzer 200A — modelagem física (OpenWurli)' },
  piano: { name: 'Preseter Piano', badge: 'MDA PIANO', subtitle: 'Piano acústico por samples · 12 parâmetros' },
  dx: { name: 'Preseter DX10', badge: 'MDA DX10', subtitle: 'FM de 2 operadores · 16 parâmetros' },
  dexed: { name: 'Preseter Dexed', badge: 'DEXED', subtitle: 'FM de 6 operadores estilo DX7 · cartuchos .syx' },
  zyn: { name: 'Preseter Zyn', badge: 'ZYN', subtitle: 'Additive · subtrativo · PADsynth · presets .xiz' },
  jx: { name: 'Preseter JX10', badge: 'MDA JX10', subtitle: 'Sintetizador analógico · 24 parâmetros' },
  synth2: { name: 'Preseter Synth2', badge: 'OXO SYNTH2', subtitle: 'Recriação do Synth1 · motor Oxo Synth2 (MIT)' },
  drums: { name: 'Preseter Drums', badge: 'PADS E SEQUENCIADOR', subtitle: 'Bateria nativa · até 16 pads, sequenciador e sample por pad' },
};

const CREDITS: Partial<Record<NativeInstrumentKind, string>> = {
  piano: 'Baseado em mda Piano · Paul Kellett',
  dx: 'Baseado em mda DX10 · Paul Kellett',
  dexed: 'Motor: Dexed 1.1.0 · Pascal Gauthier · GPL-3.0',
  zyn: 'Motor: ZynAddSubFX 3.0.7 · Nasca Octavian Paul · GPL-2.0-or-later',
  jx: 'Baseado em mda JX10 · Paul Kellett',
  synth2: 'Motor: Oxo Synth2 · François Chabloz (chab) · MIT',
};

// --- Painéis dos instrumentos MDA (Piano, DX10, JX10) ------------------------

type MdaKind = 'piano' | 'dx' | 'jx';
type ValueOf = (name: string) => number;
type SetNamed = (name: string, value: number) => Promise<void>;

const MdaSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <section className={`hw-inset p-3 ${className ?? ''}`}>
    <div className="hw-label mb-3">{title}</div>
    {children}
  </section>
);

const knobRow = 'flex flex-wrap items-start justify-around gap-x-3 gap-y-3';

const MdaKnob: React.FC<{
  label: string;
  name: string;
  valueOf: ValueOf;
  setNamed: SetNamed;
  format: (normalized: number) => string;
  defaultOf?: (name: string) => number | undefined;
}> = ({ label, name, valueOf, setNamed, format, defaultOf }) => {
  const value = valueOf(name);
  const fallback = defaultOf?.(name);
  return (
    <Knob
      label={label}
      value={value}
      display={format(value)}
      onChange={(next) => void setNamed(name, next)}
      onReset={fallback === undefined ? undefined : () => void setNamed(name, fallback)}
    />
  );
};

/** % com casas decimais opcionais. */
const pct = (value: number, decimals = 0) => `${(value * 100).toFixed(decimals)}%`;

/** Valor bipolar (-50..50) em %. */
const bipolar = (value: number, decimals = 0) => `${(value * 100 - 50).toFixed(decimals)}%`;

const pctOrOff = (value: number, decimals = 0) =>
  value < 0.05 ? 'desligado' : `${(200 * value - 100).toFixed(decimals)}%`;

/** Segundos a partir de uma constante de tempo; abaixo de 1 s mostra ms. */
const timeFromTau = (tau: number): string => {
  if (!Number.isFinite(tau) || tau > 60) return 'infinito';
  return tau >= 1 ? `${tau.toFixed(2)} s` : `${Math.max(0.1, tau * 1000).toFixed(1)} ms`;
};

const dxTime = (coefficient: number): string => {
  // O MDA guarda o coeficiente exp(-1/(sr*tau)); só o tau interessa na tela.
  const tau = 1 / Math.exp(coefficient);
  return timeFromTau(tau);
};

const JX_MODES: Array<{ label: string; mode: number }> = [
  { label: 'POLY', mode: 0 },
  { label: 'P-LEGATO', mode: 2 },
  { label: 'P-GLIDE', mode: 3 },
  { label: 'MONO', mode: 4 },
  { label: 'M-LEGATO', mode: 6 },
  { label: 'M-GLIDE', mode: 7 },
];

const jxModeOf = (value: number) => Math.min(7, Math.floor(7.9 * value));

interface EnvelopeShape {
  /** 0..1 — ataque. */
  attack: number;
  /** 0..1 — decaimento. */
  decay: number;
  /** 0..1 — nível de sustain. */
  sustain: number;
  /** 0..1 — release. */
  release: number;
}

/** Caminho SVG (viewBox 100x40) desenhado a partir dos próprios parâmetros. */
function envelopePath ({ attack, decay, sustain, release }: EnvelopeShape): string {
  const top = 4;
  const bottom = 36;
  const sustainY = bottom - Math.max(0, Math.min(1, sustain)) * (bottom - top);
  const attackWidth = 5 + 18 * attack;
  const decayWidth = 8 + 24 * decay;
  const holdWidth = 14;
  const releaseWidth = 5 + 18 * release;
  const total = attackWidth + decayWidth + holdWidth + releaseWidth;
  const x = (width: number) => ((width / total) * 100).toFixed(2);
  const curve = (from: number, to: number, steps: number): string[] => {
    const points: string[] = [];
    const span = 1 - Math.exp(-4);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const level = from + (to - from) * ((1 - Math.exp(-4 * t)) / span);
      points.push(level.toFixed(2));
    }
    return points;
  };

  const parts: string[] = [`M 0 ${bottom}`];
  curve(bottom, top, 6).forEach((level, index) => {
    parts.push(`L ${x((attackWidth * (index + 1)) / 6)} ${level}`);
  });
  let offset = attackWidth;
  curve(top, sustainY, 10).forEach((level, index) => {
    parts.push(`L ${x(offset + (decayWidth * (index + 1)) / 10)} ${level}`);
  });
  offset += decayWidth;
  parts.push(`L ${x(offset + holdWidth)} ${sustainY.toFixed(2)}`);
  offset += holdWidth;
  curve(sustainY, bottom, 8).forEach((level, index) => {
    parts.push(`L ${x(offset + (releaseWidth * (index + 1)) / 8)} ${level}`);
  });
  return parts.join(' ');
}

const EnvelopeGraph: React.FC<{ shape: EnvelopeShape; caption: string }> = ({ shape, caption }) => (
  <div className="mb-3">
    <div
      className="h-16 w-full overflow-hidden rounded-md"
      style={{ background: '#0F0F11', border: '1px solid #2C2C2E' }}
    >
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
        <path
          d={envelopePath(shape)}
          fill="none"
          stroke="#0A84FF"
          strokeWidth={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
    <div className="mt-1 truncate text-[8px]" style={{ color: '#6E6E73' }}>{caption}</div>
  </div>
);

const MdaPanel: React.FC<{
  kind: MdaKind;
  valueOf: ValueOf;
  setNamed: SetNamed;
  defaultOf?: (name: string) => number | undefined;
  activeVoices: number | null;
}> = ({ kind, valueOf, setNamed, defaultOf, activeVoices }) => {
  const voices = activeVoices ?? 0;

  if (kind === 'piano') {
    const polyphony = Math.round(8 + 24 * valueOf('Polyphony'));
    return (
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)]">
          <MdaSection title="Envelope">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Decay" name="Envelope Decay" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
              <MdaKnob defaultOf={defaultOf} label="Release" name="Envelope Release" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            </div>
          </MdaSection>

          <MdaSection title="Toque">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Hardness" name="Hardness Offset" valueOf={valueOf} setNamed={setNamed} format={(v) => bipolar(v)} />
              <MdaKnob defaultOf={defaultOf} label="Vel → Hardness" name="Velocity to Hardness" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
              <MdaKnob defaultOf={defaultOf} label="Muffling" name="Muffling Filter" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(1 - v)} />
              <MdaKnob defaultOf={defaultOf} label="Vel → Muffling" name="Velocity to Muffling" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
              <MdaKnob defaultOf={defaultOf} label="Vel Sensitivity" name="Velocity Sensitivity" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            </div>
          </MdaSection>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <MdaSection title="Estéreo e vozes">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Stereo Width" name="Stereo Width" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.round(200 * v)}%`} />
              <MdaKnob defaultOf={defaultOf} label="Polyphony" name="Polyphony" valueOf={valueOf} setNamed={setNamed} format={() => `${polyphony}`} />
            </div>
          </MdaSection>

          <MdaSection title="Afinação">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Fine tuning" name="Fine Tuning" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(100 * v - 50).toFixed(1)} ¢`} />
              <MdaKnob defaultOf={defaultOf} label="Random detuning" name="Random Detuning" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(50 * v * v).toFixed(1)} ¢`} />
              <MdaKnob defaultOf={defaultOf} label="Stretch tuning" name="Stretch Tuning" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(100 * v - 50).toFixed(1)} ¢`} />
            </div>
          </MdaSection>
        </div>

        <MdaSection title="Sobre">
          <p className="text-[9px] leading-relaxed" style={{ color: '#8E8E93' }}>
            Piano acústico por samples, baseado no mda Piano de Paul Kellett (MIT), rodando dentro do
            motor do Preseter. Os 12 parâmetros são os do plugin original. Os gráficos dos envelopes são
            desenhados a partir dos valores atuais. CC1/CC43 abafam, CC64 segura e CC7 ajusta o volume
            interno — para mapear esses CCs no layout, marque “Não passar adiante”.
          </p>
        </MdaSection>
      </div>
    );
  }

  if (kind === 'dx') {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <MdaSection title="Postadora">
            <EnvelopeGraph
              caption="Portadora: Attack · Decay · Release"
              shape={{ attack: valueOf('Attack'), decay: valueOf('Decay'), sustain: 0, release: valueOf('Release') }}
            />
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Attack" name="Attack" valueOf={valueOf} setNamed={setNamed} format={(v) => dxTime(8 - 8 * v)} />
              <MdaKnob defaultOf={defaultOf} label="Decay" name="Decay" valueOf={valueOf} setNamed={setNamed} format={(v) => v > 0.98 ? 'infinito' : dxTime(5 - 8 * v)} />
              <MdaKnob defaultOf={defaultOf} label="Release" name="Release" valueOf={valueOf} setNamed={setNamed} format={(v) => dxTime(5 - 5 * v)} />
            </div>
          </MdaSection>

          <MdaSection title="Modulador">
            <EnvelopeGraph
              caption="Modulador: Init · Dec · Sus · Rel"
              shape={{ attack: 0.15, decay: valueOf('Mod Dec'), sustain: 0.25 * valueOf('Mod Sus'), release: valueOf('Mod Rel') }}
            />
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Mod Init" name="Mod Init" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(0.25 * v * v, 1)} />
              <MdaKnob defaultOf={defaultOf} label="Mod Dec" name="Mod Dec" valueOf={valueOf} setNamed={setNamed} format={(v) => dxTime(6 - 7 * v)} />
              <MdaKnob defaultOf={defaultOf} label="Mod Sus" name="Mod Sus" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(0.25 * v * v, 1)} />
              <MdaKnob defaultOf={defaultOf} label="Mod Rel" name="Mod Rel" valueOf={valueOf} setNamed={setNamed} format={(v) => dxTime(5 - 8 * v)} />
            </div>
          </MdaSection>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
          <MdaSection title="FM">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Coarse" name="Coarse" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.floor(40.1 * v * v)} : 1`} />
              <MdaKnob defaultOf={defaultOf} label="Fine" name="Fine" valueOf={valueOf} setNamed={setNamed} format={(v) => (0.2 * v * v).toFixed(3)} />
              <MdaKnob defaultOf={defaultOf} label="Mod Vel" name="Mod Vel" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
              <MdaKnob defaultOf={defaultOf} label="Mod Thru" name="Mod Thru" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(0.25 * v * v, 1)} />
              <MdaKnob defaultOf={defaultOf} label="Waveform" name="Waveform" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            </div>
          </MdaSection>

          <MdaSection title="LFO e afinação">
            <div className={knobRow}>
              <MdaKnob defaultOf={defaultOf} label="Vibrato" name="Vibrato" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v * v, 1)} />
              <MdaKnob defaultOf={defaultOf} label="LFO Rate" name="LFO Rate" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(25 * v * v).toFixed(1)} Hz`} />
              <MdaKnob defaultOf={defaultOf} label="Octave" name="Octave" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.floor(6.9 * v) - 2}`} />
              <MdaKnob defaultOf={defaultOf} label="FineTune" name="FineTune" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(100 * (2 * v - 1)).toFixed(0)} ¢`} />
            </div>
          </MdaSection>
        </div>

        <MdaSection title="Sobre">
          <p className="text-[9px] leading-relaxed" style={{ color: '#8E8E93' }}>
            FM de dois operadores, modulador e portadora, baseado no mda DX10 de Paul Kellett (MIT).
            Os gráficos desenham os envelopes a partir dos 16 parâmetros atuais. CC1 controla o vibrato,
            CC64 segura e CC7 ajusta o volume interno — para mapear esses CCs no layout, marque
            “Não passar adiante”.
          </p>
        </MdaSection>
      </div>
    );
  }

  const mode = jxModeOf(valueOf('Mode'));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,0.6fr)]">
        <MdaSection title="Osciladores">
          <div className={knobRow}>
            <MdaKnob defaultOf={defaultOf} label="OSC Mix" name="OSC Mix" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.round(100 - 50 * v)}:${Math.round(50 * v)}`} />
            <MdaKnob defaultOf={defaultOf} label="OSC Tune" name="OSC Tune" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.floor(48 * v) - 24} st`} />
            <MdaKnob defaultOf={defaultOf} label="OSC Fine" name="OSC Fine" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(0.1 * Math.floor(Math.pow(15.876 * v - 7.938, 3))).toFixed(1)} ¢`} />
            <MdaKnob defaultOf={defaultOf} label="Octave" name="Octave" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.floor(4.9 * v) - 2}`} />
            <MdaKnob defaultOf={defaultOf} label="Tuning" name="Tuning" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(200 * v - 100).toFixed(1)} ¢`} />
            <MdaKnob defaultOf={defaultOf} label="Noise" name="Noise" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
          </div>
        </MdaSection>

        <MdaSection title="Glide">
          <div className={knobRow}>
            <MdaKnob defaultOf={defaultOf} label="Gld Rate" name="Gld Rate" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="Gld Bend" name="Gld Bend" valueOf={valueOf} setNamed={setNamed} format={(v) => Math.pow(6.604 * v - 3.302, 3).toFixed(2)} />
          </div>
          <div className="mt-3">
            <div className="hw-label mb-1">Mode</div>
            <div className="flex flex-wrap gap-1">
              {JX_MODES.map((item) => (
                <ChoiceButton
                  key={item.label}
                  active={item.mode === 0 ? mode <= 1 : item.mode === 4 ? (mode === 4 || mode === 5) : mode === item.mode}
                  onClick={() => void setNamed('Mode', (item.mode + 0.5) / 7.9)}
                >
                  {item.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </MdaSection>

        <MdaSection title="LFO">
          <div className={knobRow}>
            <MdaKnob defaultOf={defaultOf} label="LFO Rate" name="LFO Rate" valueOf={valueOf} setNamed={setNamed} format={(v) => `${Math.exp(7 * v - 4).toFixed(2)} Hz`} />
            <MdaKnob defaultOf={defaultOf} label="Vibrato" name="Vibrato" valueOf={valueOf} setNamed={setNamed} format={(v) => v < 0.5 ? `PWM ${(100 - 200 * v).toFixed(0)}%` : `${(200 * v - 100).toFixed(0)}%`} />
          </div>
        </MdaSection>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <MdaSection title="Filtro (VCF)">
          <EnvelopeGraph
            caption="Filtro: Att · Dec · Sus · Rel"
            shape={{ attack: valueOf('VCF Att'), decay: valueOf('VCF Dec'), sustain: valueOf('VCF Sus'), release: valueOf('VCF Rel') }}
          />
          <div className={knobRow}>
            <MdaKnob defaultOf={defaultOf} label="VCF Freq" name="VCF Freq" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v, 1)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Reso" name="VCF Reso" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Env" name="VCF Env" valueOf={valueOf} setNamed={setNamed} format={(v) => `${(200 * v - 100).toFixed(1)}%`} />
            <MdaKnob defaultOf={defaultOf} label="VCF LFO" name="VCF LFO" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Vel" name="VCF Vel" valueOf={valueOf} setNamed={setNamed} format={(v) => pctOrOff(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Att" name="VCF Att" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Dec" name="VCF Dec" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Sus" name="VCF Sus" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="VCF Rel" name="VCF Rel" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
          </div>
        </MdaSection>

        <MdaSection title="Amplitude (ENV)">
          <EnvelopeGraph
            caption="Amplitude: Att · Dec · Sus · Rel"
            shape={{ attack: valueOf('ENV Att'), decay: valueOf('ENV Dec'), sustain: valueOf('ENV Sus'), release: valueOf('ENV Rel') }}
          />
          <div className={knobRow}>
            <MdaKnob defaultOf={defaultOf} label="ENV Att" name="ENV Att" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="ENV Dec" name="ENV Dec" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="ENV Sus" name="ENV Sus" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
            <MdaKnob defaultOf={defaultOf} label="ENV Rel" name="ENV Rel" valueOf={valueOf} setNamed={setNamed} format={(v) => pct(v)} />
          </div>
        </MdaSection>
      </div>

      <MdaSection title="Sobre">
        <p className="text-[9px] leading-relaxed" style={{ color: '#8E8E93' }}>
          Sintetizador analógico de dois osciladores, baseado no mda JX10 de Paul Kellett (MIT).
          Os gráficos desenham os envelopes de filtro e amplitude a partir dos 24 parâmetros atuais.
          CC2/CC3 abrem e fecham o filtro, CC1 controla o vibrato, CC64 segura e CC7 ajusta o volume
          interno — para mapear esses CCs no layout, marque “Não passar adiante”.
        </p>
      </MdaSection>
    </div>
  );
};

export const NativeInstrumentWindow: React.FC<NativeInstrumentWindowProps> = ({
  kind,
  layerId,
  assignment,
  onClose,
  onSave,
  mappings = [],
  onLearnMapping,
  onClearMapping,
  transportPlaying = false,
  onToggleTransport,
}) => {
  const { getVstParameters, setVstParameter, loadedPlugins } = useAppContext();
  const [params, setParams] = useState<EngineParameter[]>([]);
  const [activeVoices, setActiveVoices] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dexedNames, setDexedNames] = useState<string[]>([]);
  const [dexedProgram, setDexedProgram] = useState(0);
  const [zynNames, setZynNames] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [box, setBox] = useState({ x: 80, y: 80, w: 980, h: 640 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const plugin = loadedPlugins.find((item) => item.layerId === layerId);
  const program = plugin?.program ?? assignment.programIndex ?? 0;
  const mdaKind = kind === 'piano' || kind === 'dx' || kind === 'jx';
  const programCount = plugin?.programCount
    ?? (kind === 'piano' ? 8 : kind === 'dx' ? 32 : kind === 'jx' ? 52 : kind === 'dexed' ? 32 : kind === 'zyn' ? 1 : kind === 'drums' ? 1 : 4);

  useEffect(() => {
    if (kind === 'dexed' && plugin?.programNames?.length) {
      setDexedNames(plugin.programNames);
      setDexedProgram(plugin.program ?? assignment.programIndex ?? 0);
    }
    if (kind === 'zyn' && plugin?.programNames?.length) {
      setZynNames(plugin.programNames);
    }
  }, [kind, plugin?.programNames, plugin?.program, assignment.programIndex]);

  const refresh = async () => {
    try {
      setParams(await getVstParameters(layerId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao ler os parâmetros.');
    }
  };

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastParamChangeRef = useRef(0);

  useEffect(() => { void refresh(); }, [layerId]);

  // O CC1 muda o Leslie no motor; atualiza os botões da janela sem fechar.
  useEffect(() => {
    if (kind !== 'organ') return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastParamChangeRef.current < 600) return;
      void refreshRef.current();
    }, 400);
    return () => window.clearInterval(timer);
  }, [kind, layerId]);

  // Vozes ativas dos instrumentos MDA: o rodapé mostra quantas estão soando.
  useEffect(() => {
    if (kind !== 'piano' && kind !== 'dx' && kind !== 'jx' && kind !== 'dexed' && kind !== 'zyn' && kind !== 'synth2') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const voices = await window.electronAPI.vstVoices(layerId);
        if (!cancelled) setActiveVoices(voices);
      } catch {
        /* leitura de vozes é só informativa */
      }
    };
    void tick();
    const timer = window.setInterval(tick, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [kind, layerId]);

  useEffect(() => {
    const width = Math.min(980, window.innerWidth - 48);
    const height = Math.min(640, window.innerHeight - 48);
    setBox({ x: Math.max(24, Math.round((window.innerWidth - width) / 2)), y: Math.max(24, Math.round((window.innerHeight - height) / 2)), w: width, h: height });
  }, []);

  const param = (name: string) => params.find((item) => item.name === name);
  const valueOf = (name: string, fallback = 0) => param(name)?.value ?? fallback;
  /** Padrão (normalizado) do parâmetro, para o duplo clique nos knobs. */
  const defaultOf = (name: string) => param(name)?.defaultValue;

  const setNamed = async (name: string, value: number) => {
    const target = param(name);
    if (!target) return;
    lastParamChangeRef.current = Date.now();
    await setVstParameter(layerId, String(target.index), Math.max(0, Math.min(1, value)));
    setParams((previous) => previous.map((item) => item.index === target.index ? { ...item, value } : item));
  };

  const setPhysical = (name: string, value: number, max: number) => setNamed(name, value / max);

  const changeProgram = async (index: number) => {
    if (index < 0) return;
    try {
      await window.electronAPI.vstSetProgram(layerId, index);
      if (kind === 'dexed') setDexedProgram(index);
      // O Zyn usa `plugin.program` (atualizado pelo evento plugin-program);
      // não há estado local para uma resposta atrasada voltar.
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao trocar o preset.');
    }
  };

  const importCartridge = async () => {
    setImporting(true);
    setImportMessage(null);
    try {
      const result = kind === 'zyn'
        ? await window.electronAPI.zynImportPreset(layerId)
        : await window.electronAPI.dexedImportCartridge(layerId);
      if (!result.ok) {
        setImportMessage(`Erro: ${result.error ?? 'não foi possível importar o arquivo.'}`);
        return;
      }
      if (result.plugin?.programNames?.length) {
        if (kind === 'zyn') {
          setZynNames(result.plugin.programNames);
        } else {
          setDexedNames(result.plugin.programNames);
          setDexedProgram(result.plugin.program ?? 0);
        }
      }
      setImportMessage(kind === 'zyn' ? 'Preset importado.' : 'Cartucho importado.');
      await refresh();
    } catch (cause) {
      setImportMessage(`Erro: ${cause instanceof Error ? cause.message : 'falha ao importar.'}`);
    } finally {
      setImporting(false);
    }
  };

  const title = TITLES[kind];
  const drawbarMode = kind === 'organ';

  const programNames = useMemo(() => {
    if (kind === 'dexed' && dexedNames.length > 0) return dexedNames;
    if (kind === 'zyn' && zynNames.length > 0) return zynNames;
    if (plugin?.programNames?.length) return plugin.programNames;
    if (kind === 'organ') return ['Jazz', 'Gospel', 'Rock', 'Combo'];
    if (kind === 'tines') return ['Suitcase', 'Stage', 'Mellow', 'Bark'];
    if (kind === 'reeds') return ['Clássico', 'Suitcase', 'Stage', 'Bark'];
    if (kind === 'drums') return ['Kit vazio'];
    return Array.from({ length: programCount }, (_, index) => `Preset ${index + 1}`);
  }, [kind, dexedNames, zynNames, plugin?.programNames, programCount]);

  const displayedProgram = kind === 'dexed' ? dexedProgram : program;

  const polyphonyMax = kind === 'piano'
    ? Math.round(8 + 24 * valueOf('Polyphony'))
    : kind === 'dx' || kind === 'jx'
      ? 8
      : kind === 'dexed'
        ? 16
        : kind === 'zyn'
          ? 32
          : kind === 'tines'
        ? Math.round(valueOf('Polyphony'))
        : kind === 'synth2'
          ? Math.round(1 + 31 * valueOf('polyphony'))
          : 64;

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
              x: Math.max(-current.w + 120, Math.min(window.innerWidth - 120, event.clientX - drag.dx)),
              y: Math.max(0, Math.min(window.innerHeight - 48, event.clientY - drag.dy)),
            }));
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <div className="mr-auto min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{title.name}</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(10,132,255,0.2)', color: '#7FB6FF' }}>NATIVO</span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(255,159,10,0.16)', color: '#FFB74D' }}>{title.badge}</span>
            </div>
            <div className="truncate text-[10px]" style={{ color: '#8E8E93' }}>{title.subtitle}</div>
          </div>
          {kind === 'dexed' || kind === 'zyn' ? (
            <span className="max-w-[260px] truncate text-[10px]" style={{ color: '#C6C6CB' }} title={programNames[displayedProgram]}>
              {programNames[displayedProgram] ?? 'Programa'}
            </span>
          ) : (
            <select
              value={displayedProgram}
              onChange={(event) => void changeProgram(Number(event.target.value))}
              className="hw-inset max-w-[220px] px-2 py-1 text-[10px] text-white"
              aria-label="Preset do instrumento"
            >
              {kind === 'synth2' && program < 0 && <option value={-1}>Patch atual (.sy1)</option>}
              {programNames.slice(0, programCount).map((name, index) => (
                <option key={`${name}-${index}`} value={index}>{name}</option>
              ))}
            </select>
          )}
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
          {drawbarMode ? (
            <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section className="hw-inset p-3">
                <div className="hw-label mb-3">Barras (drawbars)</div>
                <div className="flex items-end justify-between gap-1">
                  {DRAW_BARS.map(([name, label]) => {
                    const raw = Math.round(valueOf(name) * 8);
                    return (
                      <div key={name} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <input
                          type="range"
                          min={0}
                          max={8}
                          step={1}
                          value={raw}
                          onChange={(event) => void setPhysical(name, Number(event.target.value), 8)}
                          aria-label={label}
                          className="h-28 w-4"
                          style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#0A84FF' }}
                        />
                        <span className="text-[11px] font-bold text-white">{raw}</span>
                        <NumberField
                          value={raw}
                          min={0}
                          max={8}
                          step={1}
                          decimals={0}
                          compact
                          onChange={(value) => void setNamed(name, value / 8)}
                        />
                        <span className="text-[8px]" style={{ color: '#8E8E93' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="space-y-3">
                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Percussão</div>
                  <div className="flex flex-wrap gap-1">
                    <ChoiceButton active={valueOf('Percussao') > 0.5} onClick={() => void setNamed('Percussao', valueOf('Percussao') > 0.5 ? 0 : 1)}>Ligado</ChoiceButton>
                    <ChoiceButton active={valueOf('Volume da percussao') < 0.5} onClick={() => void setNamed('Volume da percussao', 0.3)}>Suave</ChoiceButton>
                    <ChoiceButton active={valueOf('Volume da percussao') >= 0.5} onClick={() => void setNamed('Volume da percussao', 0.7)}>Normal</ChoiceButton>
                    <ChoiceButton active={valueOf('Decaimento da percussao') < 0.5} onClick={() => void setNamed('Decaimento da percussao', 0.3)}>Lenta</ChoiceButton>
                    <ChoiceButton active={valueOf('Decaimento da percussao') >= 0.5} onClick={() => void setNamed('Decaimento da percussao', 0.7)}>Rápida</ChoiceButton>
                    <ChoiceButton active={valueOf('Harmonico da percussao') < 0.5} onClick={() => void setNamed('Harmonico da percussao', 0.3)}>2º Harm.</ChoiceButton>
                    <ChoiceButton active={valueOf('Harmonico da percussao') >= 0.5} onClick={() => void setNamed('Harmonico da percussao', 0.7)}>3º Harm.</ChoiceButton>
                  </div>
                </section>

                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Vibrato / Chorus</div>
                  <div className="flex flex-wrap gap-1">
                    <ChoiceButton active={valueOf('Vibrato/Chorus') < 0.5} onClick={() => void setNamed('Vibrato/Chorus', 0)}>Desligado</ChoiceButton>
                    {['V1', 'V2', 'V3', 'C1', 'C2', 'C3'].map((name, index) => (
                      <ChoiceButton key={name} active={Math.round(valueOf('Vibrato/Chorus') * 6) === index + 1} onClick={() => void setNamed('Vibrato/Chorus', (index + 1) / 6)}>{name}</ChoiceButton>
                    ))}
                  </div>
                </section>

                <section className="hw-inset p-3">
                  <div className="hw-label mb-2">Leslie</div>
                  <div className="flex flex-wrap gap-1">
                    {['Parado', 'Lento', 'Rápido', 'Freio'].map((name, index) => (
                      <ChoiceButton key={name} active={Math.round(valueOf('Leslie (0 parado, 1 lento, 2 rapido, 3 freio)') * 3) === index} onClick={() => void setNamed('Leslie (0 parado, 1 lento, 2 rapido, 3 freio)', index / 3)}>{name}</ChoiceButton>
                    ))}
                  </div>

                </section>
              </div>
            </div>

            <details className="hw-inset p-3">
              <summary className="hw-label cursor-pointer select-none">Digitar valores</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {params.map((item) => {
                  const isDrawbar = item.name.startsWith('Drawbar');
                  const isLeslie = item.name.startsWith('Leslie');
                  const isVibrato = item.name === 'Vibrato/Chorus';
                  const min = isDrawbar ? 0 : isLeslie ? 0 : isVibrato ? 0 : 0;
                  const max = isDrawbar ? 8 : isLeslie ? 3 : isVibrato ? 6 : 1;
                  const step = isDrawbar || isLeslie || isVibrato ? 1 : 0.01;
                  const decimals = isDrawbar || isLeslie || isVibrato ? 0 : 2;
                  const real = min + item.value * (max - min);
                  return (
                    <label key={item.index} className="flex items-center justify-between gap-2 rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="truncate text-[10px]" style={{ color: '#C6C6CB' }}>{item.name}</span>
                      <NumberField
                        value={real}
                        min={min}
                        max={max}
                        step={step}
                        decimals={decimals}
                        onChange={(value) => void setNamed(item.name, max > min ? (value - min) / (max - min) : 0)}
                      />
                    </label>
                  );
                })}
              </div>
            </details>
            </div>
          ) : kind === 'dexed' ? (
            <DexedPanel
              params={params}
              program={displayedProgram}
              programNames={programNames}
              onChange={setNamed}
              onProgram={changeProgram}
              onImport={importCartridge}
              importBusy={importing}
              importMessage={importMessage}
            />
          ) : kind === 'zyn' ? (
            <ZynPanel
              params={params}
              program={displayedProgram}
              programNames={programNames}
              onChange={setNamed}
              onProgram={changeProgram}
              onImport={importCartridge}
              importBusy={importing}
              importMessage={importMessage}
            />
          ) : kind === 'tines' ? (
            <div className="space-y-3">
              <section className="hw-inset p-3">
                <div className="hw-label mb-2">Presets</div>
                <div className="flex flex-wrap gap-1">
                  {programNames.slice(0, programCount).map((name, index) => (
                    <ChoiceButton key={name} active={program === index} onClick={() => void changeProgram(index)}>{name}</ChoiceButton>
                  ))}
                </div>
              </section>

              <section className="hw-inset p-3">
                <div className="hw-label mb-2">MDA ePiano</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <ParamKnob defaultOf={defaultOf} label="Decaimento" paramName="Envelope Decay" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Liberação" paramName="Envelope Release" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Dureza" paramName="Hardness" min={-50} max={50} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Brilho (agudos)" paramName="Treble Boost" min={-50} max={50} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />

                  <ParamKnob defaultOf={defaultOf} label="Modulação" paramName="Modulation" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed}
                    display={(v) => v > 0.5001 ? `Trem ${Math.round((v - 0.5) * 200)}%` : v < 0.4999 ? `Pan ${Math.round((0.5 - v) * 200)}%` : 'Desligado'} />
                  <div className="flex flex-col items-center gap-1">
                    <Knob
                      label="Taxa do LFO"
                      value={valueOf('LFO Rate')}
                      display={`${Math.exp(6.22 * valueOf('LFO Rate') - 2.61).toFixed(2)} Hz`}
                      onChange={(value) => void setNamed('LFO Rate', value)}
                      onReset={() => {
                        const fallback = defaultOf('LFO Rate');
                        if (fallback !== undefined) void setNamed('LFO Rate', fallback);
                      }}
                    />
                    <NumberField
                      value={Math.exp(6.22 * valueOf('LFO Rate') - 2.61)}
                      min={0.07}
                      max={37}
                      step={0.01}
                      decimals={2}
                      onChange={(hz) => void setNamed('LFO Rate', Math.max(0, Math.min(1, (Math.log(Math.max(0.001, hz)) + 2.61) / 6.22)))}
                    />
                  </div>
                  <ParamKnob defaultOf={defaultOf} label="Sensib. velocity" paramName="Velocity Sensitivity" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Largura estéreo" paramName="Stereo Width" min={0} max={200} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />

                  <ParamKnob defaultOf={defaultOf} label="Polifonia" paramName="Polyphony" min={1} max={32} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)} vozes`} />
                  <ParamKnob defaultOf={defaultOf} label="Afinação fina" paramName="Fine Tuning" min={-50} max={50} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)} cents`} />
                  <ParamKnob defaultOf={defaultOf} label="Variação por nota" paramName="Random Tuning" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${(50 * v * v).toFixed(1)} cents`} />
                  <ParamKnob defaultOf={defaultOf} label="Overdrive" paramName="Overdrive" min={0} max={100} step={0.1} decimals={1} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(1)}%`} />

                  <ParamKnob defaultOf={defaultOf} label="Gain" paramName="Gain" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Volume" paramName="Volume" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
                </div>
                <p className="mt-3 text-[9px]" style={{ color: '#8E8E93' }}>
                  Base: MDA ePiano (MIT). CC1 (modulação) controla a profundidade do tremolo/auto-pan.
                </p>
              </section>
            </div>
          ) : kind === 'reeds' ? (
            <div className="space-y-3">
              <section className="hw-inset p-3">
                <div className="hw-label mb-2">Presets</div>
                <div className="flex flex-wrap gap-1">
                  {programNames.slice(0, programCount).map((name, index) => (
                    <ChoiceButton key={name} active={program === index} onClick={() => void changeProgram(index)}>{name}</ChoiceButton>
                  ))}
                </div>
              </section>

              <section className="hw-inset p-3">
                <div className="hw-label mb-2">OpenWurli — Wurlitzer 200A</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <ParamKnob defaultOf={defaultOf} label="Volume" paramName="Volume" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Tremolo" paramName="Tremolo Depth" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="Speaker" paramName="Speaker Character" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                  <ParamKnob defaultOf={defaultOf} label="MLP" paramName="MLP Corrections" min={0} max={1} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => v > 0.5 ? 'Ligado' : 'Desligado'} />

                  <ParamKnob defaultOf={defaultOf} label="Hammer" paramName="Hammer Contact" min={0.5} max={2} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => v.toFixed(2)} />
                  <ParamKnob defaultOf={defaultOf} label="Damper" paramName="Damper" min={0.25} max={4} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => v.toFixed(2)} />
                  <ParamKnob defaultOf={defaultOf} label="Reed trim" paramName="Reed Bar Trim" min={0} max={25000} step={10} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)} Ω`} />
                  <ParamKnob defaultOf={defaultOf} label="Noise" paramName="Noise" min={0} max={1} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => v > 0.5 ? 'Ligado' : 'Desligado'} />
                  <ParamKnob defaultOf={defaultOf} label="Noise gain" paramName="Noise Gain" min={0} max={100} step={1} decimals={0} valueOf={valueOf} setNamed={setNamed} display={(v) => `${v.toFixed(0)}%`} />
                </div>
                <p className="mt-3 text-[9px]" style={{ color: '#8E8E93' }}>
                  Base: OpenWurli (GPL-3.0-or-later). CC1 (modulação) controla a profundidade do tremolo.
                </p>
              </section>
            </div>
          ) : kind === 'synth2' ? (
            <Synth2Panel
              layerId={layerId}
              assignment={assignment}
              params={params}
              onChange={setNamed}
              onRefresh={refresh}
              mappings={mappings}
              onLearnMapping={onLearnMapping}
              onClearMapping={onClearMapping}
              initialName={plugin?.patchName}
            />
          ) : kind === 'drums' ? (
            <DrumMachinePanel
              layerId={layerId}
              isPlaying={transportPlaying}
              onToggleTransport={onToggleTransport}
            />
          ) : (
            <MdaPanel
              kind={kind as MdaKind}
              valueOf={valueOf}
              setNamed={setNamed}
              defaultOf={defaultOf}
              activeVoices={activeVoices}
            />
          )}

          {kind === 'organ' && (
          <section className="hw-inset mt-3 p-3">
            <div className="hw-label mb-2">Som</div>
            <div className="flex flex-wrap items-start justify-around gap-3">
              <ParamKnob defaultOf={defaultOf} label="Overdrive" paramName="Overdrive" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob defaultOf={defaultOf} label="Reverb" paramName="Reverb" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob defaultOf={defaultOf} label="Key click" paramName="Key click" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${Math.round(v * 100)}%`} />
              <ParamKnob defaultOf={defaultOf} label="Volume" paramName="Volume" min={0} max={1} step={0.01} decimals={2} valueOf={valueOf} setNamed={setNamed} display={(v) => `${(v * 24 - 12).toFixed(1)} dB`} />
            </div>
          </section>
          )}

          {error && <div className="mt-2 rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>{error}</div>}
        </div>

        <footer className="flex flex-wrap items-center gap-3 px-4 py-2 text-[10px]" style={{ borderTop: '1px solid #3A3A3C', color: '#8E8E93' }}>
          <span style={{ color: '#30D158' }}>● Ativo</span>
          <span>
            Polifonia {kind === 'drums'
              ? '—'
              : mdaKind || kind === 'synth2'
                ? `${activeVoices ?? 0} / ${polyphonyMax}`
                : `${polyphonyMax}/${64}`}
          </span>
          <span>CPU —</span>
          <span>{CREDITS[kind] ?? `Motor: Preseter (${kind})`}</span>
          <span className="ml-auto truncate">{assignment.name}</span>
        </footer>

        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            resizeRef.current = { x: event.clientX, y: event.clientY, w: box.w, h: box.h };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = resizeRef.current;
            if (!start) return;
            setBox((current) => ({
              ...current,
              w: Math.max(720, Math.min(window.innerWidth - current.x, start.w + event.clientX - start.x)),
              h: Math.max(480, Math.min(window.innerHeight - current.y, start.h + event.clientY - start.y)),
            }));
          }}
          onPointerUp={() => { resizeRef.current = null; }}
          onPointerCancel={() => { resizeRef.current = null; }}
        >
          <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden="true">
            <path d="M15 9L9 15M15 13L13 15M15 5L5 15" stroke="#6E6E73" strokeWidth="1" fill="none" />
          </svg>
        </div>
      </div>
    </div>
  );
};
