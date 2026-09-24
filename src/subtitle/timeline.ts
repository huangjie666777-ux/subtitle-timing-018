import type { Cue } from './srt';

export function overlaps(a: Pick<Cue, 'start' | 'end'>, b: Pick<Cue, 'start' | 'end'>): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface ConflictGroup {
  cueIds: Set<string>;
}

export function findConflicts(cues: Cue[]): Map<string, ConflictGroup> {
  const adjacency = new Map<string, Set<string>>();
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].start >= sorted[i].end) break;
      if (overlaps(sorted[i], sorted[j])) {
        if (!adjacency.has(sorted[i].id)) adjacency.set(sorted[i].id, new Set());
        if (!adjacency.has(sorted[j].id)) adjacency.set(sorted[j].id, new Set());
        adjacency.get(sorted[i].id)!.add(sorted[j].id);
        adjacency.get(sorted[j].id)!.add(sorted[i].id);
      }
    }
  }
  const result = new Map<string, ConflictGroup>();
  const visited = new Set<string>();
  adjacency.forEach((_, seed) => {
    if (visited.has(seed)) return;
    const cueIds = new Set<string>();
    const stack = [seed];
    while (stack.length) {
      const current = stack.pop()!;
      if (cueIds.has(current)) continue;
      cueIds.add(current);
      visited.add(current);
      adjacency.get(current)?.forEach((next) => {
        if (!cueIds.has(next)) stack.push(next);
      });
    }
    const group = { cueIds };
    cueIds.forEach((id) => result.set(id, group));
  });
  return result;
}

export function assignLanes(cues: Cue[]): Map<string, number> {
  const lanes = new Map<string, number>();
  const laneEnds: number[] = [];
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  sorted.forEach((cue) => {
    let lane = laneEnds.findIndex((end) => end <= cue.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(cue.end);
    } else {
      laneEnds[lane] = cue.end;
    }
    lanes.set(cue.id, lane);
  });
  return lanes;
}

export function cuesAt(cues: Cue[], timeMs: number): Cue[] {
  return cues.filter((cue) => timeMs >= cue.start && timeMs < cue.end);
}

export interface ShiftResult {
  ok: boolean;
  reason?: string;
}

export function validateShift(
  cues: Cue[],
  ids: Set<string>,
  deltaMs: number,
): ShiftResult {
  if (ids.size === 0) return { ok: false, reason: '未选择任何字幕' };
  if (!Number.isInteger(deltaMs) || deltaMs === 0) {
    return { ok: false, reason: '调整时长必须是非零整数毫秒' };
  }
  for (const cue of cues) {
    if (!ids.has(cue.id)) continue;
    if (cue.start + deltaMs < 0) {
      return { ok: false, reason: `存在字幕调整后开始时间早于 00:00:00,000，整批调整已拒绝` };
    }
    if (cue.start + deltaMs >= cue.end + deltaMs) {
      return { ok: false, reason: '调整后开始时间必须早于结束时间' };
    }
  }
  return { ok: true };
}

export function applyShift(cues: Cue[], ids: Set<string>, deltaMs: number): Cue[] {
  return cues.map((cue) =>
    ids.has(cue.id) ? { ...cue, start: cue.start + deltaMs, end: cue.end + deltaMs } : cue,
  );
}

export function durationOf(cue: Pick<Cue, 'start' | 'end'>): number {
  return cue.end - cue.start;
}
