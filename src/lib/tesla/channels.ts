/**
 * Tesla Light Show channel map and value encodings.
 *
 * Source of truth: the official xLights template published at
 * https://github.com/teslamotors/light-show (xlights_rgbeffects.xml) and the
 * README's "Ramping light channels" / "Closures channels" tables.
 *
 * A standard show has 48 channels. Channels 1..46 are used; 47 and 48 are
 * unused padding in the 48-channel layout (the 200-channel Cybertruck layout
 * puts light bars there, which we do not generate).
 *
 * Channel numbers below are 1-based to match xLights; use `idx()` for 0-based
 * frame buffer offsets.
 */

export const CHANNEL_COUNT = 48;
export const STEP_MS = 20; // 50 fps, Tesla's recommended frame interval

/** 1-based channel numbers (as shown in xLights). */
export const CH = {
  outerMainBeamL: 1,
  outerMainBeamR: 2,
  innerMainBeamL: 3,
  innerMainBeamR: 4,
  signatureL: 5,
  signatureR: 6,
  channel4L: 7,
  channel4R: 8,
  channel5L: 9,
  channel5R: 10,
  channel6L: 11,
  channel6R: 12,
  frontTurnL: 13,
  frontTurnR: 14,
  frontFogL: 15,
  frontFogR: 16,
  auxParkL: 17,
  auxParkR: 18,
  sideMarkerL: 19,
  sideMarkerR: 20,
  sideRepeaterL: 21,
  sideRepeaterR: 22,
  rearTurnL: 23,
  rearTurnR: 24,
  brakeLights: 25,
  tailL: 26,
  tailR: 27,
  reverseLights: 28,
  rearFogLights: 29,
  licensePlate: 30,
  falconDoorL: 31,
  falconDoorR: 32,
  frontDoorL: 33,
  frontDoorR: 34,
  mirrorL: 35,
  mirrorR: 36,
  windowFrontL: 37,
  windowRearL: 38,
  windowFrontR: 39,
  windowRearR: 40,
  liftgate: 41,
  doorHandleFrontL: 42,
  doorHandleRearL: 43,
  doorHandleFrontR: 44,
  doorHandleRearR: 45,
  chargePort: 46,
} as const;

export type ChannelName = keyof typeof CH;

/** 0-based index into a 48-byte frame for a 1-based channel number. */
export const idx = (channel: number): number => channel - 1;

export const CHANNEL_NAMES: Record<number, string> = {
  1: 'Left Outer Main Beam',
  2: 'Right Outer Main Beam',
  3: 'Left Inner Main Beam',
  4: 'Right Inner Main Beam',
  5: 'Left Signature',
  6: 'Right Signature',
  7: 'Left Channel 4',
  8: 'Right Channel 4',
  9: 'Left Channel 5',
  10: 'Right Channel 5',
  11: 'Left Channel 6',
  12: 'Right Channel 6',
  13: 'Left Front Turn',
  14: 'Right Front Turn',
  15: 'Left Front Fog',
  16: 'Right Front Fog',
  17: 'Left Aux Park',
  18: 'Right Aux Park',
  19: 'Left Side Marker',
  20: 'Right Side Marker',
  21: 'Left Side Repeater',
  22: 'Right Side Repeater',
  23: 'Left Rear Turn',
  24: 'Right Rear Turn',
  25: 'Brake Lights',
  26: 'Left Tail',
  27: 'Right Tail',
  28: 'Reverse Lights',
  29: 'Rear Fog Lights',
  30: 'License Plate',
  31: 'Left Falcon Door',
  32: 'Right Falcon Door',
  33: 'Left Front Door',
  34: 'Right Front Door',
  35: 'Left Mirror',
  36: 'Right Mirror',
  37: 'Left Front Window',
  38: 'Left Rear Window',
  39: 'Right Front Window',
  40: 'Right Rear Window',
  41: 'Liftgate',
  42: 'Left Front Door Handle',
  43: 'Left Rear Door Handle',
  44: 'Right Front Door Handle',
  45: 'Right Rear Door Handle',
  46: 'Charge Port',
  47: '(unused)',
  48: '(unused)',
};

