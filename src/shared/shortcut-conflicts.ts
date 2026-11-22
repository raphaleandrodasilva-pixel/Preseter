import type { Preset, PresetSet } from './types';
import { normalizeShortcut } from './shortcuts';

/** Atalhos que o app já usa e que não podem ser atribuídos a um patch/set. */
const RESERVED_SHORTCUTS: Record<string, string> = {
  Space: 'o panic',
  Escape: 'sair da tela cheia',
  ArrowUp: 'o patch anterior',
  ArrowDown: 'o próximo patch',
  ArrowLeft: 'o grupo anterior',
  ArrowRight: 'o próximo grupo',
  F: 'a busca de patches',
  P: 'o panic',
  M: 'o mudo do master',
  'Ctrl+N': 'novo concert',
  'Ctrl+O': 'abrir concert',
  'Ctrl+S': 'salvar',
  'Ctrl+Shift+S': 'salvar como',
  'Ctrl+W': 'fechar concert',
  'Ctrl+Z': 'desfazer',
  'Ctrl+Shift+Z': 'refazer',
  'Ctrl+1': 'o modo Layout',
  'Ctrl+2': 'o modo Edit',
  'Ctrl+3': 'o modo Perform',
  'Ctrl+4': 'Perform em tela cheia',
  'Ctrl+R': 'gravar',
  'Ctrl+Shift+M': 'Assignments & Mappings',
  'Ctrl+Shift+T': 'o afinador',
  F1: 'a ajuda',
};

export interface ShortcutConflict {
  kind: 'reserved' | 'patch' | 'set';
  /** Nome do patch/set ou descrição do atalho reservado. */
  target: string;
  message: string;
}

export interface ShortcutConflictOptions {
  /** Ignora o próprio patch ao editar um atalho de patch. */
  patchId?: string;
  /** Ignora o próprio set ao editar um atalho de grupo. */
  setId?: string;
  presets: Preset[];
  sets: PresetSet[];
}

/** Explica por que um atalho está reservado pelo app, ou null se estiver livre. */
export function reservedShortcutReason (shortcut: string): string | null {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return null;
  if (normalized.split('+').pop() === 'Space') return RESERVED_SHORTCUTS.Space;
  return RESERVED_SHORTCUTS[normalized] ?? null;
}

/**
 * Verifica se um atalho já pertence a outro patch, outro grupo ou ao próprio app.
 * A edição do atalho atual ignora o próprio patch/set.
 */
export function findShortcutConflict (
  shortcut: string,
  options: ShortcutConflictOptions
): ShortcutConflict | null {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return null;

  const reserved = reservedShortcutReason(normalized);
  if (reserved) {
    return {
      kind: 'reserved',
      target: reserved,
      message: `Atalho reservado para ${reserved}.`,
    };
  }

  const patch = options.presets.find(
    (item) => item.id !== options.patchId && normalizeShortcut(item.shortcut) === normalized
  );
  if (patch) {
    return {
      kind: 'patch',
      target: patch.name,
      message: `Atalho já usado pelo patch “${patch.name}”.`,
    };
  }

  const set = options.sets.find(
    (item) => item.id !== options.setId && normalizeShortcut(item.shortcut) === normalized
  );
  if (set) {
    return {
      kind: 'set',
      target: set.name,
      message: `Atalho já usado pelo grupo “${set.name}”.`,
    };
  }

  return null;
}
