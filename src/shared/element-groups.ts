/**
 * Agrupamento de controles de tela.
 *
 * Um grupo é apenas uma marcação de layout: os elementos continuam com id,
 * valor e mapping próprios, mas se deslocam juntos no canvas.
 */

import type { LayoutConfig, UiElement } from './types';

export function newElementId(): string {
  return `element_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newGroupId(prefix = 'group'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Membros do mesmo grupo, incluindo o próprio elemento. */
export function groupMembersOf(elements: UiElement[], element: UiElement): UiElement[] {
  return element.groupId
    ? elements.filter((candidate) => candidate.groupId === element.groupId)
    : [element];
}

/**
 * Move um elemento. Se ele pertence a um grupo, aplica o mesmo delta a todos
 * os membros, preservando o espaçamento relativo e limitando o conjunto às
 * bordas superior/esquerda do canvas.
 */
export function moveElementWithGroup(
  elements: UiElement[],
  id: string,
  x: number,
  y: number
): UiElement[] {
  const target = elements.find((element) => element.id === id);
  if (!target) return elements;

  const members = groupMembersOf(elements, target);
  const minX = Math.min(...members.map((element) => element.x));
  const minY = Math.min(...members.map((element) => element.y));
  const dx = Math.max(x - target.x, -minX);
  const dy = Math.max(y - target.y, -minY);
  if (dx === 0 && dy === 0) return elements;

  const ids = new Set(members.map((element) => element.id));
  return elements.map((element) =>
    ids.has(element.id) ? { ...element, x: element.x + dx, y: element.y + dy } : element
  );
}

/**
 * Cria cópias de um elemento — ou do grupo inteiro, quando ele tem groupId.
 * As cópias recebem um grupo novo para não ficarem presas ao original.
 */
export function buildDuplicatedElements(
  elements: UiElement[],
  id: string
): { copies: UiElement[]; selectedId: string } | null {
  const source = elements.find((element) => element.id === id);
  if (!source) return null;

  const targets = groupMembersOf(elements, source);
  const groupId = source.groupId ? newGroupId() : undefined;
  let selectedId = '';

  const copies = targets.map((member) => {
    const copy: UiElement = {
      ...member,
      id: newElementId(),
      x: member.x + 16,
      y: member.y + 16,
      ...(groupId ? { groupId } : {}),
    };
    if (member.id === source.id) selectedId = copy.id;
    return copy;
  });

  return { copies, selectedId: selectedId || copies[0]?.id || id };
}

const ADSR_LABELS = new Set(['attack', 'decay', 'sustain', 'release']);
const PAD_LABEL = /^pad\s+\d+$/i;

/** Agrupa itens da mesma linha horizontal, com espaçamento curto. */
function clusterRows(items: UiElement[], maxGap: number): UiElement[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const clusters: UiElement[][] = [];

  for (const item of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      const sameRow = Math.abs(item.y - first.y) <= 12;
      const closeEnough = item.x >= last.x - 12 && item.x - (last.x + last.width) <= maxGap;
      if (sameRow && closeEnough) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }

  return clusters;
}

function assign(
  groupByElement: Map<string, string>,
  items: UiElement[],
  prefix: string
): void {
  if (items.length < 2) return;
  const groupId = `legacy_${prefix}_${items[0].id}`;
  for (const item of items) groupByElement.set(item.id, groupId);
}

/**
 * Migração de layouts antigos: reconhece conjuntos de drawbars, ADSR e pads
 * criados antes de existir o vínculo de grupo.
 */
export function assignMissingGroupIds(layout: LayoutConfig): LayoutConfig {
  const elements = layout.elements;
  if (!elements.some((element) => !element.groupId)) return layout;

  const groupByElement = new Map<string, string>();
  const ungrouped = elements.filter((element) => !element.groupId);

  const drawbars = ungrouped.filter((element) => element.type === 'drawbar');
  for (const row of clusterRows(drawbars, 60)) assign(groupByElement, row, 'drawbars');

  const adsr = ungrouped.filter(
    (element) => element.type === 'knob' && ADSR_LABELS.has(element.label.toLowerCase())
  );
  for (const row of clusterRows(adsr, 150)) assign(groupByElement, row, 'adsr');

  const pads = ungrouped.filter(
    (element) => element.type === 'pad' && PAD_LABEL.test(element.label)
  );
  assign(groupByElement, pads, 'pads');

  if (groupByElement.size === 0) return layout;

  return {
    ...layout,
    elements: elements.map((element) => {
      const groupId = groupByElement.get(element.id);
      return groupId ? { ...element, groupId } : element;
    }),
  };
}
