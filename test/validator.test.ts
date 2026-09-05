import { describe, expect, it } from 'vitest';
import { encodeFseq } from '../src/lib/tesla/fseq';
import { validateFseq } from '../src/lib/tesla/validator';
import { CH, CLOSURE, LIGHT } from '../src/lib/tesla/channels';

function makeFrames(frameCount: number, fill?: (row: Uint8Array, f: number) => void): Uint8Array {
  const frames = new Uint8Array(48 * frameCount);
  for (let f = 0; f < frameCount; f++) fill?.(frames.subarray(f * 48, (f + 1) * 48), f);
  return frames;
}

describe('validateFseq', () => {
  it('accepts a well-formed 48 channel show', () => {
    const frames = makeFrames(100, (row, f) => {
      row[CH.brakeLights - 1] = f % 10 < 5 ? LIGHT.on : LIGHT.off;
      row[CH.innerMainBeamL - 1] = f % 20 < 5 ? LIGHT.on : LIGHT.offRamp500;
    });
    const r = validateFseq(encodeFseq(frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(r.frameCount).toBe(100);
    expect(r.durationS).toBeCloseTo(2, 5);
    expect(r.lightChanges).toBeGreaterThan(10);
  });

  it('rejects wrong channel counts, compression and step times like Tesla does', () => {
    const bad = validateFseq(encodeFseq(new Uint8Array(47 * 10), { channelCount: 47, stepTimeMs: 20 }));
    expect(bad.ok).toBe(false);
    expect(bad.issues.some((i) => /48 or 200 channels/.test(i.message))).toBe(true);

    const fast = validateFseq(encodeFseq(new Uint8Array(48 * 10), { channelCount: 48, stepTimeMs: 10 }));
    expect(fast.ok).toBe(false);

    const compressed = encodeFseq(new Uint8Array(48 * 10), { channelCount: 48, stepTimeMs: 20 });
    compressed[20] = 1; // zstd
    expect(validateFseq(compressed).issues.some((i) => /Uncompressed/.test(i.message))).toBe(true);

    expect(validateFseq(new Uint8Array([1, 2, 3])).ok).toBe(false);
  });

  it('counts closure commands and flags limit violations', () => {
    // Charge port limit is 3: open/close 4 times -> 8 commands.
    const frames = makeFrames(400, (row, f) => {
      const cycle = f % 100;
      if (cycle < 5) row[CH.chargePort - 1] = CLOSURE.open;
      else if (cycle >= 50 && cycle < 55) row[CH.chargePort - 1] = CLOSURE.close;
    });
    const r = validateFseq(encodeFseq(frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(r.closureCommands[CH.chargePort]).toBe(8);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /Charge Port/.test(i.message) && /limit/.test(i.message))).toBe(true);
  });

  it('warns about unknown value codes and non-zero spare channels', () => {
    const frames = makeFrames(10, (row) => {
      row[CH.frontFogL - 1] = 100;
      row[46] = 255;
    });
    const r = validateFseq(encodeFseq(frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => /not xLights/.test(i.message))).toBe(true);
    expect(r.issues.some((i) => /Unused channels 47/.test(i.message))).toBe(true);
  });
});
