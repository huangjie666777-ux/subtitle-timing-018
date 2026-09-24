import { describe, expect, it } from 'vitest';
import { formatTimecode, parseSrt, serializeSrt, SrtParseError } from './srt';

const sample = '1\r\n00:00:01,000 --> 00:00:02,500\r\n第一行\r\n第二行\r\n\r\n2\n00:00:03.000 --> 00:00:04,000\n第二条';

describe('parseSrt', () => {
  it('解析 CRLF/LF 混合换行并保留多行文本', () => {
    const cues = parseSrt('\uFEFF' + sample);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('第一行\n第二行');
    expect(cues[0].start).toBe(1000);
    expect(cues[0].end).toBe(2500);
    expect(cues[1].start).toBe(3000);
  });

  it('允许时间码前省略序号', () => {
    const cues = parseSrt('00:00:01,000 --> 00:00:02,000\n无序号');
    expect(cues[0].text).toBe('无序号');
  });

  it('指出出错字幕及原因', () => {
    expect(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\n坏')).toThrow(SrtParseError);
    try {
      parseSrt('1\n00:00:02,000 --> 00:00:01,000\n坏');
    } catch (error) {
      expect((error as SrtParseError).block).toBe(1);
      expect((error as SrtParseError).reason).toContain('开始时间');
    }
    expect(() => parseSrt('1\n00:00:01,000 --> 00:00:02,000')).toThrow(/文本为空/);
    expect(() => parseSrt('随便写')).toThrow(/时间码/);
  });
});

describe('serializeSrt', () => {
  it('按开始时间稳定排序、重新编号并保留多行', () => {
    const cues = parseSrt(sample);
    cues.push({ ...cues[0], id: 'x', start: 1000, end: 2200, text: '同开始' });
    const output = serializeSrt(cues);
    const blocks = output.trim().split(/\r\n\r\n/);
    expect(blocks.map((block) => block.split('\r\n')[0])).toEqual(['1', '2', '3']);
    expect(blocks[0]).toContain('第一行');
    expect(blocks[1]).toContain('同开始');
    expect(output.startsWith('1\r\n00:00:01,000 --> 00:00:02,500\r\n第一行\n第二行')).toBe(true);
  });

  it('格式化毫秒', () => {
    expect(formatTimecode(3661500)).toBe('01:01:01,500');
  });
});
