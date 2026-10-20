import { useEffect } from 'react';
import type { ScrollSpeed } from '@shared/types';

const FACTORS: Record<Exclude<ScrollSpeed, 'normal'>, number> = {
  slow: 0.5,
  slower: 0.35,
};

/**
 * Acha o primeiro ancestral rolável que ainda pode rolar na direção do wheel.
 * Se o elemento chegou ao topo/fim, sobe para o próximo (ex.: lista dentro do modal).
 */
function findScrollable(
  target: EventTarget | null,
  deltaX: number,
  deltaY: number
): { element: HTMLElement; axis: 'x' | 'y' } | null {
  let node = target instanceof HTMLElement ? target : null;

  while (node && node !== document.body) {
    // Textareas e selects nativos devem manter o comportamento do sistema.
    if (node.matches('textarea,select')) return null;

    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY)
      && node.scrollHeight > node.clientHeight + 1;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX)
      && node.scrollWidth > node.clientWidth + 1;

    if (deltaY !== 0 && canScrollY) {
      const atTop = node.scrollTop <= 0 && deltaY < 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1 && deltaY > 0;
      if (!atTop && !atBottom) return { element: node, axis: 'y' };
    }

    if (deltaX !== 0 && canScrollX) {
      const atLeft = node.scrollLeft <= 0 && deltaX < 0;
      const atRight = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1 && deltaX > 0;
      if (!atLeft && !atRight) return { element: node, axis: 'x' };
    }

    node = node.parentElement;
  }

  return null;
}

/** Aplica a velocidade de scroll escolhida nas preferências. */
export function useSlowScroll(speed: ScrollSpeed | undefined): void {
  useEffect(() => {
    if (!speed || speed === 'normal') return;

    const factor = FACTORS[speed];
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;

      // Shift + wheel vira scroll horizontal, como nos menus horizontais.
      const shiftHorizontal = event.shiftKey && event.deltaX === 0;
      const deltaX = shiftHorizontal ? event.deltaY : event.deltaX;
      const deltaY = shiftHorizontal ? 0 : event.deltaY;

      const target = findScrollable(event.target, deltaX, deltaY);
      if (!target) return;

      const unit = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? target.element.clientHeight
          : 1;

      event.preventDefault();
      if (target.axis === 'y') {
        target.element.scrollTop += deltaY * unit * factor;
      } else {
        target.element.scrollLeft += deltaX * unit * factor;
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [speed]);
}
