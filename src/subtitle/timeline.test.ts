import { describe, expect, it } from 'vitest';
import type { Cue } from './srt';
import { applyShift, assignLanes, cuesAt, findConflicts, overlaps, validateShift } from './timeline';

function cue(id: string, start: number, end: number): Cue {
  return { id, start, end, text: id };
}

describe('overlaps / findConflicts', () => {
  it('首尾相接不算重叠，真正重叠才标记', () => {
    expect(overlaps(cue('a', 0, 1000), cue('b', 1000, 2000))).toBe(false);
    expect(overlaps(cue('a', 0, 1001), cue('b', 1000, 2000))).toBe(true);
    const conflicts = findConflicts([cue('a', 0, 1000), cue('b', 1000, 2000), cue('c', 1500, 2500)]);
    expect(conflicts.has('a')).toBe(false);
    expect(conflicts.get('b')!.cueIds.has('c')).toBe(true);
  });
});

describe('cuesAt', () => {
  it('区间含开始不含结束，重叠时返回全部', () => {
    const cues = [cue('a', 0, 1000), cue('b', 1000, 2000), cue('c', 900, 1200)];
    expect(cuesAt(cues, 0).map((cue) => cue.id)).toEqual(['a']);
    expect(cuesAt(cues, 1000).map((cue) => cue.id)).toEqual(['b', 'c']);
    expect(cuesAt(cues, 1200).map((cue) => cue.id)).toEqual(['b']);
  });
});

describe('assignLanes', () => {
  it('首尾相接复用泳道，重叠分配不同泳道', () => {
    const lanes = assignLanes([cue('a', 0, 1000), cue('b', 1000, 2000), cue('c', 900, 1200)]);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(0);
    expect(lanes.get('c')).toBe(1);
  });
});

describe('shift', () => {
  it('越过零点时整批拒绝，通过后整体平移', () => {
    const cues = [cue('a', 100, 500), cue('b', 2000, 3000)];
    const ids = new Set(['a', 'b']);
    expect(validateShift(cues, ids, -500).ok).toBe(false);
    const unchanged = cues.map((item) => item.start);
    expect(unchanged).toEqual([100, 2000]);
    expect(applyShift(cues, ids, 500).map((item) => item.start)).toEqual([600, 2500]);
  });
});
