
export interface Cue {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface SrtIssue {
  cue: number | null;
  reason: string;
  line?: number;
}

export class SrtParseError extends Error {
  issues: SrtIssue[];
  constructor(issues: SrtIssue[]) {
    const detail = issues
      .map((it) =>
        it.cue == null ? `第${it.line ?? '?'}行附近：${it.reason}` : `字幕 #${it.cue}：${it.reason}`,
      )
      .join('；');
    super(`SRT 解析失败：${detail}`);
    this.name = 'SrtParseError';
    this.issues = issues;
  }
}

function parseMsPart(raw: string): number {
  return Number(raw.padEnd(3, '0'));
}

export function parseTimestamp(raw: string): number {
  const value = raw.trim();
  let match = value.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    if (m > 59 || s > 59) throw new Error(`时间的分/秒超出范围 "${value}"`);
    return h * 3600000 + m * 60000 + s * 1000 + parseMsPart(match[4]);
  }
  match = value.match(/^(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) throw new Error(`时间格式无法识别 "${value}"`);
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (m > 59 || s > 59) throw new Error(`时间的分/秒超出范围 "${value}"`);
  return m * 60000 + s * 1000 + parseMsPart(match[3]);
}

export function formatTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const milli = safe % 1000;
  return (
    [h, m, s].map((n) => String(n).padStart(2, '0')).join(':') +
    `,${String(milli).padStart(3, '0')}`
  );
}

export const formatClock = formatTimestamp;

function splitCueBlocks(content: string): string[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return normalized
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+/, '').trim())
    .filter((block) => block.length > 0);
}

export function parseSrt(content: string): Cue[] {
  const normalized = content.replace(/^\uFEFF/, '');
  if (!normalized.trim()) {
    throw new SrtParseError([{ cue: null, reason: '文件内容为空', line: 1 }]);
  }
  const blocks = splitCueBlocks(normalized);
  if (blocks.length === 0) {
    throw new SrtParseError([{ cue: null, reason: '未找到任何字幕块', line: 1 }]);
  }
  const cues: Cue[] = [];
  const issues: SrtIssue[] = [];
  blocks.forEach((block, index) => {
    const seq = index + 1;
    const lines = block.split('\n');
    let cursor = 0;
    let declaredId: number | null = null;
    if (/^\d{1,9}$/.test(lines[0].trim())) {
      declaredId = Number(lines[0].trim());
      cursor = 1;
    }
    const timingLine = lines[cursor];
    if (!timingLine || !timingLine.includes('-->')) {
      issues.push({
        cue: declaredId ?? seq,
        reason: '缺少 "开始 --> 结束" 时间行',
      });
      return;
    }
    const halves = timingLine.split('-->').map((part) => part.trim());
    if (halves.length !== 2) {
      issues.push({ cue: declaredId ?? seq, reason: '时间行中 "-->" 只能出现一次' });
      return;
    }
    let start = 0;
    let end = 0;
    try {
      start = parseTimestamp(halves[0]);
      end = parseTimestamp(halves[1]);
    } catch (error) {
      issues.push({ cue: declaredId ?? seq, reason: (error as Error).message });
      return;
    }
    if (start < 0) {
      issues.push({ cue: declaredId ?? seq, reason: '开始时间不能为负' });
      return;
    }
    if (!(end > start)) {
      issues.push({
        cue: declaredId ?? seq,
        reason: `结束时间 ${formatTimestamp(end)} 必须晚于开始时间 ${formatTimestamp(start)}`,
      });
      return;
    }
    const text = lines.slice(cursor + 1).join('\n').trim();
    if (!text) {
      issues.push({ cue: declaredId ?? seq, reason: '字幕文本为空' });
      return;
    }
    cues.push({ id: declaredId ?? seq, start, end, text });
  });
  if (issues.length > 0) throw new SrtParseError(issues);
  return cues;
}

export function serializeSrt(cues: Cue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.id - b.id);
  return (
    sorted
      .map(
        (cue, index) =>
          `${index + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`,
      )
      .join('\n\n') + '\n'
  );
}
