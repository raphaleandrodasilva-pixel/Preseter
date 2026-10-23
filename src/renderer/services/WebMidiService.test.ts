import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebMidiService, type RawMidiEvent } from './WebMidiService';

interface FakePort {
  id: string;
  name: string;
  state: 'connected' | 'disconnected';
  type: 'input' | 'output';
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

function port(
  id: string,
  name: string,
  type: 'input' | 'output',
  state: 'connected' | 'disconnected' = 'connected'
): FakePort {
  return {
    id,
    name,
    type,
    state,
    open: vi.fn(async () => undefined),
    send: vi.fn(),
    close: vi.fn(async () => undefined),
    onmidimessage: null,
  };
}

function accessWith(inputs: FakePort[], outputs: FakePort[]): MIDIAccess {
  return {
    inputs: new Map(inputs.map((item) => [item.id, item])),
    outputs: new Map(outputs.map((item) => [item.id, item])),
    sysexEnabled: false,
    onstatechange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MIDIAccess;
}

function service(): {
  midi: WebMidiService;
  programs: ReturnType<typeof vi.fn>;
  errors: ReturnType<typeof vi.fn>;
} {
  const programs = vi.fn();
  const errors = vi.fn();
  return { midi: new WebMidiService(programs, errors), programs, errors };
}

beforeEach(() => {
  vi.mocked(navigator.requestMIDIAccess).mockReset();
});

describe('WebMidiService device discovery', () => {
  it('reports when Web MIDI is unavailable', async () => {
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: undefined,
    });
    const { midi } = service();
    await expect(midi.listDevices()).rejects.toThrow(/Web MIDI/);
  });

  it('lists inputs and outputs with fallback names and connection state', async () => {
    const input = port('in-1', '', 'input', 'connected');
    const output = port('out-1', 'Output', 'output', 'disconnected');
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([input], [output]));
    const { midi } = service();

    await expect(midi.listDevices()).resolves.toEqual([
      { id: 'in-1', name: 'MIDI input', type: 'input', connected: true },
      { id: 'out-1', name: 'Output', type: 'output', connected: false },
    ]);
    expect(navigator.requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
  });
});

