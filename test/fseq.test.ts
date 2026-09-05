import { describe, expect, it } from 'vitest';
import { encodeFseq, parseFseqHeader, readFseqFrames, variableHeaderText } from '../src/lib/tesla/fseq';

describe('fseq', () => {
  it('round-trips header fields and frame data', () => {
    const channelCount = 48;
    const frameCount = 123;
    const frames = new Uint8Array(channelCount * frameCount);
    for (let i = 0; i < frames.length; i++) frames[i] = (i * 7) & 0xff;
    const bytes = encodeFseq(frames, { channelCount, stepTimeMs: 20, mediaFile: 'lightshow.wav', uniqueId: 42n });
    const h = parseFseqHeader(bytes);
    expect(h.majorVersion).toBe(2);
    expect(h.minorVersion).toBe(0);
    expect(h.channelCount).toBe(48);
    expect(h.frameCount).toBe(frameCount);
    expect(h.stepTimeMs).toBe(20);
    expect(h.compressionType).toBe(0);
    expect(h.compressionBlockCount).toBe(0);
    expect(h.sparseRangeCount).toBe(0);
    expect(h.headerLength).toBe(32);
    expect(h.uniqueId).toBe(42n);
    expect(h.channelDataOffset % 4).toBe(0);
    expect(h.channelDataOffset).toBeGreaterThanOrEqual(24);
    const codes = h.variableHeaders.map((v) => v.code);
    expect(codes).toEqual(['mf', 'sp']);
    expect(variableHeaderText(h.variableHeaders[0])).toBe('lightshow.wav');
    const { frames: back } = readFseqFrames(bytes);
    expect(back).toEqual(frames);
    expect(bytes.length).toBe(h.channelDataOffset + frames.length);
  });

  it('parses the header of an xLights-produced Tesla example file', () => {
    // First 32 bytes of lightshow_example_1_elevator_music/lightshow.fseq
    const hex = '5053455180000002200030000000c708000014000000000037d602288fef0500';
    const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    const h = parseFseqHeader(bytes);
    expect(h.channelDataOffset).toBe(128);
    expect(h.majorVersion).toBe(2);
    expect(h.minorVersion).toBe(0);
    expect(h.headerLength).toBe(32);
    expect(h.channelCount).toBe(48);
    expect(h.frameCount).toBe(2247);
    expect(h.stepTimeMs).toBe(20);
    expect(h.compressionType).toBe(0);
  });

  it('rejects bad magic and mismatched buffers', () => {
    expect(() => parseFseqHeader(new Uint8Array(40))).toThrow(/magic/);
    expect(() => encodeFseq(new Uint8Array(47), { channelCount: 48, stepTimeMs: 20 })).toThrow(/multiple/);
  });
});
