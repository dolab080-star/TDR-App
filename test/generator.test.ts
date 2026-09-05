import { describe, expect, it } from 'vitest';
import { generateShow } from '../src/lib/show/generator';
import { encodeFseq } from '../src/lib/tesla/fseq';
import { validateFseq } from '../src/lib/tesla/validator';
import { CLOSURE_CHANNELS, CLOSURE_VALUES, LIGHT_CHANNELS, LIGHT_VALUES, CH, CLOSURE } from '../src/lib/tesla/channels';
import { makeAnalysis } from './helpers';
import type { StylePreset } from '../src/lib/show/types';

const ALL_CLOSURES = { chargePort: true, mirrors: true, windows: true, liftgate: true, doorHandles: true };
const NO_CLOSURES = { chargePort: false, mirrors: false, windows: false, liftgate: false, doorHandles: false };

describe('generateShow', () => {
  const styles: StylePreset[] = ['balanced', 'energetic', 'chill'];

  for (const style of styles) {
    it(`produces a valid show (${style}, all closures on)`, () => {
      const a = makeAnalysis(90, 128);
      const show = generateShow(a, { style, intensity: 0.8, closures: ALL_CLOSURES });
      expect(show.frameCount).toBe(Math.ceil(90 * 50));
      expect(show.frames.length).toBe(show.frameCount * 48);

      const bytes = encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 });
      const report = validateFseq(bytes);
      expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      // No unexpected value codes anywhere.
      expect(report.issues.filter((i) => i.level === 'warning')).toEqual([]);
      for (const u of report.closureUsage) expect(u.used).toBeLessThanOrEqual(u.limit);
    });
  }

  it('only emits legal value codes and keeps spare channels dark', () => {
    const a = makeAnalysis(60, 100);
    const show = generateShow(a, { intensity: 1, closures: ALL_CLOSURES });
    for (let f = 0; f < show.frameCount; f++) {
      const row = show.frames.subarray(f * 48, (f + 1) * 48);
      for (const ch of LIGHT_CHANNELS) expect(LIGHT_VALUES.has(row[ch - 1])).toBe(true);
      for (const ch of CLOSURE_CHANNELS) expect(CLOSURE_VALUES.has(row[ch - 1])).toBe(true);
      expect(row[46]).toBe(0);
      expect(row[47]).toBe(0);
    }
    // last frame idle
    expect(Array.from(show.frames.subarray((show.frameCount - 1) * 48))).toEqual(new Array(48).fill(0));
  });

  it('actually lights things up and follows the music', () => {
    const a = makeAnalysis(60, 120);
    const show = generateShow(a, { closures: NO_CLOSURES });
    let lit = 0;
    for (let f = 0; f < show.frameCount; f++) {
      for (const ch of LIGHT_CHANNELS) if (show.frames[f * 48 + ch - 1] >= 128) lit++;
    }
    const ratio = lit / (show.frameCount * LIGHT_CHANNELS.length);
    expect(ratio).toBeGreaterThan(0.03);
    expect(ratio).toBeLessThan(0.6);
    // Brake lights should flash near kick onsets in the high section.
    const high = a.sections.find((s) => s.tier === 'high')!;
    const kick = a.onsets.low.find((o) => o.time > high.startTime + 2)!;
    const f = Math.round(kick.time * 50);
    expect(show.frames[f * 48 + CH.brakeLights - 1]).toBe(255);
    // A drop event exists at the start of the high section.
    expect(show.events.some((e) => e.kind === 'drop' && Math.abs(e.time - high.startTime) < 0.01)).toBe(true);
    expect(show.events.some((e) => e.kind === 'ending')).toBe(true);
  });

  it('respects closure toggles', () => {
    const a = makeAnalysis(60, 120);
    const off = generateShow(a, { closures: NO_CLOSURES });
    for (let f = 0; f < off.frameCount; f++) {
      for (const ch of CLOSURE_CHANNELS) expect(off.frames[f * 48 + ch - 1]).toBe(0);
    }
    const cp = generateShow(a, { closures: { ...NO_CLOSURES, chargePort: true } });
    const values = new Set<number>();
    for (let f = 0; f < cp.frameCount; f++) values.add(cp.frames[f * 48 + CH.chargePort - 1]);
    expect(values.has(CLOSURE.open)).toBe(true);
    expect(values.has(CLOSURE.dance)).toBe(true);
    expect(values.has(CLOSURE.close)).toBe(true);
    // Dance must start after the door had time to open.
    let firstOpen = -1;
    let firstDance = -1;
    for (let f = 0; f < cp.frameCount; f++) {
      const v = cp.frames[f * 48 + CH.chargePort - 1];
      if (v === CLOSURE.open && firstOpen < 0) firstOpen = f;
      if (v === CLOSURE.dance && firstDance < 0) firstDance = f;
    }
    expect(firstDance - firstOpen).toBeGreaterThanOrEqual(100); // >= 2 s
    // Falcon and front doors are never commanded.
    for (let f = 0; f < cp.frameCount; f++) {
      for (const ch of [CH.falconDoorL, CH.falconDoorR, CH.frontDoorL, CH.frontDoorR]) expect(cp.frames[f * 48 + ch - 1]).toBe(0);
    }
  });

  it('handles very short and beatless input', () => {
    const a = makeAnalysis(3, 120, ['mid']);
    a.beats = [];
    a.bars = [];
    a.sections = [];
    const show = generateShow(a, { closures: ALL_CLOSURES });
    expect(show.frameCount).toBe(150);
    const report = validateFseq(encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(report.ok).toBe(true);
  });
});
