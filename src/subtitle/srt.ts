export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export class SrtParseError extends Error {
  block: number;
  reason: string;
  constructor(block: number, reason: string) {
    super(`第 ${block} 条字幕解析失败：${reason}`);
    this.name = 'SrtParseError';
    this.block = block;
    this.reason = reason;
  }
}

const TIMECODE =
  /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*$/;

export function parseTimecode(input: string): { start: number; end: number } {
  const match = input.trim().match(TIMECODE);
  if (!match) {
    throw new Error('时间码格式应为 HH:MM:SS,mmm --> HH:MM:SS,mmm');
  }
  const parts = match.slice(1).map((value) => Number(value));
  const [h1, m1, s1, ms1, h2, m2, s2, ms2] = parts;
  if (m1 > 59 || m2 > 59 || s1 > 59 || s2 > 59) {
    throw new Error('时间码中的分钟或秒数超出 00-59 范围');
  }
  const toMs = (h: number, m: number, s: number, ms: number, raw: string) =>
    h * 3600000 + m * 60000 + s * 1000 + ms * Math.pow(10, 3 - raw.length);
  const start = toMs(h1, m1, s1, ms1, match[4]);
  const end = toMs(h2, m2, s2, ms2, match[8]);
  if (start >= end) {
    throw new Error('开始时间必须早于结束时间');
  }
  return { start, end };
}

export function formatTimecode(ms: number): string {
  const value = Math.max(0, Math.round(ms));
  const h = Math.floor(value / 3600000);
  const m = Math.floor((value % 3600000) / 60000);
  const s = Math.floor((value % 60000) / 1000);
  const milli = value % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

export function parseSrt(content: string, idPrefix = 'cue'): Cue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^[\s\n]+/, '').replace(/\s+$/, ''))
    .filter((block) => block.length > 0);

  if (blocks.length === 0) {
    throw new SrtParseError(0, '文件中没有可导入的字幕');
  }

  const cues: Cue[] = [];
  blocks.forEach((block, index) => {
    const blockNo = index + 1;
    const lines = block.split('\n');
    let arrowIndex = lines.findIndex((line) => line.includes('-->'));
    if (arrowIndex < 0) {
      throw new SrtParseError(blockNo, '缺少包含 --> 的时间码行');
    }
    if (arrowIndex > 1 || (arrowIndex === 1 && !/^\s*\d+\s*$/.test(lines[0]))) {
      throw new SrtParseError(blockNo, '时间码行前只能是数字序号');
    }
    let timing: { start: number; end: number };
    try {
      timing = parseTimecode(lines[arrowIndex]);
    } catch (error) {
      throw new SrtParseError(blockNo, (error as Error).message);
    }
    const text = lines
      .slice(arrowIndex + 1)
      .join('\n')
      .replace(/\n+$/g, '');
    if (!text.trim()) {
      throw new SrtParseError(blockNo, '字幕文本为空');
    }
    cues.push({
      id: `${idPrefix}-${blockNo}-${Math.random().toString(36).slice(2, 8)}`,
      start: timing.start,
      end: timing.end,
      text,
    });
  });
  return cues;
}

export function serializeSrt(cues: Cue[]): string {
  const order = new Map(cues.map((cue, index) => [cue.id, index]));
  const sorted = [...cues].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  return sorted
    .map(
      (cue, index) =>
        `${index + 1}\r\n${formatTimecode(cue.start)} --> ${formatTimecode(
          cue.end,
        )}\r\n${cue.text.replace(/\r\n?/g, '\n')}`,
    )
    .join('\r\n\r\n')
    .concat('\r\n');
}
