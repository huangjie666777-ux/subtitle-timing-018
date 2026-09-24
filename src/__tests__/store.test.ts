import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkbench } from '../stores/workbench';
import { SAMPLE_SRT } from '../lib/sample';

describe('workbench store', () => {
  const wb = useWorkbench();

  beforeEach(() => {
    wb.loadSample();
  });

  it('failed import keeps current document untouched', () => {
    const before = wb.state.cues.map((c) => ({ ...c }));
    const ok = wb.importText('1\n00:00:05,000 --> 00:00:01,000\n坏数据', 'bad.srt');
    expect(ok).toBe(false);
    expect(wb.ui.parseError).toContain('bad.srt');
    expect(wb.state.cues).toHaveLength(before.length);
    expect(wb.state.cues[0]).toEqual(before[0]);
  });

  it('undo restores text, timing and selection in one drag step', () => {
    wb.selectMany([1, 2]);
    const base = wb.beginDrag();
    wb.previewDrag(base, [1, 2], 1000);
    wb.commitDrag(base);
    expect(wb.state.cues.find((c) => c.id === 1)?.start).toBe(2000);
    wb.undo();
    expect(wb.state.cues.find((c) => c.id === 1)?.start).toBe(1000);
    expect(wb.state.selected).toEqual([1, 2]);
  });

  it('confirmed edit adds one undo step and new change clears redo', () => {
    wb.selectOnly(1);
    expect(wb.updateCue(1, { start: 1100, end: 3500, text: '改过' })).toBeNull();
    wb.undo();
    wb.redo();
    expect(wb.state.cues.find((c) => c.id === 1)?.text).toBe('改过');
    wb.updateCue(1, { start: 1200, end: 3500, text: '再次修改' });
    expect(wb.canRedo.value).toBe(false);
  });

  it('rejects invalid edits without changing document', () => {
    const before = wb.state.cues.find((c) => c.id === 1)?.start;
    expect(wb.updateCue(1, { start: 3000, end: 2000, text: 'x' })).toContain('早于');
    expect(wb.state.cues.find((c) => c.id === 1)?.start).toBe(before);
  });

  it('batch shift crossing zero is rejected and leaves everything intact', () => {
    wb.selectMany([1, 2]);
    expect(wb.confirmShift(-5000)).toBe(false);
    expect(wb.state.cues.find((c) => c.id === 1)?.start).toBe(1000);
  });

  it('round trips the sample through import and export', () => {
    expect(wb.importText(SAMPLE_SRT, 'sample.srt')).toBe(true);
    expect(wb.exportText().startsWith('1\n00:00:01,000 --> 00:00:03,500')).toBe(true);
  });
});
