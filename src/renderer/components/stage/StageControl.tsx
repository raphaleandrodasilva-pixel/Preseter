import React, { useEffect, useRef, useState } from 'react';
import type { AudioInputSettings, AudioInputState, PlaybackState, UiElement } from '@shared/types';
import { AudioInputControl } from './AudioInputControl';
import { KeyboardControl } from './KeyboardControl';
import type { KeyboardZone } from './KeyboardControl';
import {
  ActivityFace,
  ButtonFace,
  DrawbarFace,
  FaceButton,
  FaderFace,
  KnobFace,
  LabelFace,
  MeterFace,
  PadFace,
  PedalFace,
  PlaybackFace,
  SliderFace,
  ToggleFace,
} from './faces';

interface StageControlProps {
  element: UiElement;
  channel: number;
  /** 'absolute' = posicionado via x/y (canvas livre); 'static' = fluxo (seções) */
  layoutMode?: 'absolute' | 'static';
  activeNotes?: Set<number>;
  onMidiMessage: (message: number[]) => void;
  onSetVstParameter: (pluginPath: string, parameterId: string, value: number) => void;
  keyboardZones?: KeyboardZone[];
  selectedZoneId?: string | null;
  onZoneClick?: (id: string) => void;
  /** Valor salvo usado pelo duplo clique para voltar à posição inicial. */
  resetValue?: number;
  /** Playback opcional no Layout. */
  playbackState?: PlaybackState | null;
  onLoadPlayback?: () => void;
  onPlayPlayback?: () => void;
  onStopPlayback?: () => void;
  /** Entrada de áudio opcional no Layout. */
  audioInput?: AudioInputSettings;
  audioInputState?: AudioInputState | null;
  audioInputChannels?: number;
  audioInputEditable?: boolean;
  onAudioInputChange?: (update: Partial<AudioInputSettings>) => void;
  onEnableAudioInput?: () => void;
  onDisableAudioInput?: () => void;
  onResetAudioFeedback?: () => void;
  onKeepAudioInputMuted?: () => void;
  onDisableAudioFeedbackProtection?: () => void;
}

function normOf(value: number, min: number, max: number): number {
  const span = Math.max(max - min, Number.EPSILON);
  return Math.max(0, Math.min(1, (value - min) / span));
}

