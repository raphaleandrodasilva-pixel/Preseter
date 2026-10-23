import { describe, expect, it } from 'vitest';
import type { LayoutConfig, UiElement } from './types';
import {
  assignMissingGroupIds,
  buildDuplicatedElements,
  groupMembersOf,
  moveElementWithGroup,
  newElementId,
  newGroupId,
} from './element-groups';
import { createElement, createLayout } from '../test/fixtures';

function element(overrides: Partial<UiElement> = {}): UiElement {
  return createElement(overrides);
}

describe('id generation', () => {
  it('creates prefixed ids and different values', () => {
    const a = newElementId();
    const b = newElementId();
    const g = newGroupId('custom');
    expect(a).toMatch(/^element_/);
    expect(b).toMatch(/^element_/);
    expect(g).toMatch(/^custom_/);
    expect(a).not.toBe(b);
  });
});

describe('groupMembersOf', () => {
  it('returns all elements with the same group, or only the element without a group', () => {
    const lonely = element({ id: 'lonely' });
    const a = element({ id: 'a', groupId: 'g' });
    const b = element({ id: 'b', groupId: 'g' });
    const c = element({ id: 'c', groupId: 'other' });
    expect(groupMembersOf([lonely, a, b, c], lonely)).toEqual([lonely]);
    expect(groupMembersOf([lonely, a, b, c], a)).toEqual([a, b]);
  });
});

describe('moveElementWithGroup', () => {
  it('moves all group members by the same delta', () => {
    const a = element({ id: 'a', x: 10, y: 20, groupId: 'g' });
    const b = element({ id: 'b', x: 50, y: 70, groupId: 'g' });
    const c = element({ id: 'c', x: 200, y: 200 });
    const result = moveElementWithGroup([a, b, c], 'a', 30, 50);
    expect(result[0]).toMatchObject({ x: 30, y: 50 });
    expect(result[1]).toMatchObject({ x: 70, y: 100 });
    expect(result[2]).toBe(c);
  });

  it('clamps a group at the top-left edge while preserving relative spacing', () => {
    const a = element({ id: 'a', x: 10, y: 20, groupId: 'g' });
    const b = element({ id: 'b', x: 4, y: 5, groupId: 'g' });
    const result = moveElementWithGroup([a, b], 'a', -100, -100);
    expect(result[0]).toMatchObject({ x: 6, y: 15 });
    expect(result[1]).toMatchObject({ x: 0, y: 0 });
  });

  it('returns the original list for unknown ids or zero movement', () => {
    const elements = [element({ id: 'a', x: 1, y: 1, groupId: 'g' })];
    expect(moveElementWithGroup(elements, 'missing', 4, 5)).toBe(elements);
    expect(moveElementWithGroup(elements, 'a', 1, 1)).toBe(elements);
  });
});

describe('buildDuplicatedElements', () => {
  it('duplicates a single element with a new id and offset', () => {
    const source = element({ id: 'a', x: 10, y: 20 });
    const result = buildDuplicatedElements([source], 'a');
    expect(result).not.toBeNull();
    expect(result!.copies).toHaveLength(1);
    expect(result!.copies[0]).toMatchObject({ x: 26, y: 36 });
    expect(result!.copies[0].id).not.toBe('a');
    expect(result!.selectedId).toBe(result!.copies[0].id);
  });

  it('duplicates the whole group with one new group id and selects the source copy', () => {
    const a = element({ id: 'a', x: 10, y: 20, groupId: 'g' });
    const b = element({ id: 'b', x: 50, y: 60, groupId: 'g' });
    const result = buildDuplicatedElements([a, b], 'b');
    expect(result!.copies).toHaveLength(2);
    expect(result!.copies[0].groupId).toBeTruthy();
    expect(result!.copies[0].groupId).toBe(result!.copies[1].groupId);
    expect(result!.copies[0].groupId).not.toBe('g');
    expect(result!.selectedId).toBe(result!.copies[1].id);
    expect(result!.copies.map((copy) => copy.id)).not.toContain('a');
  });

  it('returns null for an unknown source', () => {
    expect(buildDuplicatedElements([], 'missing')).toBeNull();
  });
});

describe('assignMissingGroupIds', () => {
  function grouped(layout: LayoutConfig): string[] {
    return layout.elements.map((item) => item.groupId ?? '');
  }

  it('groups adjacent drawbars in a row', () => {
    const layout = createLayout({
      elements: [
        element({ id: 'd1', type: 'drawbar', x: 0, y: 10, width: 20 }),
        element({ id: 'd2', type: 'drawbar', x: 24, y: 15, width: 20 }),
        element({ id: 'd3', type: 'drawbar', x: 200, y: 10, width: 20 }),
      ],
    });
    const result = assignMissingGroupIds(layout);
    expect(result.elements[0].groupId).toBeTruthy();
    expect(result.elements[0].groupId).toBe(result.elements[1].groupId);
    expect(result.elements[2].groupId).toBeUndefined();
  });

  it('groups ADSR knobs and numbered pads', () => {
    const layout = createLayout({
      elements: [
        element({ id: 'a', type: 'knob', label: 'Attack', x: 0, y: 0 }),
        element({ id: 'd', type: 'knob', label: 'Decay', x: 10, y: 0 }),
        element({ id: 's', type: 'knob', label: 'Sustain', x: 20, y: 0 }),
        element({ id: 'pad1', type: 'pad', label: 'Pad 1', x: 0, y: 200 }),
        element({ id: 'pad2', type: 'pad', label: 'Pad 2', x: 100, y: 200 }),
      ],
    });
    const result = assignMissingGroupIds(layout);
    expect(grouped(result).slice(0, 3).every(Boolean)).toBe(true);
    expect(result.elements[0].groupId).toBe(result.elements[2].groupId);
    expect(result.elements[3].groupId).toBe(result.elements[4].groupId);
  });

  it('preserves existing groups and returns the same layout when nothing is grouped', () => {
    const existing = createLayout({
      elements: [element({ id: 'a', groupId: 'keep' }), element({ id: 'b' })],
    });
    expect(assignMissingGroupIds(existing)).toBe(existing);

    const ungroupable = createLayout({
      elements: [element({ id: 'a', type: 'knob', label: 'Knob' })],
    });
    expect(assignMissingGroupIds(ungroupable)).toBe(ungroupable);
  });
});
