import { describe, expect, it } from 'vitest';
import { History } from '../lib/history';

describe('History', () => {
  it('undo/redo restores state and new commit clears redo stack', () => {
    const history = new History({ v: 1 });
    history.commit({ v: 2 });
    history.commit({ v: 3 });
    expect(history.undo()).toEqual({ v: 2 });
    expect(history.canRedo).toBe(true);
    history.commit({ v: 4 });
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toEqual({ v: 4 });
    expect(history.undo()).toEqual({ v: 2 });
    expect(history.undo()).toEqual({ v: 1 });
    expect(history.canUndo).toBe(false);
  });
});
