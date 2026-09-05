/**
 * Vehicle profiles: which of the 48 channels actually drive a light on a given
 * Tesla, whether that light ramps or just switches, which channels are OR'd
 * into one physical output, and which closures exist.
 *
 * The .fseq format is identical for every vehicle; this only shapes the
 * choreography and the on-screen preview. Facts come from the "Light Channels
 * with Brightness Control", "Light channel mapping details" and "Closures
 * channels" sections of https://github.com/teslamotors/light-show.
 */
import { CH } from './channels';

export type VehicleModel = 'model-s' | 'model-3' | 'model-x' | 'model-y' | 'cybertruck';
export type HeadlightType = 'reflector' | 'projector';
export type Region = 'na' | 'row';

export interface VehicleConfig {
  model: VehicleModel;
  year: number;
  /** LED reflector lamps ramp the outer main beam; LED projector (matrix) lamps switch it. */
  headlights: HeadlightType;
  /** North America vs rest of world (side markers vs rear fog). */
  region: Region;
  /** Model 3 Standard Range (+): no front fog lights, no aux park lights. */
  standardRange: boolean;
  /** Model 3: power liftgate fitted (Model Y always has one). */
  powerLiftgate: boolean;
}

export const MODELS: { id: VehicleModel; label: string; years: [number, number] }[] = [
  { id: 'model-3', label: 'Model 3', years: [2017, 2027] },
  { id: 'model-y', label: 'Model Y', years: [2020, 2027] },
  { id: 'model-s', label: 'Model S', years: [2021, 2027] },
  { id: 'model-x', label: 'Model X', years: [2021, 2027] },
  { id: 'cybertruck', label: 'Cybertruck', years: [2023, 2027] },
];

export function modelLabel(model: VehicleModel): string {
  return MODELS.find((m) => m.id === model)?.label ?? model;
}

export function yearsFor(model: VehicleModel): number[] {
  const m = MODELS.find((x) => x.id === model)!;
  const out: number[] = [];
  for (let y = m.years[1]; y >= m.years[0]; y--) out.push(y);
  return out;
}

/** Best guess of the headlight hardware for a model year; the user can override. */
export function defaultHeadlights(model: VehicleModel, year: number): HeadlightType {
  switch (model) {
    case 'model-3':
      return year <= 2020 ? 'reflector' : 'projector';
    case 'model-y':
      return year <= 2020 ? 'reflector' : 'projector';
    case 'model-s':
    case 'model-x':
      return year <= 2022 ? 'reflector' : 'projector';
    default:
      return 'projector';
  }
}

export const DEFAULT_VEHICLE: VehicleConfig = {
  model: 'model-3',
  year: 2023,
  headlights: 'projector',
  region: 'na',
  standardRange: false,
  powerLiftgate: true,
};

export type LightGroupKey =
  | 'outerBeam'
  | 'innerBeam'
  | 'signature'
  | 'channels456'
  | 'frontTurn'
  | 'frontFog'
  | 'auxPark'
  | 'sideMarker'
  | 'sideRepeater'
  | 'rearTurn'
  | 'brake'
  | 'tail'
  | 'reverse'
  | 'rearFog'
  | 'plate';

export const GROUP_CHANNELS: Record<LightGroupKey, number[]> = {
  outerBeam: [CH.outerMainBeamL, CH.outerMainBeamR],
  innerBeam: [CH.innerMainBeamL, CH.innerMainBeamR],
  signature: [CH.signatureL, CH.signatureR],
  channels456: [CH.channel4L, CH.channel4R, CH.channel5L, CH.channel5R, CH.channel6L, CH.channel6R],
  frontTurn: [CH.frontTurnL, CH.frontTurnR],
  frontFog: [CH.frontFogL, CH.frontFogR],
  auxPark: [CH.auxParkL, CH.auxParkR],
  sideMarker: [CH.sideMarkerL, CH.sideMarkerR],
  sideRepeater: [CH.sideRepeaterL, CH.sideRepeaterR],
  rearTurn: [CH.rearTurnL, CH.rearTurnR],
  brake: [CH.brakeLights],
  tail: [CH.tailL, CH.tailR],
  reverse: [CH.reverseLights],
  rearFog: [CH.rearFogLights],
  plate: [CH.licensePlate],
};

