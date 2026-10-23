import { describe, expect, it, vi } from 'vitest';
import { LayoutManager } from './LayoutManager';
import { UI_COLORS } from '../../shared/constants';
import { createElement, createLayout } from '../../test/fixtures';

describe('LayoutManager', () => {
  it('starts empty and replaces the whole layout', () => {
    const manager = new LayoutManager();
    expect(manager.getLayout()).toEqual({ elements: [], background: null, tempo: 120 });
    const layout = createLayout({ background: 'bg', tempo: 99 });
    const changed = vi.fn();
    manager.on('layout-changed', changed);
    manager.setLayout(layout);
    expect(manager.getLayout()).toBe(layout);
    expect(changed).toHaveBeenCalledWith(layout);
  });

  it('adds, updates, moves and removes elements with events', () => {
    const manager = new LayoutManager();
    const added = vi.fn();
    const updated = vi.fn();
    const removed = vi.fn();
    const changed = vi.fn();
    manager.on('element-added', added);
    manager.on('element-updated', updated);
    manager.on('element-removed', removed);
    manager.on('layout-changed', changed);

    const element = createElement({ id: 'e1' });
    manager.addElement(element);
    expect(manager.getLayout().elements).toEqual([element]);
    expect(added).toHaveBeenCalledWith(element);
    expect(changed).toHaveBeenCalledTimes(1);

    const next = { ...element, label: 'Updated' };
    manager.updateElement(next);
    expect(manager.getLayout().elements[0]).toBe(next);
    expect(updated).toHaveBeenCalledWith(next);

    manager.moveElement('e1', 42, 24);
    expect(manager.getLayout().elements[0]).toMatchObject({ x: 42, y: 24 });

    manager.removeElement('e1');
    expect(manager.getLayout().elements).toEqual([]);
    expect(removed).toHaveBeenCalledWith('e1');
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it('ignores updates and moves for unknown ids', () => {
    const manager = new LayoutManager();
    const layout = manager.getLayout();
    expect(manager.updateElement(createElement({ id: 'missing' }))).toBe(layout);
    expect(manager.moveElement('missing', 1, 2)).toBe(layout);
    expect(manager.getLayout().elements).toEqual([]);
  });

  it('clears elements and sets background/tempo', () => {
    const manager = new LayoutManager();
    manager.addElement(createElement());
    manager.clearElements();
    expect(manager.getLayout().elements).toEqual([]);
    manager.setBackground('image.png');
    manager.setTempo(144);
    expect(manager.getLayout()).toMatchObject({ background: 'image.png', tempo: 144 });
  });

  it('creates elements with defaults and overrides', () => {
    const manager = new LayoutManager();
    const button = manager.createElement('button', 'Play', 10, 20);
    expect(button).toMatchObject({
      type: 'button',
      label: 'Play',
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      color: UI_COLORS.primary,
      minValue: 0,
      maxValue: 1,
      orientation: 'vertical',
      isMomentary: false,
    });
    expect(button.id).toMatch(/^element_/);

    const pad = manager.createElement('pad', 'Pad', 0, 0, {
      width: 50,
      height: 60,
      color: '#000',
      minValue: 1,
      maxValue: 10,
      orientation: 'horizontal',
      isMomentary: true,
      pluginId: 'p',
      parameterId: 'param',
      midiCommand: { type: 'note', channel: 0 },
      noteNumber: 60,
      velocity: 100,
    });
    expect(pad).toMatchObject({
      width: 50,
      height: 60,
      color: '#000',
      minValue: 1,
      maxValue: 10,
      orientation: 'horizontal',
      isMomentary: true,
      pluginId: 'p',
      parameterId: 'param',
      midiCommand: { type: 'note', channel: 0 },
      noteNumber: 60,
      velocity: 100,
    });
  });

  it('uses the documented colors for every element type', () => {
    const manager = new LayoutManager();
    expect(manager.createElement('button', 'x').color).toBe(UI_COLORS.primary);
    expect(manager.createElement('fader', 'x').color).toBe(UI_COLORS.secondary);
    expect(manager.createElement('slider', 'x').color).toBe(UI_COLORS.secondary);
    expect(manager.createElement('knob', 'x').color).toBe(UI_COLORS.secondary);
    expect(manager.createElement('pedal', 'x').color).toBe(UI_COLORS.danger);
    expect(manager.createElement('toggle', 'x').color).toBe(UI_COLORS.success);
    expect(manager.createElement('pad', 'x').color).toBe(UI_COLORS.warning);
    expect(manager.createElement('label', 'x').color).toBe(UI_COLORS.light);
    expect(manager.createElement('keyboard', 'x').color).toBe(UI_COLORS.primary);
  });

  it('duplicates an element with an offset and fails for unknown ids', () => {
    const manager = new LayoutManager();
    const source = createElement({ id: 'e1', x: 5, y: 7 });
    manager.addElement(source);
    const copy = manager.duplicateElement('e1');
    expect(copy).toMatchObject({ x: 15, y: 17 });
    expect(copy?.id).not.toBe('e1');
    expect(manager.getLayout().elements).toHaveLength(2);
    expect(manager.duplicateElement('missing')).toBeNull();
  });

  it('brings an element to the end of the paint order', () => {
    const manager = new LayoutManager();
    manager.addElement(createElement({ id: 'a' }));
    manager.addElement(createElement({ id: 'b' }));
    manager.bringToFront('a');
    expect(manager.getLayout().elements.map((element) => element.id)).toEqual(['b', 'a']);
    manager.bringToFront('missing');
    expect(manager.getLayout().elements.map((element) => element.id)).toEqual(['b', 'a']);
  });

  it('exports and imports layouts', () => {
    const manager = new LayoutManager();
    manager.setLayout(createLayout({ background: 'bg', tempo: 130, elements: [createElement()] }));
    const text = manager.exportLayout();
    expect(JSON.parse(text)).toEqual(manager.getLayout());

    expect(manager.importLayout(JSON.stringify(createLayout({ tempo: 77 })))).toBe(true);
    expect(manager.getLayout().tempo).toBe(77);
    expect(manager.importLayout('invalid')).toBe(false);
    expect(manager.getLayout().tempo).toBe(77);
  });
});
