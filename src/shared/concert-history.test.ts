import { describe, expect, it } from 'vitest';
import { ConcertHistory } from './concert-history';

interface State {
  name: string;
  updatedAt?: number;
}

describe('ConcertHistory', () => {
  it('does not create an undo point for the first commit', () => {
    const history = new ConcertHistory<State>();
    expect(history.commit({ name: 'a' })).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('ignores duplicate states and commits changed states', () => {
    const history = new ConcertHistory<State>();
    history.commit({ name: 'a' });
    expect(history.commit({ name: 'a' })).toBe(false);
    expect(history.commit({ name: 'b' })).toBe(true);
    expect(history.canUndo).toBe(true);
  });

  it('undoes and redoes snapshots', () => {
    const history = new ConcertHistory<State>();
    history.commit({ name: 'a' });
    history.commit({ name: 'b' });
    history.commit({ name: 'c' });

    expect(history.undo()).toEqual({ name: 'b' });
    expect(history.undo()).toEqual({ name: 'a' });
    expect(history.undo()).toBeNull();
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual({ name: 'b' });
    expect(history.redo()).toEqual({ name: 'c' });
    expect(history.redo()).toBeNull();
  });

  it('clears the redo stack when a new state is committed after undo', () => {
    const history = new ConcertHistory<State>();
    history.commit({ name: 'a' });
    history.commit({ name: 'b' });
    history.undo();
    expect(history.canRedo).toBe(true);
    history.commit({ name: 'c' });
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toEqual({ name: 'a' });
  });

  it('limits the past stack to the configured size', () => {
    const history = new ConcertHistory<State>(undefined, 2);
    history.commit({ name: 'a' });
    history.commit({ name: 'b' });
    history.commit({ name: 'c' });
    history.commit({ name: 'd' });
    expect(history.undo()).toEqual({ name: 'c' });
    expect(history.undo()).toEqual({ name: 'b' });
    expect(history.undo()).toBeNull();
  });

  it('ignores updatedAt by default and supports a custom key', () => {
    const defaultHistory = new ConcertHistory<State>();
    defaultHistory.commit({ name: 'a', updatedAt: 1 });
    expect(defaultHistory.commit({ name: 'a', updatedAt: 2 })).toBe(false);

    const custom = new ConcertHistory<State>((state) => state.name);
    custom.commit({ name: 'a', updatedAt: 1 });
    expect(custom.commit({ name: 'a', updatedAt: 2 })).toBe(false);
  });

  it('resets all stacks and the present snapshot', () => {
    const history = new ConcertHistory<State>();
    history.commit({ name: 'a' });
    history.commit({ name: 'b' });
    history.reset();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
    expect(history.commit({ name: 'a' })).toBe(false);
  });
});
