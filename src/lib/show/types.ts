import { DEFAULT_VEHICLE, type VehicleConfig } from '../tesla/vehicles';

export type StylePreset = 'balanced' | 'energetic' | 'chill';

/** When a closure opens. */
export type OpenAt = 'start' | 'firstDrop' | 'custom';
/** When a closure closes. */
export type CloseAt = 'end' | 'afterDance' | 'custom';
/** Where dance episodes go. */
export type DanceMode = 'none' | 'loudest' | 'everyHigh' | 'custom';
/** Where one-shot moves (mirrors, handles) go. */
export type MoveTrigger = 'drops' | 'firstDrop' | 'loudest' | 'custom';

/** Liftgate / frunk and Model X falcon doors: open, dance, close. */
export interface OpenDanceCloseOptions {
  enabled: boolean;
  openAt: OpenAt;
  /** Seconds, used when openAt is 'custom'. */
  openTime: number;
  dance: DanceMode;
  /** Length of each dance episode in seconds (thermal guidance: keep the total under ~30 s). */
  danceSeconds: number;
  /** Seconds, used when dance is 'custom'. */
  danceTimes: number[];
  closeAt: CloseAt;
  /** Seconds, used when closeAt is 'custom'. */
  closeTime: number;
}

export interface WindowsOptions {
  enabled: boolean;
  which: 'all' | 'front' | 'rear';
  trigger: 'loudest' | 'everyHigh' | 'custom';
  customTimes: number[];
  danceSeconds: number;
  /** Close the windows after each dance episode (recommended). */
  closeAfter: boolean;
  /** Start each window 0.3 s after the previous one for a wave. */
  stagger: boolean;
}

export interface MirrorsOptions {
  enabled: boolean;
  trigger: MoveTrigger;
  customTimes: number[];
  /** Seconds to stay folded before unfolding. */
  holdSeconds: number;
  /** Maximum fold/unfold pairs (each uses 2 of the 20 allowed commands). */
  maxMoves: number;
}

export interface DoorHandlesOptions {
  enabled: boolean;
  trigger: MoveTrigger;
  customTimes: number[];
  /** Seconds the handles stay presented. */
  holdSeconds: number;
}

export interface ChargePortOptions {
  enabled: boolean;
  openAt: OpenAt;
  openTime: number;
  /** Flash the charge port LED in rainbow colours while open. */
  dance: boolean;
  closeAt: 'end' | 'custom';
  closeTime: number;
}

/** Model X front doors: open and close only. */
export interface FrontDoorsOptions {
  enabled: boolean;
  openAt: OpenAt;
  openTime: number;
  closeAt: 'end' | 'custom';
  closeTime: number;
}

export interface ClosureOptions {
  chargePort: ChargePortOptions;
  mirrors: MirrorsOptions;
  windows: WindowsOptions;
  liftgate: OpenDanceCloseOptions;
  doorHandles: DoorHandlesOptions;
  falconDoors: OpenDanceCloseOptions;
  frontDoors: FrontDoorsOptions;
}

export interface ShowOptions {
  style: StylePreset;
  /** 0..1, how busy the show is. */
  intensity: number;
  vehicle: VehicleConfig;
  closures: ClosureOptions;
}

export const DEFAULT_CLOSURES: ClosureOptions = {
  chargePort: { enabled: true, openAt: 'start', openTime: 1, dance: true, closeAt: 'end', closeTime: 0 },
  mirrors: { enabled: true, trigger: 'drops', customTimes: [], holdSeconds: 4, maxMoves: 5 },
  windows: { enabled: false, which: 'all', trigger: 'loudest', customTimes: [], danceSeconds: 20, closeAfter: true, stagger: true },
  liftgate: { enabled: false, openAt: 'start', openTime: 1, dance: 'loudest', danceSeconds: 20, danceTimes: [], closeAt: 'end', closeTime: 0 },
  doorHandles: { enabled: false, trigger: 'drops', customTimes: [], holdSeconds: 4 },
  falconDoors: { enabled: false, openAt: 'start', openTime: 1, dance: 'loudest', danceSeconds: 20, danceTimes: [], closeAt: 'end', closeTime: 0 },
  frontDoors: { enabled: false, openAt: 'start', openTime: 1, closeAt: 'end', closeTime: 0 },
};

export const DEFAULT_SHOW_OPTIONS: ShowOptions = {
  style: 'balanced',
  intensity: 0.6,
  vehicle: DEFAULT_VEHICLE,
  closures: DEFAULT_CLOSURES,
};

export type ShowEventKind = 'drop' | 'build' | 'ending' | 'closure';

export interface ShowEvent {
  time: number;
  kind: ShowEventKind;
  label: string;
}

export interface GeneratedShow {
  frames: Uint8Array;
  frameCount: number;
  stepMs: number;
  channelCount: number;
  events: ShowEvent[];
  /** Things the choreographer had to skip or clamp (limits, travel times, vehicle). */
  warnings: string[];
}
