import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseSrt, parseTimestamp, serializeSrt, SrtParseError } from '../lib/srt';
import { SAMPLE_SRT } from '../lib/sample';

describe('timestamp', () => {
  it('parses hh:mm:ss,mmm and comma/dot fraction', () => {
    expect(parseTimestamp('00:00:01,500')).toBe(1500);
    expect(parseTimestamp('1:2:3.4')).toBe(3723400);
  });

  it('formats with millisecond precision', () => {
    expect(formatTimestamp(3723004)).toBe('01:02:03,004');
  });

  it('rejects invalid timestamps', () => {
    expect(() => parseTimestamp('00:61:00,000')).toThrow();
    expect(() => parseTimestamp('abc')).toThrow();
  });
});

describe('parseSrt', () => {
  it('parses multiline text, BOM and CRLF', () => {
    const content = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n相接\n';
    const cues = parseSrt(content);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('第一行\n第二行');
    expect(cues[1].start).toBe(2000);
  });

  it('parses blocks without numeric headers', () => {
    const cues = parseSrt('00:00:01,000 --> 00:00:02,000\n无编号文本');
    expect(cues[0].id).toBe(1);
  });

  it('parses the bundled sample', () => {
    expect(parseSrt(SAMPLE_SRT)).toHaveLength(5);
  });

  it('reports failing cue index and reasons', () => {
    const bad = '1\n00:00:02,000 --> 00:00:01,000\n倒序\n\n2\n00:00:03,000 --> 00:00:04,000\n正常';
    try {
      parseSrt(bad);
      throw new Error('should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SrtParseError);
      const issues = (error as SrtParseError).issues;
      expect(issues[0].cue).toBe(1);
      expect(issues[0].reason).toContain('必须晚于');
    }
  });

  it('rejects missing timing line and empty text', () => {
    expect(() => parseSrt('1\n没有时间行')).toThrow(SrtParseError);
    expect(() => parseSrt('1\n00:00:01,000 --> 00:00:02,000\n   ')).toThrow(SrtParseError);
  });
});

describe('serializeSrt', () => {
  it('sorts by start stably, keeps tie order by original id and renumbers', () => {
    const out = serializeSrt([
      { id: 9, start: 5000, end: 6000, text: '晚' },
      { id: 3, start: 1000, end: 2000, text: '早' },
      { id: 2, start: 1000, end: 1500, text: '同开始' },
    ]);
    const blocks = out.trim().split('\n\n');
    expect(blocks[0].split('\n')[0]).toBe('1');
    expect(blocks[1].split('\n')[0]).toBe('2');
    expect(blocks[2].split('\n')[0]).toBe('3');
    expect(blocks[0]).toContain('同开始');
    expect(blocks[1]).toContain('早');
  });
});
