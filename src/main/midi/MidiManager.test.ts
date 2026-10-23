import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiManager } from './MidiManager';

interface FakeInput {
  portNames: string[];
  openPort: ReturnType<typeof vi.fn>;
  closePort: ReturnType<typeof vi.fn>;
  isPortOpen: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  getPortCount: () => number;
  getPortName: (port: number) => string;
  emit: (message: number[]) => void;
  openedPort: number | null;
}

interface FakeOutput {
  portNames: string[];
  openPort: ReturnType<typeof vi.fn>;
  closePort: ReturnType<typeof vi.fn>;
  isPortOpen: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  getPortCount: () => number;
  getPortName: (port: number) => string;
  openedPort: number | null;
}

function midiModule(
  inputNames: string[],
  outputNames: string[],
  options: { failInputOpen?: boolean; failOutputOpen?: boolean } = {}
) {
  const inputs: FakeInput[] = [];
  const outputs: FakeOutput[] = [];

  class Input {
    portNames = [...inputNames];
    openedPort: number | null = null;
    messageHandler: ((deltaTime: number, message: number[]) => void) | null = null;
    openPort = vi.fn((port: number) => {
      if (options.failInputOpen) throw new Error('input busy');
      this.openedPort = port;
    });
    closePort = vi.fn(() => {
      this.openedPort = null;
    });
    isPortOpen = vi.fn(() => this.openedPort !== null);
    sendMessage = vi.fn();
    on = vi.fn((event: string, callback: (deltaTime: number, message: number[]) => void) => {
      if (event === 'message') this.messageHandler = callback;
    });
    getPortCount = () => this.portNames.length;
    getPortName = (port: number) => this.portNames[port];
    emit(message: number[]): void {
      this.messageHandler?.(0, message);
    }

    constructor() {
      inputs.push(this as unknown as FakeInput);
    }
  }

  class Output {
    portNames = [...outputNames];
    openedPort: number | null = null;
    openPort = vi.fn((port: number) => {
      if (options.failOutputOpen) throw new Error('output busy');
      this.openedPort = port;
    });
    closePort = vi.fn(() => {
      this.openedPort = null;
    });
    isPortOpen = vi.fn(() => this.openedPort !== null);
    sendMessage = vi.fn();
    getPortCount = () => this.portNames.length;
    getPortName = (port: number) => this.portNames[port];

    constructor() {
      outputs.push(this as unknown as FakeOutput);
    }
  }

  return {
    module: { Input, Output },
    inputs,
    outputs,
  };
}

function managerWith(inputNames = ['Keys'], outputNames = ['Synth']): {
  manager: MidiManager;
  inputs: FakeInput[];
  outputs: FakeOutput[];
} {
  const fake = midiModule(inputNames, outputNames);
  return {
    manager: new MidiManager(fake.module),
    inputs: fake.inputs,
    outputs: fake.outputs,
  };
}