export const StageControl: React.FC<StageControlProps> = ({
  element,
  channel,
  layoutMode = 'absolute',
  activeNotes,
  onMidiMessage,
  onSetVstParameter,
  keyboardZones,
  selectedZoneId,
  onZoneClick,
  resetValue,
  playbackState,
  onLoadPlayback,
  onPlayPlayback,
  onStopPlayback,
  audioInput,
  audioInputState,
  audioInputChannels = 0,
  audioInputEditable = true,
  onAudioInputChange,
  onEnableAudioInput,
  onDisableAudioInput,
  onResetAudioFeedback,
  onKeepAudioInputMuted,
  onDisableAudioFeedbackProtection,
}) => {
  const [value, setValue] = useState(element.value ?? 0.5);
  const min = element.minValue ?? 0;
  const max = element.maxValue ?? 1;
  const drag = useRef<{ kind: 'v' | 'h' | 'knob' | 'drawbar'; startX: number; startY: number; startNorm: number } | null>(null);

  useEffect(() => {
    setValue(element.value ?? 0.5);
  }, [element.id, element.value]);

  const sendValue = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    setValue(clamped);
    if (element.pluginPath && element.parameterId) {
      const normalized = normOf(clamped, min, max);
      const mappingMin = element.mappingMin ?? 0;
      const mappingMax = element.mappingMax ?? 1;
      onSetVstParameter(
        element.pluginPath,
        element.parameterId,
        mappingMin + normalized * (mappingMax - mappingMin)
      );
    }
    const binding = element.midiCommand;
    if (binding?.type === 'cc' && binding.controllerNumber !== undefined) {
      const midiValue = Math.round(normOf(clamped, min, max) * 127);
      onMidiMessage([0xb0 | (binding.channel ?? channel), binding.controllerNumber, midiValue]);
    }
  };

  const activate = () => {
    const binding = element.midiCommand;
    if (binding?.type === 'note') {
      const note = element.noteNumber ?? binding.controllerNumber ?? 60;
      onMidiMessage([0x90 | (binding.channel ?? channel), note, element.velocity ?? 100]);
      if (element.isMomentary) {
        window.setTimeout(() => onMidiMessage([0x80 | (binding.channel ?? channel), note, 0]), 120);
      }
    } else if (binding?.type === 'pc' && binding.programNumber !== undefined) {
      onMidiMessage([0xc0 | (binding.channel ?? channel), binding.programNumber]);
    }
  };

  const norm = normOf(value, min, max);
  const isOn = value >= (min + max) / 2;

  const valueOfNorm = (n: number) => min + Math.max(0, Math.min(1, n)) * (max - min);

  const setDrawbarFromTrack = (target: HTMLElement, clientY: number) => {
    const rect = target.getBoundingClientRect();
    const n = 1 - (clientY - rect.top) / rect.height;
    sendValue(Math.round(Math.max(0, Math.min(1, n)) * max));
  };
  const beginDrawbarDrag = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: 'drawbar', startX: e.clientX, startY: e.clientY, startNorm: norm };
    setDrawbarFromTrack(e.currentTarget as HTMLElement, e.clientY);
  };
  const moveDrawbarDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== 'drawbar') return;
    if (!(e.buttons & 1)) return;
    setDrawbarFromTrack(e.currentTarget as HTMLElement, e.clientY);
  };

  const beginKnobDrag = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: 'knob', startX: e.clientX, startY: e.clientY, startNorm: norm };
  };
  const moveKnobDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== 'knob') return;
    sendValue(valueOfNorm(d.startNorm + (d.startY - e.clientY) / 150));
  };
  const setFromTrack = (target: HTMLElement, clientX: number, clientY: number, vertical: boolean) => {
    const rect = target.getBoundingClientRect();
    const n = vertical ? 1 - (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
    sendValue(valueOfNorm(n));
  };
  const beginTrackDrag = (e: React.PointerEvent, vertical: boolean) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: vertical ? 'v' : 'h', startX: e.clientX, startY: e.clientY, startNorm: norm };
    setFromTrack(e.currentTarget as HTMLElement, e.clientX, e.clientY, vertical);
  };
  const moveTrackDrag = (vertical: boolean) => (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!(e.buttons & 1)) return;
    setFromTrack(e.currentTarget as HTMLElement, e.clientX, e.clientY, vertical);
  };
  const endDrag = () => {
    drag.current = null;
  };
  const resetToInitial = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    drag.current = null;
    sendValue(resetValue ?? element.value ?? 0.5);
  };

  const style: React.CSSProperties =
    layoutMode === 'absolute'
      ? {
          left: element.x,
          top: element.y,
          width: element.type === 'keyboard' ? Math.max(element.width, 560) : element.width,
          minWidth: element.type === 'keyboard' ? 560 : undefined,
          height: element.height,
        }
      : element.type === 'keyboard'
        ? { width: '100%' }
        : { width: element.width === 0 ? undefined : Math.min(element.width, 220) };
  if (element.color && layoutMode === 'absolute') {
    style.color = element.color;
  }

  return (
    <div
      className={`stg-ctl${layoutMode === 'absolute' ? ' stg-ctl-boxed stg-canvas-abs' : ''}${element.type === 'keyboard' ? ' stg-ctl-keyboard' : ''}`}
      style={style}
    >
      {element.type === 'knob' && (
        <KnobFace
          label={element.label}
          norm={norm}
          bodyProps={{
            title: `${element.label} — arrastar para girar · duplo clique volta ao inicial`,
            onPointerDown: beginKnobDrag,
            onPointerMove: moveKnobDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick: resetToInitial,
          }}
        />
      )}
      {element.type === 'fader' && (
        <FaderFace
          label={element.label}
          norm={norm}
          trackProps={{
            title: `${element.label} — arrastar · duplo clique volta ao inicial`,
            onPointerDown: (e) => beginTrackDrag(e, true),
            onPointerMove: moveTrackDrag(true),
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick: resetToInitial,
          }}
        />
      )}
      {element.type === 'slider' && (
        <SliderFace
          label={element.label}
          norm={norm}
          trackProps={{
            title: `${element.label} — arrastar · duplo clique volta ao inicial`,
            onPointerDown: (e) => beginTrackDrag(e, false),
            onPointerMove: moveTrackDrag(false),
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick: resetToInitial,
          }}
        />
      )}
      {element.type === 'button' && (
        <FaceButton title={element.label} onActivate={activate}>
          <ButtonFace label={element.label} />
        </FaceButton>
      )}
      {element.type === 'toggle' && (
        <FaceButton
          title={element.label}
          onActivate={() => {
            sendValue(isOn ? min : max);
            activate();
          }}
        >
          <ToggleFace label={element.label} on={isOn} />
        </FaceButton>
      )}
      {element.type === 'pad' && (
        <FaceButton title={element.label} onActivate={activate}>
          <PadFace label={element.label} />
        </FaceButton>
      )}
      {element.type === 'pedal' && (
        element.isMomentary ? (
          <FaceButton
            title={element.label}
            onActivate={activate}
            onPress={(down) => sendValue(down ? max : min)}
          >
            <PedalFace label={element.label} active={isOn} />
          </FaceButton>
        ) : (
          <div
            className="hw-facebutton flex touch-none select-none flex-col items-center justify-center"
            title={`${element.label} — arraste para cima/baixo · duplo clique volta ao inicial`}
            style={{ padding: 4 }}
            onPointerDown={(event) => beginTrackDrag(event, true)}
            onPointerMove={moveTrackDrag(true)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={resetToInitial}
          >
            <PedalFace label={element.label} active={isOn} value={norm} />
            <span className="hw-badge mt-1" style={{ fontSize: 9 }}>{Math.round(norm * 127)}</span>
          </div>
        )
      )}
      {element.type === 'drawbar' && (
        <DrawbarFace
          label={element.label}
          value={value}
          max={max}
          trackProps={{
            title: `${element.label} — arrastar (0–${Math.round(max)}) · duplo clique volta ao inicial`,
            onPointerDown: beginDrawbarDrag,
            onPointerMove: moveDrawbarDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick: resetToInitial,
          }}
        />
      )}
      {element.type === 'playback' && (
        <PlaybackFace
          state={playbackState}
          onLoad={onLoadPlayback}
          onPlay={onPlayPlayback}
          onStop={onStopPlayback}
        />
      )}
      {element.type === 'audio-input' && (
        <AudioInputControl
          settings={audioInput}
          state={audioInputState}
          channels={audioInputChannels}
          editable={audioInputEditable}
          onChange={onAudioInputChange}
          onEnable={onEnableAudioInput}
          onDisable={onDisableAudioInput}
          onResetFeedback={onResetAudioFeedback}
          onKeepMuted={onKeepAudioInputMuted}
          onDisableProtection={onDisableAudioFeedbackProtection}
        />
      )}
      {element.type === 'meter-vertical' && (
        <MeterFace label={element.label} norm={norm} horizontal={element.orientation === 'horizontal'} />
      )}
      {element.type === 'midi-activity' && <ActivityFace label={element.label} />}
      {element.type === 'label' && <LabelFace label={element.label} />}
      {element.type === 'keyboard' && (
        <KeyboardControl
          low={element.keyboardLow ?? 36}
          high={element.keyboardHigh ?? 84}
          splitNote={element.keyboardSplit ?? null}
          lowerLabel={element.keyboardLowerLabel ?? 'Lower'}
          upperLabel={element.keyboardUpperLabel ?? 'Upper'}
          lowerColor={element.keyboardLowerColor ?? '#0A84FF'}
          upperColor={element.keyboardUpperColor ?? '#F2F2F2'}
          defaultVelocity={element.velocity ?? 100}
          compact
          interactive
          activeNotes={activeNotes}
          zones={keyboardZones}
          selectedZoneId={selectedZoneId}
          onZoneClick={onZoneClick}
          foot={element.label}
          channel={element.keyboardChannel ?? channel}
          onNoteOn={(note, velocity) =>
            onMidiMessage([0x90 | (element.keyboardChannel ?? channel), note, velocity])
          }
          onNoteOff={(note) =>
            onMidiMessage([0x80 | (element.keyboardChannel ?? channel), note, 0])
          }
          onPitchBend={(v) => {
            const raw = Math.round(8192 + v * 8191);
            onMidiMessage([0xe0 | (element.keyboardChannel ?? channel), raw & 0x7f, (raw >> 7) & 0x7f]);
          }}
          onModulation={(v) =>
            onMidiMessage([0xb0 | (element.keyboardChannel ?? channel), 1, Math.round(v * 127)])
          }
        />
      )}
    </div>
  );
};
