import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScrollSpeed } from '@shared/types';
import { useSlowScroll } from './useSlowScroll';

function scrollBox(
  options: {
    overflowX?: string;
    overflowY?: string;
    scrollHeight?: number;
    clientHeight?: number;
    scrollWidth?: number;
    clientWidth?: number;
  } = {}
): HTMLDivElement {
  const element = document.createElement('div');
  element.style.overflowX = options.overflowX ?? 'auto';
  element.style.overflowY = options.overflowY ?? 'auto';
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: options.scrollHeight ?? 1000,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: options.clientHeight ?? 100,
  });
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    value: options.scrollWidth ?? 1000,
  });
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: options.clientWidth ?? 100,
  });
  document.body.appendChild(element);
  return element;
}

function wheel(
  target: EventTarget,
  init: WheelEventInit = {}
): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function render(speed: ScrollSpeed | undefined) {
  return renderHook(({ speed }: { speed: ScrollSpeed | undefined }) => useSlowScroll(speed), {
    initialProps: { speed },
  });
}

const mounted: HTMLElement[] = [];

function box(options?: Parameters<typeof scrollBox>[0]): HTMLDivElement {
  const element = scrollBox(options);
  mounted.push(element);
  return element;
}

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove();
});

describe('useSlowScroll', () => {
  it('does nothing for normal or missing speed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(undefined).unmount();
    render('normal').unmount();
    expect(add.mock.calls.some(([event]) => event === 'wheel')).toBe(false);
    add.mockRestore();
  });

  it('scales vertical wheel scrolling', () => {
    const element = box();
    render('slow');
    const event = wheel(element);
    expect(event.defaultPrevented).toBe(true);
    expect(element.scrollTop).toBe(50);
  });

  it('scales horizontal wheel scrolling', () => {
    const element = box();
    render('slower');
    const event = wheel(element, { deltaX: 100, deltaY: 0 });
    expect(event.defaultPrevented).toBe(true);
    expect(element.scrollLeft).toBe(35);
  });

  it('converts shift+wheel into horizontal scrolling', () => {
    const element = box();
    render('slow');
    const event = wheel(element, { shiftKey: true, deltaY: 100 });
    expect(event.defaultPrevented).toBe(true);
    expect(element.scrollTop).toBe(0);
    expect(element.scrollLeft).toBe(50);
  });

  it('ignores modified or already-handled wheel events', () => {
    const element = box();
    render('slow');
    expect(wheel(element, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(element, { metaKey: true }).defaultPrevented).toBe(false);

    const prevented = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    prevented.preventDefault();
    element.dispatchEvent(prevented);
    expect(element.scrollTop).toBe(0);
  });

  it('leaves native textarea and select scrolling alone', () => {
    const textarea = document.createElement('textarea');
    textarea.style.overflowY = 'auto';
    Object.defineProperty(textarea, 'scrollHeight', { value: 1000 });
    Object.defineProperty(textarea, 'clientHeight', { value: 100 });
    document.body.appendChild(textarea);
    mounted.push(textarea);
    render('slow');
    expect(wheel(textarea).defaultPrevented).toBe(false);
    expect(textarea.scrollTop).toBe(0);
  });

  it('skips a scrollable element already at the edge and uses its parent', () => {
    const parent = box({ scrollHeight: 2000, clientHeight: 100 });
    parent.scrollTop = 100;
    const child = box({ scrollHeight: 500, clientHeight: 100 });
    parent.appendChild(child);
    child.scrollTop = 400;

    render('slow');
    const event = wheel(child, { deltaY: 100 });
    expect(event.defaultPrevented).toBe(true);
    expect(child.scrollTop).toBe(400);
    expect(parent.scrollTop).toBe(150);

    child.scrollTop = 0;
    parent.scrollTop = 0;
    wheel(child, { deltaY: -100 });
    expect(parent.scrollTop).toBe(0);
  });

  it('does not scroll when no scrollable ancestor can move', () => {
    const element = box({ overflowY: 'hidden' });
    render('slow');
    expect(wheel(element).defaultPrevented).toBe(false);
  });

  it('honors line and page delta modes', () => {
    const line = box({ scrollHeight: 5000, clientHeight: 100 });
    render('slow');
    wheel(line, { deltaY: 10, deltaMode: 1 });
    expect(line.scrollTop).toBe(80);

    const page = box({ scrollHeight: 10000, clientHeight: 100 });
    wheel(page, { deltaY: 1, deltaMode: 2 });
    expect(page.scrollTop).toBe(50);
  });

  it('reinstalls the listener when speed changes and cleans up', () => {
    const element = box();
    const { rerender, unmount } = render('slow');
    wheel(element);
    expect(element.scrollTop).toBe(50);
    rerender({ speed: 'slower' });
    wheel(element);
    expect(element.scrollTop).toBe(85);
    unmount();
    wheel(element);
    expect(element.scrollTop).toBe(85);
  });
});
