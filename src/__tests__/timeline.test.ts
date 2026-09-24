import { describe, expect, it } from 'vitest';
import { cuesAt, detectConflicts, previewShift, validateRange } from '../lib/timeline';
import type { Cue } from '../lib/srt';

const cue = (id: number, start: number, end: number): Cue => ({ id, start, end, text: `t${id}` });

describe('detectConflicts', () => {
  it('marks overlaps but treats touching boundaries as valid', () => {
    const cues = [cue(1, 0, 1000), cue(2, 1000, 2000), cue(3, 1500, 2500)];
    expect(detectConflicts(cues)).toEqual([{ a: 2, b: 3 }]);
  });

  it('detects fully contained cue as overlap', () => {
    expect(detectConflicts([cue(1, 0, 5000), cue(2, 1000, 2000)])).toEqual([{ a: 1, b: 2 }]);
  });
});

describe('cuesAt', () => {
  it('includes start, excludes end, and returns all overlapping cues', () => {
    const cues = [cue(1, 0, 1000), cue(2, 1000, 2000), cue(3, 900, 1200)];
    expect(cuesAt(cues, 1000).map((c) => c.id)).toEqual([3, 2]);
    expect(cuesAt(cues, 0).map((c) => c.id)).toEqual([1]);
    expect(cuesAt(cues, 2000)).toEqual([]);
  });
});

describe('previewShift', () => {
  it('shifts selected cues as a batch', () => {
    const cues = [cue(1, 1000, 2000), cue(2, 3000, 4000)];
    const result = previewShift(cues, [1], -500);
    expect(result.ok).toBe(true);
    expect(result.next?.[0]).toMatchObject({ start: 500, end: 1500 });
    expect(result.next?.[1]).toBe(cues[1]);
  });

  it('rejects the entire batch when any cue crosses zero', () => {
    const cues = [cue(1, 100, 2000), cue(2, 3000, 4000)];
    const result = previewShift(cues, [1, 2], -500);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('#1');
    expect(result.next).toBeUndefined();
    expect(cues[0].start).toBe(100);
  });
});

describe('validateRange', () => {
  it('enforces non-negative start and end after start', () => {
    expect(validateRange(-1, 10)).toContain('负');
    expect(validateRange(10, 10)).toContain('早于');
    expect(validateRange(0, 1)).toBeNull();
  });
});
