/** Teclas que, sozinhas, apenas iniciam uma combinação. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead']);

/**
 * Converte um evento de teclado em um atalho estável para salvar no patch.
 * Ex.: F5, 1, A, Ctrl+Alt+1, Shift+Space.
 */
export function shortcutFromKeyboardEvent(event: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}): string | null {
  if (!event.key || MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  let key = event.key === ' ' ? 'Space' : event.key;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

/** Normaliza um atalho já salvo para comparação. */
export function normalizeShortcut(shortcut: string | undefined): string {
  return (shortcut ?? '').trim();
}
