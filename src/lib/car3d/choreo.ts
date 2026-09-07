/**
 * Canned "dance" for the marketing car: a pure function of (pace, seconds) so
 * the 3D hero can be driven frame by frame without any audio, and the three
 * paces can be unit-tested for range and distinctness. Values are 0..1 lamp
 * intensities except where noted.
 */
export type Pace = 'chill' | 'standard' | 'max';

export interface LampState {
  bar: number;
  headL: number;
  headR: number;
  turnL: number;
  turnR: number;
  tail: number;
  brake: number;
  reverse: number;
  port: number;
  portHue: number;
  /** 0 = mirrors out, 1 = fully folded. */
  mirrorFold: number;
  /** Vertical body offset in metres. */
  bob: number;
  /** Side-to-side tilt in radians. */
  roll: number;
}

export const PACE_BPM: Record<Pace, number> = { chill: 84, standard: 124, max: 150 };

export const STATIC_STATE: LampState = {
  bar: 0.85,
  headL: 0.6,
  headR: 0.6,
  turnL: 0,
  turnR: 0,
  tail: 0.7,
  brake: 0.2,
  reverse: 0,
  port: 0.8,
  portHue: 0.55,
  mirrorFold: 0,
  bob: 0,
  roll: 0,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const decay = (phase: number, k: number) => Math.exp(-phase * k);
const breathe = (x: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
const strobe = (beat: number, perBeat: number) => ((beat * perBeat) % 1 < 0.5 ? 1 : 0);
/** Ramps 0→1 over `inLen`, holds, then 1→0 over `outLen`, across a window of `len` units. */
const window = (u: number, len: number, inLen: number, outLen: number) => (u < 0 || u >= len ? 0 : clamp01(Math.min(u / inLen, (len - u) / outLen)));

export function choreograph(pace: Pace, seconds: number): LampState {
  const beat = (Math.max(0, seconds) * PACE_BPM[pace]) / 60;
  const phase = beat % 1;
  const beatInBar = Math.floor(beat) % 4;
  const bar = Math.floor(beat / 4);

  if (pace === 'chill') {
    const wave = breathe(beat / 8);
    const pos = beat % 4;
    return {
      bar: 0.35 + 0.65 * wave,
      headL: 0.15 + 0.85 * breathe(beat / 8),
      headR: 0.15 + 0.85 * breathe(beat / 8 + 0.5),
      turnL: pos < 2 ? decay(pos, 2.5) * 0.8 : 0,
      turnR: pos >= 2 ? decay(pos - 2, 2.5) * 0.8 : 0,
      tail: 0.3 + 0.7 * breathe(beat / 8 + 0.5),
      brake: beatInBar === 0 ? decay(phase, 2) * 0.6 : 0,
      reverse: 0,
      port: 0.5 + 0.5 * Math.sin((2 * Math.PI * beat) / 4),
      portHue: (seconds * 0.05) % 1,
      mirrorFold: window((beat % 32) - 24, 4, 1, 1),
      bob: 0.01 * Math.sin((2 * Math.PI * beat) / 4),
      roll: 0,
    };
  }

  if (pace === 'standard') {
    const hit = decay(phase, 5);
    const drop = window((beat % 32) - 28, 4, 0.5, 1);
    return {
      bar: 0.25 + 0.75 * hit,
      headL: beatInBar === 1 ? decay(phase, 4) : 0.1,
      headR: beatInBar === 3 ? decay(phase, 4) : 0.1,
      turnL: beatInBar % 2 === 0 ? decay(phase, 4) : 0,
      turnR: beatInBar % 2 === 1 ? decay(phase, 4) : 0,
      tail: 0.35 + 0.65 * hit,
      brake: beatInBar === 0 ? decay(phase, 3) : 0,
      reverse: bar % 4 === 3 && beatInBar === 2 ? decay(phase, 6) : 0,
      port: 0.5 + 0.5 * Math.sin((2 * Math.PI * beat) / 2),
      portHue: (seconds * 0.12) % 1,
      mirrorFold: drop,
      bob: 0.02 * decay(phase, 6),
      roll: 0,
    };
  }

  const burst = (beat % 16) < 0.5 ? 1 : 0;
  const half = strobe(beat, 2);
  const sixteenth = Math.floor(beat * 4) % 2;
  return {
    bar: Math.max(burst, 0.3 + 0.7 * strobe(beat, 4)),
    headL: Math.max(burst, half),
    headR: Math.max(burst, 1 - half),
    turnL: Math.max(burst, sixteenth === 0 ? 1 : 0),
    turnR: Math.max(burst, sixteenth === 1 ? 1 : 0),
    tail: Math.max(burst, 0.4 + 0.6 * strobe(beat, 4)),
    brake: Math.max(burst, decay(phase, 5)),
    reverse: Math.max(burst, beatInBar === 0 ? strobe(beat, 8) : 0),
    port: Math.max(burst, strobe(beat, 2)),
    portHue: (seconds * 0.4) % 1,
    mirrorFold: window((beat % 16) - 14, 2, 0.33, 0.5),
    bob: 0.03 * decay(phase, 7),
    roll: 0.02 * Math.sin(2 * Math.PI * beat * 2),
  };
}
