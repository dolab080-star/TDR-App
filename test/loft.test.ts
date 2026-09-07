import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { buildBodyGeometry, buildPaneGeometry, CAR, halfWidth, HATCH, splitBody, station, WINDOWS, ZONE } from '../src/lib/car3d/loft';

describe('lofted car body', () => {
  const geometry = buildBodyGeometry({ paint: new Color(0xc21521), glass: new Color(0x090c14), cabin: new Color(0x2a2522) });
  const pos = geometry.attributes.position;
  const box = geometry.boundingBox!;

  it('has finite positions and normals everywhere', () => {
    const n = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i))).toBe(true);
      expect(Number.isFinite(n.getX(i)) && Number.isFinite(n.getY(i)) && Number.isFinite(n.getZ(i))).toBe(true);
    }
  });

  it('matches Model Y overall dimensions within a few centimetres', () => {
    expect(box.max.x - box.min.x).toBeCloseTo(4.82, 1);
    expect(box.max.z - box.min.z).toBeCloseTo(1.92, 1);
    expect(box.max.y).toBeCloseTo(1.62, 1);
    expect(box.min.y).toBeGreaterThan(0.2);
  });

  it('is symmetric left to right', () => {
    expect(box.max.z).toBeCloseTo(-box.min.z, 5);
  });

  it('has a tall glasshouse behind the cowl and none ahead of it', () => {
    const mid = station(-0.5);
    expect(mid.hasGlass).toBe(true);
    expect(Math.max(...mid.half.map((p) => p[1])) - mid.shoulder).toBeGreaterThan(0.5);
    expect(station(1.5).hasGlass).toBe(false);
  });

  it('duplicates the shoulder point so paint and glass meet on a crisp line', () => {
    const st = station(-0.5);
    expect(st.half[st.lowerCount - 1]).toEqual(st.half[st.lowerCount]);
    expect(st.half[st.lowerCount][1]).toBeCloseTo(st.shoulder, 5);
  });

  it('is widest at the doors and narrower at nose and tail', () => {
    expect(halfWidth(0)).toBeCloseTo(0.96, 2);
    expect(halfWidth(2.3)).toBeLessThan(0.9);
    expect(halfWidth(CAR.nose)).toBeCloseTo(0, 2);
    expect(halfWidth(-2.3)).toBeGreaterThan(halfWidth(2.3));
  });

  it('presses the wheel wells inward so wheels sit in pockets', () => {
    let pocket = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = Math.abs(pos.getZ(i));
      const dx = x - CAR.wheelX;
      const dy = y - CAR.wheelY;
      if (dx * dx + dy * dy < (CAR.archRadius - 0.04) ** 2 && y < 0.85) {
        expect(z).toBeLessThanOrEqual(CAR.pocketHalfWidth + 1e-6);
        pocket++;
      }
    }
    expect(pocket).toBeGreaterThan(20);
  });

  it('marks openable windows only on the flank between the door ranges', () => {
    const zone = geometry.attributes.zone;
    let windows = 0;
    for (let i = 0; i < pos.count; i++) {
      if (zone.getX(i) !== ZONE.window) continue;
      windows++;
      const x = pos.getX(i);
      expect(WINDOWS.some((w) => x >= w.from && x <= w.to), `window vertex at x=${x}`).toBe(true);
      expect(pos.getY(i)).toBeGreaterThan(1.0);
      expect(pos.getY(i)).toBeLessThan(1.55);
    }
    expect(windows).toBeGreaterThan(100);
  });

  it('splits a liftgate that lives entirely behind the hinge and above the bumper', () => {
    const { shell, hatch, cabin } = splitBody(geometry);
    expect(shell.index!.count + hatch.index!.count + cabin.index!.count).toBe(geometry.index!.count);
    expect(cabin.index!.count).toBeGreaterThan(100);
    expect(hatch.index!.count).toBeGreaterThan(600);
    const seen = new Set<number>();
    for (let t = 0; t < hatch.index!.count; t++) seen.add(hatch.index!.getX(t));
    for (const i of seen) {
      expect(pos.getX(i)).toBeLessThanOrEqual(HATCH.hingeX);
      expect(pos.getY(i)).toBeGreaterThan(HATCH.cutY - 1e-6);
    }
    // The tail end of the roof belongs to the hatch; the door area does not.
    expect([...seen].some((i) => pos.getX(i) < -2.3 && pos.getY(i) > 1.0)).toBe(true);
    expect([...seen].some((i) => pos.getX(i) > -1.0)).toBe(false);
  });

  it('builds window panes that hug the flank and stay inside the door range', () => {
    for (const w of WINDOWS) {
      for (const side of [1, -1] as const) {
        const pane = buildPaneGeometry(w.from, w.to, side);
        const p = pane.attributes.position;
        expect(p.count).toBeGreaterThan(50);
        for (let i = 0; i < p.count; i++) {
          expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i))).toBe(true);
          expect(p.getX(i)).toBeGreaterThanOrEqual(w.from - 1e-6);
          expect(p.getX(i)).toBeLessThanOrEqual(w.to + 1e-6);
          expect(Math.sign(p.getZ(i))).toBe(side);
          expect(Math.abs(p.getZ(i))).toBeLessThan(halfWidth(p.getX(i)));
          expect(p.getY(i)).toBeGreaterThan(1.0);
        }
      }
    }
  });
});