describe('MidiManager without the optional module', () => {
  it('stays inert when no native module is available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manager = new MidiManager(null);
    expect(manager.listDevices()).toEqual([]);
    expect(manager.openInput('Keys')).toBe(false);
    expect(manager.openOutput('Synth')).toBe(false);
    expect(manager.sendOutput([0x90, 60, 100])).toBe(false);
    expect(manager.sendNoteOn(60, 1)).toBe(false);
    expect(manager.closeAll()).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe('MidiManager devices', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('lists input and output ports', () => {
    const { manager } = managerWith(['Keys', 'Pads'], ['Synth', 'Lights']);
    expect(manager.listDevices()).toEqual([
      { name: 'Keys', type: 'input', port: 0, connected: false },
      { name: 'Pads', type: 'input', port: 1, connected: false },
      { name: 'Synth', type: 'output', port: 0, connected: false },
      { name: 'Lights', type: 'output', port: 1, connected: false },
    ]);
  });

  it('skips ports whose names cannot be read', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = midiModule(['Good', 'Bad'], ['Out']);
    const manager = new MidiManager(fake.module);
    fake.inputs[0].getPortName = (port: number) => {
      if (port === 1) throw new Error('bad port');
      return 'Good';
    };
    fake.outputs[0].getPortName = () => {
      throw new Error('bad output');
    };
    expect(manager.listDevices()).toEqual([
      { name: 'Good', type: 'input', port: 0, connected: false },
    ]);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('opens and closes an input port and forwards messages', () => {
    const { manager, inputs } = managerWith(['Keys'], []);
    const events: Array<[string, ...unknown[]]> = [];
    manager.on('program-change', (...args) => events.push(['pc', ...args]));
    manager.on('control-change', (...args) => events.push(['cc', ...args]));
    manager.on('note-on', (...args) => events.push(['on', ...args]));
    manager.on('note-off', (...args) => events.push(['off', ...args]));
    manager.on('pitch-bend', (...args) => events.push(['pitch', ...args]));

    expect(manager.openInput('Missing')).toBe(false);
    expect(manager.openInput('Keys')).toBe(true);
    const input = inputs[1];
    expect(input.openPort).toHaveBeenCalledWith(0);
    expect(input.on).toHaveBeenCalledWith('message', expect.any(Function));

    input.emit([0xc2, 12]);
    input.emit([0xb1, 7, 99]);
    input.emit([0x90, 60, 100]);
    input.emit([0x90, 60, 0]);
    input.emit([0x81, 61, 10]);
    input.emit([0xe0, 0, 0]);
    input.emit([0xe0, 127, 127]);
    input.emit([]);
    input.emit([0xf0, 1, 2]);

    expect(events).toEqual([
      ['pc', 12, 2],
      ['cc', 7, 99, 1],
      ['on', 60, 100, 0],
      ['off', 60, 0],
      ['off', 61, 1],
      ['pitch', -8192, 0],
      ['pitch', 8191, 0],
    ]);

    expect(manager.closeInput('Keys')).toBe(true);
    expect(input.closePort).toHaveBeenCalled();
    expect(manager.closeInput('Keys')).toBe(false);
  });

  it('returns false when a port cannot be opened', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = midiModule(['Keys'], ['Synth'], {
      failInputOpen: true,
      failOutputOpen: true,
    });
    const manager = new MidiManager(fake.module);
    expect(manager.openInput('Keys')).toBe(false);
    expect(manager.openOutput('Synth')).toBe(false);
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('MidiManager output', () => {
  it('opens a named output and sends messages', () => {
    const { manager, outputs } = managerWith([], ['Synth', 'Other']);
    expect(manager.openOutput('Missing')).toBe(false);
    expect(manager.openOutput('Synth')).toBe(true);
    const output = outputs[0];
    expect(output.openPort).toHaveBeenCalledWith(0);

    expect(manager.sendOutput([0x90, 60, 100])).toBe(true);
    expect(output.sendMessage).toHaveBeenCalledWith([0x90, 60, 100]);

    expect(manager.sendNoteOn(60, 100, 2)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0x92, 60, 100]);
    expect(manager.sendNoteOff(60, 2)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0x82, 60, 0]);
    expect(manager.sendControlChange(7, 127, 1)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0xb1, 7, 127]);
    expect(manager.sendProgramChange(12, 3)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0xc3, 12]);
    expect(manager.sendProgramChange(140, 20)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0xc4, 12]);
    expect(manager.sendNoteOn(200, 300, 1)).toBe(true);
    expect(output.sendMessage).toHaveBeenLastCalledWith([0x91, 72, 44]);
  });

  it('falls back to the first listed output and reports failure without one', () => {
    const none = managerWith([], []);
    expect(none.manager.sendOutput([0x90, 60, 100])).toBe(false);

    const { manager, outputs } = managerWith([], ['First', 'Second']);
    manager.listDevices();
    expect(manager.sendOutput([0x90, 60, 100])).toBe(true);
    expect(outputs[0].openPort).toHaveBeenCalledWith(0);
    expect(outputs[0].sendMessage).toHaveBeenCalledWith([0x90, 60, 100]);
  });

  it('closes active inputs and the output', () => {
    const { manager, inputs, outputs } = managerWith(['Keys'], ['Synth']);
    manager.openInput('Keys');
    manager.openOutput('Synth');
    manager.closeAll();
    expect(inputs[1].closePort).toHaveBeenCalled();
    expect(outputs[0].closePort).toHaveBeenCalled();
    expect(manager.closeInput('Keys')).toBe(false);
  });
});
