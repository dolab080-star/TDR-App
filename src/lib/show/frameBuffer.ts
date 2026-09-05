/**
 * A 48-channel x N-frame byte buffer with time-based helpers that emit exactly
 * the value codes Tesla vehicles understand.
 */
import { CHANNEL_COUNT, LIGHT, STEP_MS, idx } from '../tesla/channels';

export type Chans = number | readonly number[];

const asList = (c: Chans): readonly number[] => (typeof c === 'number' ? [c] : c);

export class FrameBuffer {
  readonly data: Uint8Array;
  readonly frameCount: number;
  readonly stepS: number;

  constructor(frameCount: number, stepMs: number = STEP_MS) {
    this.frameCount = Math.max(1, frameCount);
    this.stepS = stepMs / 1000;
    this.data = new Uint8Array(this.frameCount * CHANNEL_COUNT);
  }

  /** Frame index for a time (clamped to the buffer). */
  frameAt(t: number): number {
    const f = Math.round(t / this.stepS);
    return Math.min(this.frameCount, Math.max(0, f));
  }

  get(channel: number, frame: number): number {
    return this.data[frame * CHANNEL_COUNT + idx(channel)];
  }

  /** Set [fStart, fEnd) frames of channel(s) to value. */
  setFrames(chans: Chans, fStart: number, fEnd: number, value: number): void {
    const a = Math.max(0, fStart);
    const b = Math.min(this.frameCount, fEnd);
    if (b <= a) return;
    for (const ch of asList(chans)) {
      const off = idx(ch);
      for (let f = a; f < b; f++) this.data[f * CHANNEL_COUNT + off] = value;
    }
  }

  /** Set [tStart, tEnd) seconds of channel(s) to value (at least one frame). */
  set(chans: Chans, tStart: number, tEnd: number, value: number): void {
    const a = this.frameAt(tStart);
    let b = this.frameAt(tEnd);
    if (b <= a) b = a + 1;
    this.setFrames(chans, a, b, value);
  }

  /** Instant on for `durS` seconds starting at `t`. */
  flash(chans: Chans, t: number, durS: number): void {
    this.set(chans, t, t + Math.max(this.stepS, durS), LIGHT.on);
  }

  /**
   * On instantly at `t`, hold for `holdS`, then ramp off using `offCode`
   * (LIGHT.offRamp500/1000/2000). The ramp effect is held long enough to
   * guarantee the light reaches 0% (ramp + 60 ms).
   */
  pulse(chans: Chans, t: number, holdS: number, offCode: number): void {
    const rampS = rampSeconds(offCode);
    this.set(chans, t, t + Math.max(this.stepS, holdS), LIGHT.on);
    this.set(chans, t + Math.max(this.stepS, holdS), t + Math.max(this.stepS, holdS) + rampS + 0.06, offCode);
  }

  /**
   * Ramp on with `onCode` for `onHoldS` (should be >= ramp + 50 ms to reach
   * 100%), then ramp off with `offCode` for `offHoldS`.
   */
  swell(chans: Chans, t: number, onCode: number, onHoldS: number, offCode: number, offHoldS: number): void {
    this.set(chans, t, t + onHoldS, onCode);
    this.set(chans, t + onHoldS, t + onHoldS + offHoldS, offCode);
  }

  /** Zero the given channels over [tStart, tEnd). */
  clear(chans: Chans, tStart: number, tEnd: number): void {
    this.set(chans, tStart, tEnd, 0);
  }

  clearFrames(chans: Chans, fStart: number, fEnd: number): void {
    this.setFrames(chans, fStart, fEnd, 0);
  }
}

/** Ramp duration in seconds encoded by a light value code (0 for instant). */
export function rampSeconds(code: number): number {
  switch (code) {
    case LIGHT.offRamp500:
    case LIGHT.onRamp500:
      return 0.5;
    case LIGHT.offRamp1000:
    case LIGHT.onRamp1000:
      return 1.0;
    case LIGHT.offRamp2000:
    case LIGHT.onRamp2000:
      return 2.0;
    default:
      return 0;
  }
}
