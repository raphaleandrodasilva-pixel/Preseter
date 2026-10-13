import { EventEmitter } from 'events';

type MidiInputLike = {
  getPortCount(): number;
  getPortName(port: number): string;
  openPort(port: number): void;
  closePort(): void;
  isPortOpen(): boolean;
  on(event: 'message', callback: (deltaTime: number, message: number[]) => void): void;
  sendMessage(message: number[]): void;
};

type MidiOutputLike = {
  getPortCount(): number;
  getPortName(port: number): string;
  openPort(port: number): void;
  closePort(): void;
  isPortOpen(): boolean;
  sendMessage(message: number[]): void;
};

type MidiModuleLike = {
  Input: new () => MidiInputLike;
  Output: new () => MidiOutputLike;
};

interface MidiDevice {
  name: string;
  type: 'input' | 'output';
  port: number;
  connected: boolean;
}

export class MidiManager extends EventEmitter {
  private input: MidiInputLike | null = null;
  private output: MidiOutputLike | null = null;
  private inputDevices: MidiDevice[] = [];
  private outputDevices: MidiDevice[] = [];
  private activeInputs: Map<string, MidiInputLike> = new Map();
  private midiAvailable = false;

  constructor() {
    super();
    const midiModule = this.loadMidiModule();
    if (!midiModule) {
      console.warn('[MIDI] Biblioteca MIDI não disponível. O app continuará em modo sem dispositivo físico.');
      this.setupListeners();
      return;
    }

    this.midiAvailable = true;
    this.input = new midiModule.Input();
    this.output = new midiModule.Output();
    this.setupListeners();
  }

