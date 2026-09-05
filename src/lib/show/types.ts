export type StylePreset = 'balanced' | 'energetic' | 'chill';

export interface ClosureOptions {
  /** Open the charge port and flash its LED in rainbow colours. Harmless. */
  chargePort: boolean;
  /** Fold / unfold the mirrors on drops. */
  mirrors: boolean;
  /** Windows dance for up to 20 s on the biggest section, then close. */
  windows: boolean;
  /** Open the liftgate (frunk on Cybertruck), dance, close at the end. Needs clearance behind the car. */
  liftgate: boolean;
  /** Present / retract door handles (Model S only) on drops. */
  doorHandles: boolean;
}

export interface ShowOptions {
  style: StylePreset;
  /** 0..1, how busy the show is. */
  intensity: number;
  closures: ClosureOptions;
}

export const DEFAULT_SHOW_OPTIONS: ShowOptions = {
  style: 'balanced',
  intensity: 0.6,
  closures: {
    chargePort: true,
    mirrors: true,
    windows: false,
    liftgate: false,
    doorHandles: false,
  },
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
}
