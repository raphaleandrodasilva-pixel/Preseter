import { EventEmitter } from 'events';
import { LayoutConfig, UiElement, ElementType } from '../../shared/types';
import { UI_COLORS } from '../../shared/constants';

export class LayoutManager extends EventEmitter {
  private currentLayout: LayoutConfig = {
    elements: [],
    background: null,
    tempo: 120,
  };

  constructor() {
    super();
  }

  /**
   * Definir layout completo
   */
  setLayout(layout: LayoutConfig): void {
    this.currentLayout = layout;
    this.emit('layout-changed', layout);
  }

  /**
   * Obter layout atual
   */
  getLayout(): LayoutConfig {
    return this.currentLayout;
  }

  /**
   * Adicionar um elemento à interface
   */
  addElement(element: UiElement): LayoutConfig {
    this.currentLayout.elements.push(element);
    this.emit('element-added', element);
    this.emit('layout-changed', this.currentLayout);
    return this.currentLayout;
  }

  /**
   * Atualizar um elemento existente
   */
  updateElement(element: UiElement): LayoutConfig {
    const index = this.currentLayout.elements.findIndex((e) => e.id === element.id);
    if (index !== -1) {
      this.currentLayout.elements[index] = element;
      this.emit('element-updated', element);
      this.emit('layout-changed', this.currentLayout);
    }
    return this.currentLayout;
  }

  /**
   * Remover um elemento da interface
   */
  removeElement(id: string): LayoutConfig {
    this.currentLayout.elements = this.currentLayout.elements.filter((e) => e.id !== id);
    this.emit('element-removed', id);
    this.emit('layout-changed', this.currentLayout);
    return this.currentLayout;
  }

  /**
   * Mover um elemento (arrastar)
   */
  moveElement(id: string, x: number, y: number): LayoutConfig {
    const element = this.currentLayout.elements.find((e) => e.id === id);
    if (element) {
      element.x = x;
      element.y = y;
      this.emit('layout-changed', this.currentLayout);
    }
    return this.currentLayout;
  }

  /**
   * Limpar todos os elementos
   */
  clearElements(): void {
    this.currentLayout.elements = [];
    this.emit('layout-changed', this.currentLayout);
  }

  /**
   * Criar um novo elemento com propriedades padrão
   */
  createElement(
    type: ElementType,
    label: string,
    x: number = 0,
    y: number = 0,
    options: Partial<UiElement> = {}
  ): UiElement {
    const element: UiElement = {
      id: `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      label,
      x,
      y,
      width: options.width || 100,
      height: options.height || 100,
      color: options.color || this.getDefaultColor(type),
      minValue: options.minValue ?? 0,
      maxValue: options.maxValue ?? 1,
      orientation: options.orientation || 'vertical',
      isMomentary: options.isMomentary ?? (type === 'button' ? false : true),
      pluginId: options.pluginId,
      parameterId: options.parameterId,
      midiCommand: options.midiCommand,
      noteNumber: options.noteNumber,
      velocity: options.velocity,
      ...options,
    };

    return element;
  }

  /**
   * Duplicar elemento
   */
  duplicateElement(id: string): UiElement | null {
    const element = this.currentLayout.elements.find((e) => e.id === id);
    if (!element) return null;

    const newElement: UiElement = {
      ...element,
      id: `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      x: element.x + 10,
      y: element.y + 10,
    };

    this.addElement(newElement);
    return newElement;
  }

  /**
   * Definir fundo do layout
   */
  setBackground(background: string | null): void {
    this.currentLayout.background = background;
    this.emit('layout-changed', this.currentLayout);
  }

  /**
   * Definir tempo
   */
  setTempo(tempo: number): void {
    this.currentLayout.tempo = tempo;
    this.emit('layout-changed', this.currentLayout);
  }

  /**
   * Reordenar elementos (trazer para frente, enviar para trás, etc.)
   */
  bringToFront(id: string): void {
    const index = this.currentLayout.elements.findIndex((e) => e.id === id);
    if (index !== -1) {
      const [element] = this.currentLayout.elements.splice(index, 1);
      this.currentLayout.elements.push(element);
      this.emit('layout-changed', this.currentLayout);
    }
  }

  private getDefaultColor(type: ElementType): string {
    switch (type) {
      case 'button':
        return UI_COLORS.primary;
      case 'fader':
      case 'slider':
        return UI_COLORS.secondary;
      case 'knob':
        return UI_COLORS.secondary;
      case 'pedal':
        return UI_COLORS.danger;
      case 'toggle':
        return UI_COLORS.success;
      case 'pad':
        return UI_COLORS.warning;
      case 'label':
        return UI_COLORS.light;
      default:
        return UI_COLORS.primary;
    }
  }

  /**
   * Exportar layout como JSON
   */
  exportLayout(): string {
    return JSON.stringify(this.currentLayout, null, 2);
  }

  /**
   * Importar layout do JSON
   */
  importLayout(json: string): boolean {
    try {
      const layout = JSON.parse(json);
      this.setLayout(layout);
      return true;
    } catch {
      return false;
    }
  }
}
