export interface MidiDeviceInfo {
  id: string;
  name: string;
  type: 'input' | 'output';
  connected: boolean;
}

export type RawMidiKind = 'note' | 'cc' | 'pc' | 'pitch' | 'aftertouch';

export interface RawMidiEvent {
  kind: RawMidiKind;
  channel: number;
  /** nota (note), controller (cc) ou programa (pc) */
  number: number;
  /** velocity / valor (0 para note-off) */
  value: number;
  /** Porta/dispositivo que enviou a mensagem (id do Web MIDI). */
  deviceId?: string;
}

export class WebMidiService {
  private access: MIDIAccess | null = null;
  private readonly inputs = new Map<string, MIDIInput>();
  private readonly outputs = new Map<string, MIDIOutput>();
  private selectedOutputId: string | null = null;
  private readonly rawListeners = new Set<(event: RawMidiEvent) => void>();
  private readonly bankMsb = new Array<number>(16).fill(0);
  private readonly bankLsb = new Array<number>(16).fill(0);

  constructor(
    private readonly onProgramChange: (program: number, channel: number, bank: number, deviceName: string) => void,
    private readonly onError: (message: string) => void
  ) {}

  /** Assina mensagens brutas (note/cc/pc) — usado pelo MIDI Learn. Retorna unsubscribe. */
  onRawMessage(listener: (event: RawMidiEvent) => void): () => void {
    this.rawListeners.add(listener);
    return () => {
      this.rawListeners.delete(listener);
    };
  }

  async listDevices(): Promise<MidiDeviceInfo[]> {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI não está disponível nesta versão do Electron.');
    }

    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.refreshPorts();

    return [
      ...Array.from(this.inputs.values(), (port) => this.toDeviceInfo(port, 'input')),
      ...Array.from(this.outputs.values(), (port) => this.toDeviceInfo(port, 'output')),
    ];
  }

  async openPort(deviceId: string, type: 'input' | 'output'): Promise<boolean> {
    if (type === 'input') {
      const input = this.inputs.get(deviceId);
      if (!input) {
        throw new Error('A entrada MIDI não está mais disponível. Atualize a lista.');
      }
      await input.open();
      input.onmidimessage = (event) => {
        if (event.data) this.handleMessage(event.data, deviceId);
      };
      return true;
    }

    const output = this.outputs.get(deviceId);
    if (!output) {
      throw new Error('A saída MIDI não está mais disponível. Atualize a lista.');
    }
    await output.open();
    this.selectedOutputId = deviceId;
    return true;
  }

  hasSelectedOutput(): boolean {
    const output = this.selectedOutputId
      ? this.outputs.get(this.selectedOutputId)
      : undefined;
    return output !== undefined && output.state === 'connected';
  }

  async send(message: number[]): Promise<boolean> {
    const output = this.selectedOutputId
      ? this.outputs.get(this.selectedOutputId)
      : undefined;
    if (!output || output.state !== 'connected') {
      this.onError('Conecte uma saída MIDI antes de enviar mensagens.');
      return false;
    }

    const status = message[0];
    const statusType = status & 0xf0;
    const expectedLength =
      statusType === 0xc0 || statusType === 0xd0 ? 2 : 3;
    if (
      status < 0x80 ||
      status > 0xef ||
      message.length !== expectedLength ||
      message.slice(1).some((value) => !Number.isInteger(value) || value < 0 || value > 127)
    ) {
      throw new RangeError('Mensagem MIDI inválida.');
    }

    await output.open();
    output.send(message);
    return true;
  }

  async sendProgramChange(program: number, channel: number): Promise<boolean> {
    if (!Number.isInteger(program) || program < 0 || program > 127) {
      throw new RangeError('O número do programa MIDI deve estar entre 0 e 127.');
    }
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
      throw new RangeError('O canal MIDI deve estar entre 0 e 15.');
    }

    return this.send([0xc0 | channel, program]);
  }

  private refreshPorts(): void {
    if (!this.access) return;

    this.inputs.clear();
    this.outputs.clear();
    this.access.inputs.forEach((input) => this.inputs.set(input.id, input));
    this.access.outputs.forEach((output) => this.outputs.set(output.id, output));

    if (this.selectedOutputId && !this.outputs.has(this.selectedOutputId)) {
      this.selectedOutputId = null;
    }
  }

  private handleMessage(data: Uint8Array, deviceId?: string): void {
    if (data.length < 2) return;

    const channel = data[0] & 0x0f;
    const status = data[0] & 0xf0;
    if (status === 0xc0 && data[1] <= 127) {
      const bank = this.bankMsb[channel] & 0x7f;
      const deviceName = (deviceId ? this.inputs.get(deviceId)?.name : '') ?? '';
      this.onProgramChange(data[1], channel, bank, deviceName);
      this.emitRaw({ kind: 'pc', channel, number: data[1], value: bank, deviceId });
    } else if (status === 0x90 || status === 0x80) {
      if (data.length < 3) return;
      const value = status === 0x80 ? 0 : data[2];
      this.emitRaw({ kind: 'note', channel, number: data[1], value, deviceId });
    } else if (status === 0xb0) {
      if (data.length < 3) return;
      if (data[1] === 0) this.bankMsb[channel] = data[2] & 0x7f;
      if (data[1] === 32) this.bankLsb[channel] = data[2] & 0x7f;
      this.emitRaw({ kind: 'cc', channel, number: data[1], value: data[2], deviceId });
    } else if (status === 0xe0) {
      if (data.length < 3) return;
      this.emitRaw({ kind: 'pitch', channel, number: 0, value: (data[2] << 7) | data[1], deviceId });
    } else if (status === 0xd0) {
      this.emitRaw({ kind: 'aftertouch', channel, number: 0, value: data[1], deviceId });
    } else if (status === 0xa0) {
      if (data.length < 3) return;
      this.emitRaw({ kind: 'aftertouch', channel, number: data[1], value: data[2], deviceId });
    }
  }

  private emitRaw(event: RawMidiEvent): void {
    for (const listener of this.rawListeners) {
      try {
        listener(event);
      } catch {
        // Listener com defeito não pode derrubar o MIDI
      }
    }
  }

  private toDeviceInfo(port: MIDIInput | MIDIOutput, type: 'input' | 'output'): MidiDeviceInfo {
    return {
      id: port.id,
      name: port.name || `MIDI ${type}`,
      type,
      connected: port.state === 'connected',
    };
  }
}
