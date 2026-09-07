/**
 * Canned "dance" for the marketing car: a pure function of seconds so the 3D
 * hero can be driven frame by frame without any audio. Values are 0..1 lamp
 * intensities or openings except where noted.
 */
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
  /** 0 = door windows closed, 1 = fully down. */
  windows: number;
  /** 0 = liftgate closed, 1 = fully open. */
  trunk: number;
  /** Vertical body offset in metres. */
  bob: number;
}

export const BPM = 124;

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
  windows: 0,
  trunk: 0,
  bob: 0,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const decay = (phase: number, k: number) => Math.exp(-phase * k);
/** Ramps 0→1 over `inLen`, holds, then 1→0 over `outLen`, across a window of `len` units. */
const window = (u: number, len: number, inLen: number, outLen: number) => (u < 0 || u >= len ? 0 : clamp01(Math.min(u / inLen, (len - u) / outLen)));
/** Windows "dance": while `gate` is up they bob between mostly-open and a third open. */
const dance = (beat: number, perBeat: number, gate: number) => gate * (0.65 + 0.35 * Math.sin(2 * Math.PI * beat * perBeat));

/** One 32-beat routine: lights on every beat, windows dancing in bars 3–4, liftgate in bars 5–6, mirrors on the closing drop. */
export function choreograph(seconds: number): LampState {
  const beat = (Math.max(0, seconds) * BPM) / 60;
  const phase = beat % 1;
  const beatInBar = Math.floor(beat) % 4;
  const bar = Math.floor(beat / 4);
  const hit = decay(phase, 5);
  const cycle = beat % 32;
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
    mirrorFold: window(cycle - 28, 4, 0.5, 1),
    windows: dance(beat, 0.5, window(cycle - 8, 8, 1.5, 1.5)),
    trunk: window(cycle - 18, 8, 2, 1.5),
    bob: 0.02 * decay(phase, 6),
  };
}
