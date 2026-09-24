import type { Cue } from './srt';

export interface Conflict {
  a: number;
  b: number;
}

export function detectConflicts(cues: Cue[]): Conflict[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.id - b.id);
  const result: Conflict[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const left = sorted[i];
      const right = sorted[j];
      if (right.start >= left.end) break;
      if (left.start < right.end && right.start < left.end) {
        result.push({ a: left.id, b: right.id });
      }
    }
  }
  return result;
}

export function conflictIdSet(conflicts: Conflict[]): Set<number> {
  const set = new Set<number>();
  conflicts.forEach(({ a, b }) => {
    set.add(a);
    set.add(b);
  });
  return set;
}

export function partnersOf(id: number, conflicts: Conflict[]): number[] {
  const partners = new Set<number>();
  conflicts.forEach(({ a, b }) => {
    if (a === id) partners.add(b);
    if (b === id) partners.add(a);
  });
  return [...partners];
}

export function cuesAt(cues: Cue[], time: number): Cue[] {
  return cues
    .filter((cue) => time >= cue.start && time < cue.end)
    .sort((a, b) => a.start - b.start || a.id - b.id);
}

export function sortedCues(cues: Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.start - b.start || a.id - b.id);
}

function formatSigned(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const milli = abs % 1000;
  return (
    sign +
    [h, m, s].map((n) => String(n).padStart(2, '0')).join(':') +
    `,${String(milli).padStart(3, '0')}`
  );
}

export interface ShiftResult {
  ok: boolean;
  reason?: string;
  next?: Cue[];
}

export function previewShift(cues: Cue[], ids: number[], deltaMs: number): ShiftResult {
  if (ids.length === 0) return { ok: false, reason: '未选择任何字幕' };
  const selected = new Set(ids);
  let offenderId: number | null = null;
  let offenderStart = 0;
  const next = cues.map((cue) => {
    if (!selected.has(cue.id)) return cue;
    const start = cue.start + deltaMs;
    const end = cue.end + deltaMs;
    if (start < 0 && offenderId === null) {
      offenderId = cue.id;
      offenderStart = start;
    }
    return { ...cue, start, end };
  });
  if (offenderId !== null) {
    return {
      ok: false,
      reason: `字幕 #${offenderId} 开始时间将变为 ${formatSigned(offenderStart)}，越过零点，整批调整已拒绝`,
    };
  }
  return { ok: true, next };
}

export function validateRange(start: number, end: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间必须是有限数字';
  if (start < 0) return '开始时间不能为负';
  if (!Number.isInteger(start) || !Number.isInteger(end)) return '时间需为整数毫秒';
  if (start >= end) return '开始时间必须早于结束时间';
  return null;
}
