import { describe, expect, it } from 'vitest';
import { CH } from '../src/lib/tesla/channels';
import { DEFAULT_VEHICLE, defaultHeadlights, vehicleProfile, yearsFor, type VehicleConfig } from '../src/lib/tesla/vehicles';

const cfg = (patch: Partial<VehicleConfig>): VehicleConfig => ({ ...DEFAULT_VEHICLE, ...patch });

describe('vehicleProfile', () => {
  it('describes an early Model 3 with reflector lamps in North America', () => {
    const p = vehicleProfile(cfg({ model: 'model-3', year: 2019, headlights: 'reflector', region: 'na' }));
    expect(p.lights.outerBeam.ramping).toBe(true);
    expect(p.lights.signature.ramping).toBe(true);
    expect(p.lights.frontTurn.ramping).toBe(true);
    expect(p.tailsCombined).toBe(true);
    expect(p.lights.plate.present).toBe(false);
    expect(p.lights.sideMarker.present).toBe(true);
    expect(p.lights.rearFog.present).toBe(false);
    expect(p.ored.some((o) => o.channels.includes(CH.auxParkL) && o.channels.includes(CH.sideMarkerR))).toBe(true);
    expect(p.closures.doorHandles).toBe(false);
    expect(p.closures.falconDoors).toBe(false);
    expect(p.closures.liftgate).toBe(true);
  });

  it('drops fog and aux park on Standard Range and side markers outside North America', () => {
    const p = vehicleProfile(cfg({ model: 'model-3', year: 2022, standardRange: true, region: 'row' }));
    expect(p.lights.frontFog.present).toBe(false);
    expect(p.lights.auxPark.present).toBe(false);
    expect(p.lights.sideMarker.present).toBe(false);
    expect(p.lights.rearFog.present).toBe(true);
    expect(p.absentChannels.has(CH.frontFogL)).toBe(true);
    expect(p.absentChannels.has(CH.sideMarkerL)).toBe(true);
    expect(p.tailsCombined).toBe(false);
  });

  it('gives Model S handles and Model X doors', () => {
    const s = vehicleProfile(cfg({ model: 'model-s', year: 2023, region: 'na' }));
    expect(s.closures.doorHandles).toBe(true);
    expect(s.closures.falconDoors).toBe(false);
    expect(s.lights.signature.ramping).toBe(false);
    expect(s.lights.rearFog.present).toBe(false);
    expect(s.ored).toHaveLength(2);
    const x = vehicleProfile(cfg({ model: 'model-x', year: 2023, region: 'na' }));
    expect(x.closures.falconDoors).toBe(true);
    expect(x.closures.frontDoors).toBe(true);
    expect(x.closures.doorHandles).toBe(false);
    expect(x.lights.rearFog.present).toBe(true);
  });

  it('remaps the Cybertruck', () => {
    const p = vehicleProfile(cfg({ model: 'cybertruck', year: 2025 }));
    expect(p.lights.signature.present).toBe(false);
    expect(p.lights.channels456.present).toBe(false);
    expect(p.lights.rearTurn.present).toBe(false);
    expect(p.lights.frontFog.present).toBe(false);
    expect(p.lights.tail.label).toMatch(/Reverse/);
    expect(p.lights.reverse.label).toMatch(/Bed/);
    expect(p.closures.liftgateLabel).toBe('Frunk');
    expect(p.absentChannels.has(CH.rearTurnL)).toBe(true);
    expect(p.rampingChannels.has(CH.sideMarkerL)).toBe(true);
  });

  it('has sensible year ranges and headlight defaults', () => {
    expect(yearsFor('model-3')[yearsFor('model-3').length - 1]).toBe(2017);
    expect(yearsFor('model-s')[yearsFor('model-s').length - 1]).toBe(2021);
    expect(defaultHeadlights('model-3', 2018)).toBe('reflector');
    expect(defaultHeadlights('model-3', 2024)).toBe('projector');
    expect(defaultHeadlights('cybertruck', 2024)).toBe('projector');
  });
});
