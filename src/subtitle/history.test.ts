import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history';

describe('HistoryStack', () => {
  it('撤销重做恢复文档与选择，新修改清空重做', () => {
    const history = new HistoryStack<{ cues: number[] }, string[]>({
      document: { cues: [1] },
      selection: ['a'],
    });
    history.commit({ document: { cues: [1, 2] }, selection: ['b'] });
    expect(history.value.document.cues).toEqual([1, 2]);
    expect(history.undo().selection).toEqual(['a']);
    expect(history.redo().document.cues).toEqual([1, 2]);
    history.undo();
    history.commit({ document: { cues: [3] }, selection: ['c'] });
    expect(history.canRedo).toBe(false);
    expect(history.value.document.cues).toEqual([3]);
  });
});
