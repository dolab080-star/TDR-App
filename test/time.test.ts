import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeList, parseTime, parseTimeList } from '../src/lib/time';

describe('time helpers', () => {
  it('parses m:ss, seconds and decimals', () => {
    expect(parseTime('1:23')).toBe(83);
    expect(parseTime('0:05.5')).toBe(5.5);
    expect(parseTime('90')).toBe(90);
    expect(parseTime(' 2:00 ')).toBe(120);
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('parses and sorts lists, dropping junk', () => {
    expect(parseTimeList('1:04, 0:32 junk 1:36;2:00')).toEqual([32, 64, 96, 120]);
    expect(parseTimeList('')).toEqual([]);
  });

  it('formats round trips', () => {
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(5.5)).toBe('0:05.5');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTimeList([32, 64])).toBe('0:32, 1:04');
    expect(parseTimeList(formatTimeList([5.5, 83]))).toEqual([5.5, 83]);
  });
});