/** Channels 1..30 are lights. */
export const LIGHT_CHANNELS: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);
/** Channels 31..46 are closures. */
export const CLOSURE_CHANNELS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 31);
/** Channels that must stay 0 in a 48-channel show. */
export const UNUSED_CHANNELS: readonly number[] = [47, 48];

/**
 * Light values. xLights maps an "On" effect at N% brightness to
 * floor(255 * N / 100); the vehicle decodes these codes, so we emit the exact
 * bytes xLights would.
 */
export const LIGHT = {
  off: 0, //            Turn off; Instant   (empty timeline)
  offRamp500: 25, //    Turn off; 500 ms    (10%)
  offRamp1000: 51, //   Turn off; 1000 ms   (20%)
  offRamp2000: 76, //   Turn off; 2000 ms   (30%)
  onRamp500: 178, //    Turn on; 500 ms     (70%)
  onRamp1000: 204, //   Turn on; 1000 ms    (80%)
  onRamp2000: 229, //   Turn on; 2000 ms    (90%)
  on: 255, //           Turn on; Instant    (100%)
} as const;

export const LIGHT_VALUES: ReadonlySet<number> = new Set(Object.values(LIGHT));
/** Values that read as "off" on boolean (non-ramping) lights (< 50%). */
export const LIGHT_OFF_CODES: ReadonlySet<number> = new Set([
  LIGHT.off,
  LIGHT.offRamp500,
  LIGHT.offRamp1000,
  LIGHT.offRamp2000,
]);

/** Closure values (Idle / Open / Dance / Close / Stop). */
export const CLOSURE = {
  idle: 0,
  open: 63, //   25%
  dance: 127, // 50%
  close: 191, // 75%
  stop: 255, //  100%
} as const;

export const CLOSURE_VALUES: ReadonlySet<number> = new Set(Object.values(CLOSURE));

/**
 * Channels that ramp on at least some vehicles. Emitting ramp codes on
 * boolean-only hardware is harmless (>= 50% reads as on, < 50% as off), but we
 * only bother where it does something.
 */
export const RAMPING_CHANNELS: ReadonlySet<number> = new Set([
  CH.outerMainBeamL,
  CH.outerMainBeamR,
  CH.innerMainBeamL,
  CH.innerMainBeamR,
  CH.signatureL,
  CH.signatureR,
  CH.channel4L,
  CH.channel4R,
  CH.channel5L,
  CH.channel5R,
  CH.channel6L,
  CH.channel6R,
  CH.frontTurnL,
  CH.frontTurnR,
]);

/** Per-show actuation limits from the README ("Command Limit Per Show"). */
export const CLOSURE_LIMITS = {
  liftgate: 6,
  mirrors: 20,
  chargePort: 3,
  windows: 6,
  doorHandles: 20,
  frontDoors: 6,
  falconDoors: 6,
} as const;

export type ClosureGroup = keyof typeof CLOSURE_LIMITS;

export const CLOSURE_GROUP_CHANNELS: Record<ClosureGroup, readonly number[]> = {
  liftgate: [CH.liftgate],
  mirrors: [CH.mirrorL, CH.mirrorR],
  chargePort: [CH.chargePort],
  windows: [CH.windowFrontL, CH.windowRearL, CH.windowFrontR, CH.windowRearR],
  doorHandles: [CH.doorHandleFrontL, CH.doorHandleRearL, CH.doorHandleFrontR, CH.doorHandleRearR],
  frontDoors: [CH.frontDoorL, CH.frontDoorR],
  falconDoors: [CH.falconDoorL, CH.falconDoorR],
};

export function closureGroupOf(channel: number): ClosureGroup | undefined {
  for (const [group, chans] of Object.entries(CLOSURE_GROUP_CHANNELS) as [ClosureGroup, readonly number[]][]) {
    if (chans.includes(channel)) return group;
  }
  return undefined;
}