describe('WebMidiService input handling', () => {
  async function openedInput(): Promise<{
    midi: WebMidiService;
    input: FakePort;
    programs: ReturnType<typeof vi.fn>;
    events: RawMidiEvent[];
  }> {
    const input = port('keyboard', 'Keys', 'input');
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([input], []));
    const { midi, programs } = service();
    await midi.listDevices();
    await midi.openPort('keyboard', 'input');
    const events: RawMidiEvent[] = [];
    midi.onRawMessage((event) => events.push(event));
    return { midi, input, programs, events };
  }

  function emit(input: FakePort, bytes: number[]): void {
    input.onmidimessage?.({ data: new Uint8Array(bytes) });
  }

  it('rejects unknown input and output ids', async () => {
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([], []));
    const { midi } = service();
    await midi.listDevices();
    await expect(midi.openPort('missing', 'input')).rejects.toThrow(/entrada MIDI/);
    await expect(midi.openPort('missing', 'output')).rejects.toThrow(/sa.*da MIDI/);
  });

  it('opens an input and handles program changes with bank select', async () => {
    const { input, programs, events } = await openedInput();
    expect(input.open).toHaveBeenCalled();

    emit(input, [0xb0, 0, 2]);
    emit(input, [0xb0, 32, 5]);
    emit(input, [0xc0, 42]);

    expect(programs).toHaveBeenCalledWith(42, 0, 2, 'Keys');
    expect(events).toEqual([
      { kind: 'cc', channel: 0, number: 0, value: 2, deviceId: 'keyboard' },
      { kind: 'cc', channel: 0, number: 32, value: 5, deviceId: 'keyboard' },
      { kind: 'pc', channel: 0, number: 42, value: 2, deviceId: 'keyboard' },
    ]);
  });

  it('handles notes, note-off, CC, pitch, channel and poly aftertouch', async () => {
    const { input, events } = await openedInput();
    emit(input, [0x90, 60, 100]);
    emit(input, [0x80, 60, 40]);
    emit(input, [0xb2, 7, 120]);
    emit(input, [0xe3, 0, 64]);
    emit(input, [0xd4, 33]);
    emit(input, [0xa5, 61, 77]);

    expect(events).toEqual([
      { kind: 'note', channel: 0, number: 60, value: 100, deviceId: 'keyboard' },
      { kind: 'note', channel: 0, number: 60, value: 0, deviceId: 'keyboard' },
      { kind: 'cc', channel: 2, number: 7, value: 120, deviceId: 'keyboard' },
      { kind: 'pitch', channel: 3, number: 0, value: 8192, deviceId: 'keyboard' },
      { kind: 'aftertouch', channel: 4, number: 0, value: 33, deviceId: 'keyboard', poly: false },
      { kind: 'aftertouch', channel: 5, number: 61, value: 77, deviceId: 'keyboard', poly: true },
    ]);
  });

  it('ignores short, unknown and out-of-range program messages', async () => {
    const { input, programs, events } = await openedInput();
    emit(input, []);
    emit(input, [0x90]);
    emit(input, [0xc0, 200]);
    emit(input, [0xf8]);
    emit(input, [0x90, 60]);
    expect(programs).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('keeps MIDI running when a raw listener throws and unsubscribes', async () => {
    const { midi, input, events } = await openedInput();
    const bad = vi.fn(() => {
      throw new Error('listener');
    });
    const unsubscribe = midi.onRawMessage(bad);
    emit(input, [0x90, 60, 10]);
    expect(events).toHaveLength(1);
    unsubscribe();
    emit(input, [0x90, 61, 10]);
    expect(events).toHaveLength(2);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

describe('WebMidiService output', () => {
  it('sends only through a connected, selected output', async () => {
    const output = port('out', 'Out', 'output');
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([], [output]));
    const { midi, errors } = service();
    await midi.listDevices();
    expect(midi.hasSelectedOutput()).toBe(false);
    expect(await midi.send([0x90, 60, 100])).toBe(false);
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/sa.*da MIDI/));

    expect(await midi.openPort('out', 'output')).toBe(true);
    expect(midi.hasSelectedOutput()).toBe(true);
    expect(await midi.send([0x90, 60, 100])).toBe(true);
    expect(output.open).toHaveBeenCalled();
    expect(output.send).toHaveBeenCalledWith([0x90, 60, 100]);
  });

  it('rejects invalid MIDI messages and program changes', async () => {
    const output = port('out', 'Out', 'output');
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([], [output]));
    const { midi } = service();
    await midi.listDevices();
    await midi.openPort('out', 'output');

    await expect(midi.send([0x7f, 0, 0])).rejects.toThrow(/inv/);
    await expect(midi.send([0x90, 60])).rejects.toThrow(/inv/);
    await expect(midi.send([0x90, 200, 100])).rejects.toThrow(/inv/);
    await expect(midi.send([0x90, 60, 1.5])).rejects.toThrow(/inv/);
    await expect(midi.sendProgramChange(128, 0)).rejects.toThrow(/programa/);
    await expect(midi.sendProgramChange(0, 16)).rejects.toThrow(/canal/);
    expect(await midi.sendProgramChange(5, 3)).toBe(true);
    expect(output.send).toHaveBeenCalledWith([0xc3, 5]);
  });

  it('loses the selected output when the port disappears', async () => {
    const output = port('out', 'Out', 'output');
    vi.mocked(navigator.requestMIDIAccess)
      .mockResolvedValueOnce(accessWith([], [output]))
      .mockResolvedValueOnce(accessWith([], []));
    const { midi } = service();
    await midi.listDevices();
    await midi.openPort('out', 'output');
    expect(midi.hasSelectedOutput()).toBe(true);
    await midi.listDevices();
    expect(midi.hasSelectedOutput()).toBe(false);
  });

  it('treats a disconnected selected output as unavailable', async () => {
    const output = port('out', 'Out', 'output', 'disconnected');
    vi.mocked(navigator.requestMIDIAccess).mockResolvedValue(accessWith([], [output]));
    const { midi, errors } = service();
    await midi.listDevices();
    await midi.openPort('out', 'output');
    expect(midi.hasSelectedOutput()).toBe(false);
    expect(await midi.send([0x90, 1, 1])).toBe(false);
    expect(errors).toHaveBeenCalled();
  });
});
