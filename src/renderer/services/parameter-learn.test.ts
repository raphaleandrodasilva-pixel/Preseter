import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armParameterLearn,
  cancelParameterLearn,
  isParameterLearnArmed,
  learnParameter,
  setParameterLearnHandler,
  subscribeParameterLearn,
} from './parameter-learn';

beforeEach(() => {
  cancelParameterLearn();
  setParameterLearnHandler(null);
});

describe('parameter learn', () => {
  it('arms, notifies and cancels the learn target', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeParameterLearn(listener);
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(isParameterLearnArmed()).toBe(false);

    armParameterLearn('element-1');
    expect(isParameterLearnArmed()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);

    cancelParameterLearn();
    expect(isParameterLearnArmed()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it('does not learn without an armed element or handler', () => {
    expect(learnParameter('C:/p.vst3', 'param')).toBe(false);
    armParameterLearn('element-1');
    expect(learnParameter('C:/p.vst3', 'param')).toBe(false);
    expect(isParameterLearnArmed()).toBe(true);
  });

  it('calls the handler once and disarms', () => {
    const handler = vi.fn();
    const listener = vi.fn();
    setParameterLearnHandler(handler);
    subscribeParameterLearn(listener);
    armParameterLearn('element-1');

    expect(learnParameter('C:/p.vst3', 'param-1')).toBe(true);
    expect(handler).toHaveBeenCalledWith('element-1', 'C:/p.vst3', 'param-1');
    expect(isParameterLearnArmed()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);

    expect(learnParameter('C:/p.vst3', 'param-2')).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps notifying other listeners when one throws', () => {
    const good = vi.fn();
    subscribeParameterLearn((active) => {
      if (active) throw new Error('bad listener');
    });
    subscribeParameterLearn(good);
    armParameterLearn('element-1');
    expect(good).toHaveBeenLastCalledWith(true);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeParameterLearn(listener);
    unsubscribe();
    armParameterLearn('element-1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
  });

  it('allows clearing the handler', () => {
    setParameterLearnHandler(vi.fn());
    setParameterLearnHandler(null);
    armParameterLearn('element-1');
    expect(learnParameter('p', 'i')).toBe(false);
  });
});