const GROUP_LABEL: Record<LightGroupKey, string> = {
  outerBeam: 'Outer main beams',
  innerBeam: 'Inner main beams',
  signature: 'Signature lights',
  channels456: 'Channels 4–6',
  frontTurn: 'Front turn signals',
  frontFog: 'Front fog lights',
  auxPark: 'Aux park lights',
  sideMarker: 'Front side markers',
  sideRepeater: 'Side repeaters',
  rearTurn: 'Rear turn signals',
  brake: 'Brake lights',
  tail: 'Tail lights',
  reverse: 'Reverse lights',
  rearFog: 'Rear fog lights',
  plate: 'License plate lights',
};

export interface LightCapability {
  present: boolean;
  ramping: boolean;
  label: string;
  note?: string;
}

export interface OredGroup {
  label: string;
  channels: number[];
}

export interface ClosureAvailability {
  liftgate: boolean;
  liftgateLabel: string;
  mirrors: boolean;
  chargePort: boolean;
  windows: boolean;
  doorHandles: boolean;
  frontDoors: boolean;
  falconDoors: boolean;
}

export interface VehicleProfile {
  config: VehicleConfig;
  label: string;
  lights: Record<LightGroupKey, LightCapability>;
  /** Several channels feeding one physical output: only shared off-time reads as a flash. */
  ored: OredGroup[];
  rampingChannels: Set<number>;
  absentChannels: Set<number>;
  /** Tail lights and license plate share one output (early Model 3). */
  tailsCombined: boolean;
  closures: ClosureAvailability;
  notes: string[];
}

function cap(key: LightGroupKey, present: boolean, ramping: boolean, note?: string, label?: string): LightCapability {
  return { present, ramping: present && ramping, label: label ?? GROUP_LABEL[key], note };
}

