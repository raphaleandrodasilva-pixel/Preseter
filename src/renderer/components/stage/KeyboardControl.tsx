import React, { useMemo, useRef, useState } from 'react';

export interface KeyboardZone {
  id: string;
  label: string;
  low: number;
  high: number;
  color: string;
}

export interface KeyboardControlProps {
  /** Nota MIDI mais grave (default C2 = 36) */
  low?: number;
  /** Nota MIDI mais aguda (default C6 = 84) */
  high?: number;
  /** Nota de corte do split (null = sem split) */
  splitNote?: number | null;
  lowerLabel?: string;
  upperLabel?: string;
  lowerColor?: string;
  upperColor?: string;
  channel?: number;
  defaultVelocity?: number;
  /** Notas acesas por entrada MIDI externa */
  activeNotes?: Set<number> | readonly number[];
  interactive?: boolean;
  compact?: boolean;
  /** Mostra botões de oitava -/+ */
  octaveShift?: boolean;
  /** Mostra rodas de pitch bend + modulation à esquerda */
  wheels?: boolean;
  foot?: string;
  onNoteOn?: (note: number, velocity: number) => void;
  onNoteOff?: (note: number) => void;
  /** -1..1, 0 = centro */
  onPitchBend?: (value: number) => void;
  /** 0..1 */
  onModulation?: (value: number) => void;
  /** Layers de channel strips exibidas acima do teclado (MainStage). */
  zones?: KeyboardZone[];
  selectedZoneId?: string | null;
  onZoneClick?: (id: string) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Roda vertical navy (pitch com mola / mod presa). */
const Wheel: React.FC<{
  label: string;
  value: number;
  springy: boolean;
  compact?: boolean;
  showLabel?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onRelease?: () => void;
}> = ({ label, value, springy, compact = false, showLabel = true, disabled, onChange, onRelease }) => {
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  // value: pitch -1..1 | mod 0..1 — posição do indicador (0 topo .. 1 base)
  const pos = springy ? (1 - value) / 2 : 1 - value;
  const trackHeight = compact ? 80 : 132;
  const thumbHeight = compact ? 22 : 28;
  const thumbTop = 2 + (trackHeight - thumbHeight - 4) * pos;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${compact ? 'w-4 rounded' : 'w-8 rounded-lg'} overflow-hidden`}
        style={{
          height: trackHeight,
          background: '#242426',
          border: '1px solid #3A3A3C',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7)',
          cursor: disabled ? 'default' : 'ns-resize',
          touchAction: 'none',
        }}
        title={label}
        onPointerDown={(event) => {
          if (disabled) return;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          drag.current = { startY: event.clientY, startValue: value };
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (!d) return;
          const delta = (d.startY - event.clientY) / 120;
          if (springy) onChange(Math.max(-1, Math.min(1, d.startValue + delta * 2)));
          else onChange(Math.max(0, Math.min(1, d.startValue + delta)));
        }}
        onPointerUp={() => {
          drag.current = null;
          onRelease?.();
        }}
        onPointerCancel={() => {
          drag.current = null;
          onRelease?.();
        }}
      >
        {springy && (
          <div style={{ position: 'absolute', left: 3, right: 3, top: '50%', height: 1, background: '#3A3A41' }} />
        )}
        <div
          style={{
            position: 'absolute',
            left: compact ? 2 : 4,
            right: compact ? 2 : 4,
            top: thumbTop,
            height: thumbHeight,
            borderRadius: compact ? 3 : 5,
            background: 'repeating-linear-gradient(to bottom, #2A2A2F 0 2px, #242426 2px 5px)',
            border: '1px solid #3A3A41',
            boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        />
      </div>
      {showLabel && <span className="hw-label" style={{ fontSize: 8 }}>{label}</span>}
    </div>
  );
};

export const KeyboardControl: React.FC<KeyboardControlProps> = ({
  low = 36,
  high = 84,
  splitNote = 60,
  lowerLabel = 'Piano',
  upperLabel = 'Strings',
  lowerColor = '#c9a227',
  upperColor = '#3fae5a',
  defaultVelocity = 100,
  activeNotes,
  interactive = true,
  compact = false,
  octaveShift = true,
  wheels = true,
  foot,
  onNoteOn,
  onNoteOff,
  onPitchBend,
  onModulation,
  zones,
  selectedZoneId,
  onZoneClick,
}) => {
  const [shift, setShift] = useState(0);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [pitch, setPitch] = useState(0);
  const [mod, setMod] = useState(0);
  const pointerNotes = useRef(new Map<number, number>());

  const effLow = Math.max(0, Math.min(127, low + shift));
  const effHigh = Math.max(0, Math.min(127, high + shift));

  const { whites, blacks, lowerPct } = useMemo(() => {
    const whiteNotes: number[] = [];
    const blackNotes: number[] = [];
    for (let n = effLow; n <= effHigh; n += 1) {
      if (WHITE_PCS.has(n % 12)) whiteNotes.push(n);
      else blackNotes.push(n);
    }
    const positionedBlacks = blackNotes.map((n) => {
      let below = 0;
      for (const w of whiteNotes) {
        if (w < n) below += 1;
        else break;
      }
      return {
        note: n,
        leftPct: whiteNotes.length > 0 ? (below / whiteNotes.length) * 100 : 50,
        widthPct: whiteNotes.length > 0 ? Math.min(7, (0.62 / whiteNotes.length) * 100) : 7,
      };
    });
    const total = Math.max(effHigh - effLow, 1);
    const split = splitNote ?? effLow;
    return {
      whites: whiteNotes,
      blacks: positionedBlacks,
      lowerPct: Math.max(0, Math.min(100, ((split - effLow) / total) * 100)),
    };
  }, [effLow, effHigh, splitNote]);

  const remote = useMemo(() => new Set(activeNotes ?? []), [activeNotes]);
  const isLit = (note: number) => remote.has(note) || held.has(note);

  const zoneRows = useMemo(() => {
    if (!zones || zones.length === 0 || whites.length === 0) return [];
    return zones
      .map((zone) => {
        const low = Math.max(effLow, zone.low);
        const high = Math.min(effHigh, zone.high);
        if (low > high) return null;
        const first = whites.findIndex((note) => note >= low);
        const last = whites.reduce((acc, note, index) => (note <= high ? index : acc), -1);
        if (first < 0 || last < first) return null;
        return {
          ...zone,
          left: (first / whites.length) * 100,
          width: ((last - first + 1) / whites.length) * 100,
        };
      })
      .filter((zone): zone is KeyboardZone & { left: number; width: number } => zone !== null);
  }, [zones, whites, effLow, effHigh]);

  const press = (note: number, pointerId: number) => {
    if (!interactive) return;
    const prev = pointerNotes.current.get(pointerId);
    if (prev !== undefined && prev !== note) {
      onNoteOff?.(prev);
      setHeld((heldPrev) => {
        const next = new Set(heldPrev);
        next.delete(prev);
        return next;
      });
    }
    pointerNotes.current.set(pointerId, note);
    onNoteOn?.(note, defaultVelocity);
    setHeld((heldPrev) => new Set(heldPrev).add(note));
  };

  const release = (pointerId: number) => {
    const note = pointerNotes.current.get(pointerId);
    if (note === undefined) return;
    pointerNotes.current.delete(pointerId);
    // Só apaga se nenhum outro ponteiro segura a mesma nota
    if (![...pointerNotes.current.values()].includes(note)) {
      onNoteOff?.(note);
      setHeld((heldPrev) => {
        const next = new Set(heldPrev);
        next.delete(note);
        return next;
      });
    }
  };

  const keyHandlers = (note: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if (!interactive) return;
      event.preventDefault();
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // Em alguns ambientes (ou eventos sintéticos) o capture não está
        // disponível; mesmo assim a nota deve tocar.
      }
      press(note, event.pointerId);
    },
    onPointerEnter: (event: React.PointerEvent) => {
      if (!interactive) return;
      if (event.buttons & 1) press(note, event.pointerId);
    },
    onPointerUp: (event: React.PointerEvent) => release(event.pointerId),
    onPointerCancel: (event: React.PointerEvent) => release(event.pointerId),
    onLostPointerCapture: (event: React.PointerEvent) => release(event.pointerId),
  });

  const canDown = effLow - 12 >= 0 || effHigh - 12 >= 0;
  const canUp = effLow + 12 <= 127 || effHigh + 12 <= 127;

  return (
    <div className={`stg-keys${compact ? ' stg-keys-compact' : ''}`}>
      {zoneRows.length > 0 && (
        <div className="relative mb-1" style={{ height: zoneRows.length * 15 }}>
          {zoneRows.map((zone, index) => (
            <button
              type="button"
              key={zone.id}
              onClick={() => onZoneClick?.(zone.id)}
              className="absolute flex h-[13px] items-center overflow-hidden rounded px-1 text-[9px] font-semibold"
              style={{
                left: `${zone.left}%`,
                width: `${Math.max(zone.width, 2)}%`,
                top: index * 15,
                background: zone.color,
                color: '#101014',
                border: selectedZoneId === zone.id ? '1px solid #FFFFFF' : '1px solid rgba(0,0,0,0.35)',
                boxShadow: selectedZoneId === zone.id ? '0 0 8px rgba(255,255,255,0.35)' : undefined,
                opacity: selectedZoneId && selectedZoneId !== zone.id ? 0.65 : 1,
              }}
              title={`${zone.label} · ${noteName(zone.low)}–${noteName(zone.high)}`}
            >
              <span className="truncate">{zone.label}</span>
            </button>
          ))}
        </div>
      )}
      {!compact && zoneRows.length === 0 && splitNote !== null && splitNote !== undefined && (
        <div className="stg-layerbar" aria-hidden>
          <div className="stg-layer" style={{ width: `${lowerPct}%`, background: lowerColor }}>
            {lowerLabel}
          </div>
          <div className="stg-layer" style={{ width: `${100 - lowerPct}%`, background: upperColor }}>
            {upperLabel}
          </div>
        </div>
      )}
      <div className="flex items-stretch gap-2">
        {wheels && (
          <div className="flex shrink-0 items-stretch gap-1.5 py-0.5">
            <Wheel
              label="Pitch"
              value={pitch}
              springy
              compact={compact}
              showLabel={!compact}
              disabled={!interactive}
              onChange={(v) => {
                setPitch(v);
                onPitchBend?.(v);
              }}
              onRelease={() => {
                setPitch(0);
                onPitchBend?.(0);
              }}
            />
            <Wheel
              label="Mod"
              value={mod}
              springy={false}
              compact={compact}
              showLabel={!compact}
              disabled={!interactive}
              onChange={(v) => {
                setMod(v);
                onModulation?.(v);
              }}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
      <div className="stg-keyboard" style={{ cursor: interactive ? 'pointer' : 'default' }}>
        {whites.map((note) => (
          <div
            key={note}
            className={`stg-white${isLit(note) ? ' stg-keylit' : ''}`}
            title={`${noteName(note)} (${note})`}
            {...keyHandlers(note)}
          >
            {note % 12 === 0 && <span className="stg-cnote">{noteName(note)}</span>}
          </div>
        ))}
        {blacks.map(({ note, leftPct, widthPct }) => (
          <div
            key={note}
            className={`stg-black${isLit(note) ? ' stg-blacklit' : ''}`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={`${noteName(note)} (${note})`}
            {...keyHandlers(note)}
          />
        ))}
      </div>
        </div>
      </div>
      <div className="stg-keysfoot">
        {octaveShift ? (
          <span className="stg-octshift">
            <button
              className="stg-octbtn"
              disabled={!interactive || !canDown}
              onClick={() => setShift((s) => s - 12)}
              title="Oitava abaixo"
            >
              −
            </button>
            <span
              className={compact ? 'hw-label' : undefined}
              title={`${noteName(effLow)} – ${noteName(effHigh)}`}
            >
              {compact ? foot ?? '' : `${noteName(effLow)} – ${noteName(effHigh)}${foot ? ` · ${foot}` : ''}`}
            </span>
            <button
              className="stg-octbtn"
              disabled={!interactive || !canUp}
              onClick={() => setShift((s) => s + 12)}
              title="Oitava acima"
            >
              +
            </button>
          </span>
        ) : (
          <span className={compact ? 'hw-label' : undefined}>
            {compact ? foot ?? '' : `${noteName(effLow)} – ${noteName(effHigh)}${foot ? ` · ${foot}` : ''}`}
          </span>
        )}
      </div>
    </div>
  );
};