  private loadMidiModule(): MidiModuleLike | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('midi') as MidiModuleLike;
    } catch (error) {
      console.warn('[MIDI] Módulo midi não encontrado ou não compatível com o ambiente atual.', error);
      return null;
    }
  }

  private ensureMidiReady(): boolean {
    return this.midiAvailable && !!this.input && !!this.output;
  }

  /**
   * Listar todos os dispositivos MIDI disponíveis
   */
  listDevices(): MidiDevice[] {
    if (!this.ensureMidiReady()) {
      return [];
    }

    const devices: MidiDevice[] = [];

    // Entradas MIDI
    const inputCount = this.input!.getPortCount();
    for (let i = 0; i < inputCount; i++) {
      try {
        const name = this.input!.getPortName(i);
        devices.push({ name, type: 'input', port: i, connected: false });
        this.inputDevices.push({ name, type: 'input', port: i, connected: false });
      } catch (e) {
        console.error(`Erro ao obter nome da entrada MIDI ${i}:`, e);
      }
    }

    // Saídas MIDI
    const outputCount = this.output!.getPortCount();
    for (let i = 0; i < outputCount; i++) {
      try {
        const name = this.output!.getPortName(i);
        devices.push({ name, type: 'output', port: i, connected: false });
        this.outputDevices.push({ name, type: 'output', port: i, connected: false });
      } catch (e) {
        console.error(`Erro ao obter nome da saída MIDI ${i}:`, e);
      }
    }

    return devices;
  }

  /**
   * Abrir entrada MIDI para escutar mensagens
   */
  openInput(portName: string): boolean {
    if (!this.ensureMidiReady() || !this.input) {
      console.warn('[MIDI] Não foi possível abrir a entrada porque o módulo MIDI não está disponível.');
      return false;
    }

    try {
      const portIndex = this.findInputPort(portName);
      if (portIndex === -1) {
        console.error(`Porta MIDI de entrada não encontrada: ${portName}`);
        return false;
      }

      const midiModule = this.loadMidiModule();
      if (!midiModule) {
        return false;
      }

      const inputInstance = new midiModule.Input();
      inputInstance.openPort(portIndex);
      inputInstance.on('message', (deltaTime, message) => {
        this.handleMidiMessage(message);
      });

      this.activeInputs.set(portName, inputInstance);
      console.log(`[MIDI] Entrada aberta: ${portName}`);
      return true;
    } catch (error) {
      console.error('Erro ao abrir entrada MIDI:', error);
      return false;
    }
  }

  /**
   * Fechar entrada MIDI
   */
  closeInput(portName: string): boolean {
    const instance = this.activeInputs.get(portName);
    if (instance) {
      instance.closePort();
      this.activeInputs.delete(portName);
      console.log(`[MIDI] Entrada fechada: ${portName}`);
      return true;
    }
    return false;
  }

  /**
   * Abrir saída MIDI para envio de mensagens
   */
  openOutput(portName: string): boolean {
    if (!this.ensureMidiReady() || !this.output) {
      console.warn('[MIDI] Não foi possível abrir a saída porque o módulo MIDI não está disponível.');
      return false;
    }

    try {
      const portIndex = this.findOutputPort(portName);
      if (portIndex === -1) {
        console.error(`Porta MIDI de saída não encontrada: ${portName}`);
        return false;
      }

      this.output.openPort(portIndex);
      console.log(`[MIDI] Saída aberta: ${portName}`);
      return true;
    } catch (error) {
      console.error('Erro ao abrir saída MIDI:', error);
      return false;
    }
  }

  /**
   * Enviar mensagem MIDI via saída
   */
  sendOutput(message: number[]): boolean {
    if (!this.ensureMidiReady() || !this.output) {
      return false;
    }

    if (this.output.isPortOpen()) {
      this.output.sendMessage(message);
      console.log(`[MIDI] Mensagem enviada:`, message);
      return true;
    }

    // Se não houver saída aberta, tentar abrir primeira saída disponível
    if (this.outputDevices.length > 0) {
      const firstOutput = this.outputDevices[0];
      if (this.openOutput(firstOutput.name)) {
        return this.sendOutput(message);
      }
    }

    return false;
  }

  /**
   * Enviar Program Change (pgm send)
   */
  sendProgramChange(program: number, channel: number = 0): boolean {
    // Program Change MIDI: status byte 0xC0 | channel
    const status = 0xc0 | (channel & 0x0f);
    const message = [status, program & 0x7f];
    return this.sendOutput(message);
  }

  /**
   * Fechar todas as conexões MIDI
   */
  closeAll(): void {
    for (const [name, instance] of this.activeInputs) {
      instance.closePort();
      this.activeInputs.delete(name);
    }

    if (this.output && this.output.isPortOpen()) {
      this.output.closePort();
    }

    this.activeInputs.clear();
  }

  /**
   * Manipular mensagens MIDI recebidas
   */
  private handleMidiMessage(message: number[]): void {
    if (message.length === 0) return;

    const statusByte = message[0];
    const status = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    switch (status) {
      case 0xc0: {
        // Program Change
        const program = message[1];
        console.log(`[MIDI] Program Change recebido: ${program} (canal ${channel})`);
        this.emit('program-change', program, channel);
        break;
      }

      case 0xb0: {
        // Control Change
        const cc = message[1];
        const value = message[2];
        this.emit('control-change', cc, value, channel);
        break;
      }

      case 0x90: {
        // Note On
        const note = message[1];
        const velocity = message[2];
        if (velocity > 0) {
          this.emit('note-on', note, velocity, channel);
        } else {
          this.emit('note-off', note, channel);
        }
        break;
      }

      case 0x80: {
        // Note Off
        const note = message[1];
        this.emit('note-off', note, channel);
        break;
      }

      case 0xe0: {
        // Pitch Bend
        const value = ((message[2] << 7) | message[1]) - 8192;
        this.emit('pitch-bend', value, channel);
        break;
      }
    }
  }

  private setupListeners(): void {
    // Evento para quando dispositivo é conectado/desconectado
    // (requer polling em alguns sistemas)
  }

  private findInputPort(portName: string): number {
    if (!this.input) {
      return -1;
    }

    for (let i = 0; i < this.input.getPortCount(); i++) {
      if (this.input.getPortName(i) === portName) {
        return i;
      }
    }
    return -1;
  }

  private findOutputPort(portName: string): number {
    if (!this.output) {
      return -1;
    }

    for (let i = 0; i < this.output.getPortCount(); i++) {
      if (this.output.getPortName(i) === portName) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Enviar nota MIDI (para pads/botões)
   */
  sendNoteOn(note: number, velocity: number, channel: number = 0): boolean {
    const status = 0x90 | (channel & 0x0f);
    return this.sendOutput([status, note & 0x7f, velocity & 0x7f]);
  }

  sendNoteOff(note: number, channel: number = 0): boolean {
    const status = 0x80 | (channel & 0x0f);
    return this.sendOutput([status, note & 0x7f, 0]);
  }

  /**
   * Enviar Control Change
   */
  sendControlChange(cc: number, value: number, channel: number = 0): boolean {
    const status = 0xb0 | (channel & 0x0f);
    return this.sendOutput([status, cc & 0x7f, value & 0x7f]);
  }
}
