import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Preset, UiElement, LayoutConfig } from '../../shared/types';
import { PRESETS_DIR, DEFAULT_TEMPO, DEFAULT_MIDI_CHANNEL } from '../../shared/constants';

export class PresetManager extends EventEmitter {
  private presets: Map<string, Preset> = new Map();

  constructor() {
    super();
  }

  /**
   * Carregar todos os presets do diretório
   */
  loadPresets(): Preset[] {
    const presetsDir = this.getPresetsDir();
    const loaded: Preset[] = [];

    if (!fs.existsSync(presetsDir)) {
      fs.mkdirSync(presetsDir, { recursive: true });
      return loaded;
    }

    const files = fs.readdirSync(presetsDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(presetsDir, file), 'utf-8');
        const preset: Preset = JSON.parse(content);
        this.presets.set(preset.id, preset);
        loaded.push(preset);
      } catch (e) {
        console.error(`Erro ao carregar preset ${file}:`, e);
      }
    }

    console.log(`[Preset] ${loaded.length} presets carregados`);
    this.emit('loaded', loaded);
    return loaded;
  }

  /**
   * Salvar um preset
   */
  savePreset(preset: Preset): boolean {
    try {
      preset.updatedAt = Date.now();
      this.presets.set(preset.id, preset);

      const filePath = path.join(this.getPresetsDir(), `${preset.id}.json`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(preset, null, 2), 'utf-8');

      console.log(`[Preset] Salvo: ${preset.name} (ID: ${preset.id})`);
      this.emit('saved', preset);
      return true;
    } catch (error) {
      console.error('Erro ao salvar preset:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Obter todos os presets
   */
  getAllPresets(): Preset[] {
    return Array.from(this.presets.values()).sort((a, b) => a.programNumber - b.programNumber);
  }

  /**
   * Obter um preset específico
   */
  getPreset(presetId: string): Preset | undefined {
    return this.presets.get(presetId);
  }

  /**
   * Buscar preset por número de programa
   */
  findByProgramNumber(programNumber: number): Preset | undefined {
    return Array.from(this.presets.values()).find(
      (p) => p.programNumber === programNumber
    );
  }

  /**
   * Criar um novo preset
   */
  createPreset(
    name: string,
    programNumber: number = 0,
    midiChannel: number = DEFAULT_MIDI_CHANNEL
  ): Preset {
    const id = `preset_${Date.now()}`;
    const preset: Preset = {
      id,
      name,
      programNumber: Math.max(0, Math.min(127, programNumber)),
      midiChannel,
      vstStates: {},
      layout: {
        elements: [],
        background: null,
        tempo: DEFAULT_TEMPO,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.presets.set(id, preset);
    return preset;
  }

  /**
   * Duplicar um preset existente
   */
  duplicatePreset(presetId: string, newName?: string): Preset | null {
    const original = this.presets.get(presetId);
    if (!original) return null;

    const newPreset: Preset = {
      ...original,
      id: `preset_${Date.now()}`,
      name: newName || `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.savePreset(newPreset);
    return newPreset;
  }

  /**
   * Deletar um preset
   */
  deletePreset(presetId: string): boolean {
    const preset = this.presets.get(presetId);
    if (!preset) return false;

    try {
      const filePath = path.join(this.getPresetsDir(), `${preset.id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      this.presets.delete(presetId);
      console.log(`[Preset] Deletado: ${preset.name}`);
      this.emit('deleted', presetId);
      return true;
    } catch (error) {
      console.error('Erro ao deletar preset:', error);
      return false;
    }
  }

  /**
   * Atualizar layout de um preset
   */
  updatePresetLayout(presetId: string, layout: LayoutConfig): boolean {
    const preset = this.presets.get(presetId);
    if (!preset) return false;

    preset.layout = layout;
    preset.updatedAt = Date.now();
    this.savePreset(preset);

    this.emit('layout-updated', { presetId, layout });
    return true;
  }

  /**
   * Salvar estado de VST para um preset
   */
  saveVstState(presetId: string, vstStates: Record<string, any>): boolean {
    const preset = this.presets.get(presetId);
    if (!preset) return false;

    preset.vstStates = vstStates;
    preset.updatedAt = Date.now();
    this.savePreset(preset);

    this.emit('vst-state-saved', { presetId, vstStates });
    return true;
  }

  /**
   * Adicionar elemento de UI a um preset
   */
  addElementToPreset(presetId: string, element: UiElement): boolean {
    const preset = this.presets.get(presetId);
    if (!preset) return false;

    preset.layout.elements.push(element);
    preset.layout = { ...preset.layout, elements: preset.layout.elements };
    preset.updatedAt = Date.now();
    this.savePreset(preset);

    return true;
  }

  private getPresetsDir(): string {
    // Determinar diretório de presets baseado no ambiente
    if (process.env.NODE_ENV === 'development') {
      return path.join(process.cwd(), PRESETS_DIR);
    }
    return path.join(app.getPath('userData'), PRESETS_DIR);
  }
}
