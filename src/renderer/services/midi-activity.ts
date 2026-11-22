/** Atividade MIDI para o elemento "MIDI" do palco (LED e último evento). */

export interface MidiActivityEvent {
  direction: 'in' | 'out';
  portName?: string;
  summary: string;
  bytes: number[];
  at: number;
}

type Listener = (event: MidiActivityEvent) => void;

const listeners = new Set<Listener>();

export function emitMidiActivity (event: MidiActivityEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* um monitor com defeito não pode derrubar o roteamento MIDI */
    }
  }
}

export function subscribeMidiActivity (listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
