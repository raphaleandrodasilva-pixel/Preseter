import { useEffect, useRef } from 'react';

/**
 * Teclado do PC como instrumento, no layout do Ableton.
 *
 * A S D F G H J K L ; '  → teclas brancas
 * W E T Y U O P          → sustenidos
 * Z / X                  → oitava abaixo/acima
 *
 * 0–9, V e M continuam reservadas para atalhos do app.
 */
const NOTE_KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
  "'": 17,
};

const RESERVED_KEYS = new Set(['v', 'm']);
const BASE_OCTAVE = 4;

interface ComputerKeyboardMidiOptions {
  enabled: boolean;
  /** Muda quando o patch troca: solta todas as notas. */
  resetKey?: string;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
    )
  );
}

/** true quando o elemento e seus ancestrais estão realmente exibidos. */
function isVisible(element: Element): boolean {
  let node: Element | null = element;
  while (node) {
    if ((node as HTMLElement).hidden) return false;
    const style = window.getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }
    node = node.parentElement;
  }
  return true;
}

export function useComputerKeyboardMidi({
  enabled,
  resetKey,
  onNoteOn,
  onNoteOff,
}: ComputerKeyboardMidiOptions): void {
  const octaveRef = useRef(BASE_OCTAVE);
  const pressedRef = useRef(new Map<string, number>());
  const callbacksRef = useRef({ onNoteOn, onNoteOff });
  callbacksRef.current = { onNoteOn, onNoteOff };

  const releaseAll = () => {
    for (const note of pressedRef.current.values()) {
      callbacksRef.current.onNoteOff(note);
    }
    pressedRef.current.clear();
  };

  useEffect(() => {
    if (!enabled) {
      releaseAll();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      // Não toca enquanto uma janela/modal visível do app estiver aberta.
      // Alguns modais ficam montados no DOM, escondidos; esses não contam.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (let index = 0; index < dialogs.length; index += 1) {
        if (isVisible(dialogs[index])) return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'x') {
        event.preventDefault();
        octaveRef.current = Math.max(
          0,
          Math.min(8, octaveRef.current + (key === 'x' ? 1 : -1))
        );
        return;
      }

      if (RESERVED_KEYS.has(key)) return;
      const offset = NOTE_KEYS[key];
      if (offset === undefined) return;

      event.preventDefault();
      if (pressedRef.current.has(key)) return;
      const note = Math.max(
        0,
        Math.min(127, (octaveRef.current + 1) * 12 + offset)
      );
      pressedRef.current.set(key, note);
      callbacksRef.current.onNoteOn(note, 100);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const note = pressedRef.current.get(key);
      if (note === undefined) return;
      event.preventDefault();
      pressedRef.current.delete(key);
      callbacksRef.current.onNoteOff(note);
    };

    const onBlur = () => releaseAll();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll();
    };
  }, [enabled]);

  useEffect(() => {
    releaseAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
}
