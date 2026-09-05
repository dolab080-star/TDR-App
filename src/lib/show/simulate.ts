/**
 * Approximate what the vehicle will do with a frame buffer, for the on-screen
 * preview: boolean lights read >= 50% as ON, ramping lights move toward their
 * target at the encoded ramp rate.
 */
import { CHANNEL_COUNT, LIGHT, RAMPING_CHANNELS, LIGHT_CHANNELS } from '../tesla/channels';
import { rampSeconds } from './frameBuffer';

/** frameCount x 48 brightness values in 0..1 (closure channels are left 0). */
export function simulateBrightness(frames: Uint8Array, frameCount: number, stepMs = 20): Float32Array {
  const out = new Float32Array(frameCount * CHANNEL_COUNT);
  const dt = stepMs / 1000;
  const level = new Float32Array(CHANNEL_COUNT);
  for (let f = 0; f < frameCount; f++) {
    const row = f * CHANNEL_COUNT;
    for (const ch of LIGHT_CHANNELS) {
      const i = ch - 1;
      const v = frames[row + i];
      if (RAMPING_CHANNELS.has(ch)) {
        const ramp = rampSeconds(v);
        const target = v >= 128 ? 1 : 0;
        if (ramp === 0) level[i] = target;
        else {
          const step = dt / ramp;
          if (level[i] < target) level[i] = Math.min(target, level[i] + step);
          else if (level[i] > target) level[i] = Math.max(target, level[i] - step);
        }
      } else {
        level[i] = v >= 128 ? 1 : 0;
      }
      out[row + i] = level[i];
    }
  }
  return out;
}

export function closureLabel(value: number): string {
  switch (value) {
    case 63:
      return 'open';
    case 127:
      return 'dance';
    case 191:
      return 'close';
    case 255:
      return 'stop';
    default:
      return 'idle';
  }
}

export const LIGHT_CODE_LABEL: Record<number, string> = {
  [LIGHT.off]: 'off',
  [LIGHT.offRamp500]: 'off · 500 ms',
  [LIGHT.offRamp1000]: 'off · 1 s',
  [LIGHT.offRamp2000]: 'off · 2 s',
  [LIGHT.onRamp500]: 'on · 500 ms',
  [LIGHT.onRamp1000]: 'on · 1 s',
  [LIGHT.onRamp2000]: 'on · 2 s',
  [LIGHT.on]: 'on',
};
