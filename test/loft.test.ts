import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { buildBodyGeometry, CAR, halfWidth, station } from '../src/lib/car3d/loft';

describe('lofted car body', () => {
  const { geometry } = buildBodyGeometry(new Color(0xc21521), new Color(0x090c14));
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
});