export function vehicleProfile(cfg: VehicleConfig): VehicleProfile {
  const { model, year, headlights, region } = cfg;
  const na = region === 'na';
  const notes: string[] = [];
  const ored: OredGroup[] = [];
  const outerRamps = headlights === 'reflector';
  let tailsCombined = false;

  const lights = {} as Record<LightGroupKey, LightCapability>;
  const closures: ClosureAvailability = {
    liftgate: true,
    liftgateLabel: 'Liftgate',
    mirrors: true,
    chargePort: true,
    windows: true,
    doorHandles: false,
    frontDoors: false,
    falconDoors: false,
  };

  switch (model) {
    case 'model-s':
    case 'model-x': {
      const isS = model === 'model-s';
      lights.outerBeam = cap('outerBeam', true, outerRamps, outerRamps ? 'ramps (LED reflector lamps)' : 'on/off (LED projector lamps)');
      lights.innerBeam = cap('innerBeam', true, true, 'ramps');
      lights.signature = cap('signature', true, false, 'on/off');
      lights.channels456 = cap('channels456', true, true, 'individual control; Channel 4 sets the ramp for all three');
      lights.frontTurn = cap('frontTurn', true, false, 'on/off');
      lights.frontFog = cap('frontFog', true, false);
      lights.auxPark = cap('auxPark', true, false, isS ? 'shares an output with the side marker on each side' : undefined);
      lights.sideMarker = cap('sideMarker', na, false, na ? undefined : 'not fitted outside North America');
      lights.sideRepeater = cap('sideRepeater', true, false);
      lights.rearTurn = cap('rearTurn', true, false);
      lights.brake = cap('brake', true, false);
      lights.tail = cap('tail', true, false);
      lights.reverse = cap('reverse', true, false);
      lights.rearFog = cap('rearFog', !na || model === 'model-x', false, na && isS ? 'not fitted on North American Model S' : undefined);
      lights.plate = cap('plate', true, false);
      if (isS && na) {
        ored.push({ label: 'Left aux park + left side marker', channels: [CH.auxParkL, CH.sideMarkerL] });
        ored.push({ label: 'Right aux park + right side marker', channels: [CH.auxParkR, CH.sideMarkerR] });
      }
      closures.doorHandles = isS;
      closures.frontDoors = !isS;
      closures.falconDoors = !isS;
      if (!isS) notes.push('Moving windows while the falcon doors move can trigger false pinch detection and stop the show.');
      break;
    }
    case 'model-3':
    case 'model-y': {
      const is3 = model === 'model-3';
      const sr = is3 && cfg.standardRange;
      lights.outerBeam = cap('outerBeam', true, outerRamps, outerRamps ? 'ramps (LED reflector lamps)' : 'on/off (LED projector lamps)');
      lights.innerBeam = cap('innerBeam', true, true, 'ramps');
      lights.signature = cap('signature', true, true, 'ramps');
      lights.channels456 = cap('channels456', true, true, 'all three share one output per side');
      lights.frontTurn = cap('frontTurn', true, true, 'ramps');
      lights.frontFog = cap('frontFog', !sr, false, sr ? 'not fitted on Standard Range' : undefined);
      lights.auxPark = cap('auxPark', !sr, false, sr ? 'not fitted on Standard Range' : 'shares one output with all side markers');
      lights.sideMarker = cap('sideMarker', na, false, na ? 'shares one output with the aux park lights' : 'not fitted outside North America');
      lights.sideRepeater = cap('sideRepeater', true, false);
      lights.rearTurn = cap('rearTurn', true, false);
      lights.brake = cap('brake', true, false);
      tailsCombined = is3 && year <= 2020;
      lights.tail = cap('tail', true, false, tailsCombined ? 'left, right and plate lights operate together on Model 3 built before Oct 2020' : undefined);
      lights.reverse = cap('reverse', true, false);
      lights.rearFog = cap('rearFog', !na, false, na ? 'not fitted in North America' : undefined);
      lights.plate = cap('plate', !tailsCombined, false, tailsCombined ? 'driven by the tail light channels on this build' : undefined);
      const parkChans = [...(sr ? [] : GROUP_CHANNELS.auxPark), ...(na ? GROUP_CHANNELS.sideMarker : [])];
      if (parkChans.length > 1) ored.push({ label: 'Aux park + side markers (all)', channels: parkChans });
      ored.push({ label: 'Left Channels 4–6', channels: [CH.channel4L, CH.channel5L, CH.channel6L] });
      ored.push({ label: 'Right Channels 4–6', channels: [CH.channel4R, CH.channel5R, CH.channel6R] });
      if (tailsCombined) ored.push({ label: 'Tail lights + license plate', channels: [CH.tailL, CH.tailR, CH.licensePlate] });
      closures.liftgate = is3 ? cfg.powerLiftgate : true;
      if (is3 && !cfg.powerLiftgate) notes.push('Without a power liftgate the liftgate channel does nothing.');
      break;
    }
    case 'cybertruck': {
      lights.outerBeam = cap('outerBeam', true, true, 'ramps');
      lights.innerBeam = cap('innerBeam', true, true, 'ramps');
      lights.signature = cap('signature', false, false, 'no signature lights on Cybertruck');
      lights.channels456 = cap('channels456', false, false, 'not used on Cybertruck');
      lights.frontTurn = cap('frontTurn', true, true, 'ramps');
      lights.frontFog = cap('frontFog', false, false, 'not fitted');
      lights.auxPark = cap('auxPark', true, false, 'drives the frunk light', 'Frunk light');
      lights.sideMarker = cap('sideMarker', true, true, 'ramps');
      lights.sideRepeater = cap('sideRepeater', true, false, 'drives the rear side markers', 'Rear side markers');
      lights.rearTurn = cap('rearTurn', false, false, 'disabled on Cybertruck');
      lights.brake = cap('brake', true, false, 'full brightness control on Cybertruck');
      lights.tail = cap('tail', true, false, 'drives the left/right reverse lights', 'Reverse lights (L/R)');
      lights.reverse = cap('reverse', true, false, 'drives the bed lights (always 500 ms ramps)', 'Bed lights');
      lights.rearFog = cap('rearFog', false, false, 'not fitted');
      lights.plate = cap('plate', true, false);
      closures.liftgateLabel = 'Frunk';
      notes.push('The Cybertruck light bars and interior RGB need the 200-channel xLights layout and are not part of this show.');
      break;
    }
  }

  const rampingChannels = new Set<number>();
  const absentChannels = new Set<number>();
  for (const key of Object.keys(GROUP_CHANNELS) as LightGroupKey[]) {
    const c = lights[key];
    for (const ch of GROUP_CHANNELS[key]) {
      if (!c.present) absentChannels.add(ch);
      else if (c.ramping) rampingChannels.add(ch);
    }
  }

  const headlightText = model === 'cybertruck' ? '' : ` · LED ${headlights} lamps`;
  const label = `${modelLabel(model)} ${year}${headlightText} · ${na ? 'North America' : 'Rest of world'}`;
  return { config: cfg, label, lights, ored, rampingChannels, absentChannels, tailsCombined, closures, notes };
}
