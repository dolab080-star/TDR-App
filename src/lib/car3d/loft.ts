/**
 * Lofted crossover body: a smooth cross-section is defined at every station
 * along the length and swept into one indexed mesh, so the hood, glasshouse,
 * shoulders and bumpers flow into each other with clean smooth normals.
 * Proportions follow the 2026 Model Y (4.79 m long, 1.92 m wide, 1.62 m tall,
 * 2.89 m wheelbase) without copying any styling detail.
 */
import * as THREE from 'three';

export const CAR = {
  nose: 2.42,
  tail: -2.4,
  cowl: 1.02,
  wheelX: 1.445,
  wheelY: 0.36,
  wheelZ: 0.8,
  archRadius: 0.47,
  pocketHalfWidth: 0.6,
};

type Key = [number, number];

/** Piecewise cubic Hermite through sorted keypoints with finite-difference tangents. */
function curve(keys: Key[]): (x: number) => number {
  const n = keys.length;
  const tangents = keys.map((_, i) => {
    const a = keys[Math.max(0, i - 1)];
    const b = keys[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (i < n - 2 && x > keys[i + 1][0]) i++;
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangents[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangents[i + 1];
  };
}

const topHeight = curve([
  [-2.4, 1.02],
  [-2.25, 1.12],
  [-1.95, 1.3],
  [-1.5, 1.5],
  [-1.0, 1.6],
  [-0.35, 1.62],
  [0.3, 1.53],
  [0.65, 1.3],
  [1.02, 1.03],
  [1.6, 0.95],
  [2.2, 0.85],
  [2.42, 0.76],
]);

const shoulderHeight = curve([
  [-2.4, 1.0],
  [-1.8, 1.09],
  [-1.0, 1.06],
  [0.0, 1.02],
  [1.02, 0.99],
  [2.0, 0.84],
  [2.42, 0.73],
]);

const floorHeight = curve([
  [-2.4, 0.36],
  [-2.2, 0.3],
  [-1.7, 0.26],
  [1.7, 0.26],
  [2.2, 0.28],
  [2.42, 0.32],
]);

const smoothstep = (edge0: number, edge1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Plan-view half width: a superellipse, sharper at the nose than the tail. */
export function halfWidth(x: number): number {
  const front = x >= 0;
  const t = Math.min(1, Math.abs(x) / (front ? CAR.nose : -CAR.tail));
  const n = front ? 5 : 6;
  return 0.96 * Math.pow(Math.max(0, 1 - Math.pow(t, n)), 1 / n);
}

function glassHalfWidth(x: number): number {
  const span = CAR.cowl - CAR.tail;
  const t = Math.min(1, Math.max(0, (CAR.cowl - x) / span));
  const taper = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t * 2 - 1), 5)), 1 / 5);
  return Math.min(halfWidth(x) - 0.12, 0.62 + 0.22 * taper);
}

/** Chaikin corner cutting: rounds every corner of a polyline while keeping the end points. */
function chaikin(points: Key[], iterations: number): Key[] {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out: Key[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      out.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function resample(points: Key[], count: number): Key[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[lengths.length - 1];
  const out: Key[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * total;
    while (seg < points.length - 2 && lengths[seg + 1] < d) seg++;
    const span = lengths[seg + 1] - lengths[seg] || 1;
    const t = Math.min(1, Math.max(0, (d - lengths[seg]) / span));
    out.push([points[seg][0] + (points[seg + 1][0] - points[seg][0]) * t, points[seg][1] + (points[seg + 1][1] - points[seg][1]) * t]);
  }
  return out;
}

export interface Station {
  x: number;
  /**
   * Right-half section from floor centre to roof centre, as [z, y]. The
   * shoulder point appears twice (end of `lower`, start of `upper`) so the
   * mesh gets a crisp crease and an exact paint/glass boundary there.
   */
  half: Key[];
  lowerCount: number;
  shoulder: number;
  hasGlass: boolean;
}

export const LOWER_POINTS = 26;
export const UPPER_POINTS = 28;

export function station(x: number): Station {
  const w = halfWidth(x);
  const floor = floorHeight(x);
  const shoulder = Math.max(floor + 0.2, shoulderHeight(x));
  const top = Math.max(shoulder + 0.03, topHeight(x));
  const hasGlass = x < CAR.cowl && top > shoulder + 0.08;
  const shoulderPoint: Key = [w - 0.05, shoulder];
  const lower: Key[] = [
    [0, floor],
    [w * 0.78, floor],
    [w - 0.015, floor + 0.05],
    [w, floor + 0.18],
    [w, Math.max(floor + 0.2, shoulder - 0.3)],
    [w - 0.025, shoulder - 0.08],
    shoulderPoint,
  ];
  const upper: Key[] = [shoulderPoint];
  if (hasGlass) {
    const g = Math.min(w - 0.09, glassHalfWidth(x));
    const roofEdge = g * 0.78;
    upper.push([g, shoulder + 0.04], [roofEdge + 0.04, top - 0.12], [roofEdge, top - 0.04], [roofEdge - 0.14, top], [0, top + 0.005]);
  } else {
    upper.push([w - 0.2, shoulder + 0.02], [w * 0.5, top - 0.01], [0, top]);
  }
  const half = [...resample(chaikin(lower, 3), LOWER_POINTS), ...resample(chaikin(upper, 3), UPPER_POINTS)];
  return { x, half, lowerCount: LOWER_POINTS, shoulder, hasGlass };
}

export interface BodyBuild {
  geometry: THREE.BufferGeometry;
}

/**
 * Builds the body as an indexed grid: `stations` rings of `2 * pointsPerHalf - 2`
 * vertices each, coloured red below the shoulder and glass-black above it.
 * Wheel wells are pressed inward so the wheels sit inside pockets.
 */
export function buildBodyGeometry(paint: THREE.Color, glass: THREE.Color, stations = 150): BodyBuild {
  const pointsPerHalf = LOWER_POINTS + UPPER_POINTS;
  const ring = 2 * pointsPerHalf - 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < stations; i++) {
    // Chebyshev spacing packs stations toward the nose and tail where curvature is high.
    const s = 0.5 - 0.5 * Math.cos((i / (stations - 1)) * Math.PI);
    const x = CAR.tail + (CAR.nose - CAR.tail) * s;
    const st = station(x);
    const pushPoint = (z: number, y: number, j: number) => {
      // Press the side inward around each wheel with a soft rim so the pocket edge stays smooth.
      let inside = 0;
      for (const cx of [-CAR.wheelX, CAR.wheelX]) {
        const dist = Math.hypot(x - cx, y - CAR.wheelY);
        inside = Math.max(inside, 1 - smoothstep(CAR.archRadius - 0.03, CAR.archRadius + 0.05, dist));
      }
      if (y > 0.85) inside = 0;
      const az = Math.abs(z);
      const zz = Math.sign(z || 1) * (az - inside * Math.max(0, az - CAR.pocketHalfWidth));
      positions.push(x, y, zz);
      const c = st.hasGlass && j >= st.lowerCount ? glass : paint;
      colors.push(c.r, c.g, c.b);
    };
    for (let j = 0; j < pointsPerHalf; j++) pushPoint(st.half[j][0], st.half[j][1], j);
    for (let j = pointsPerHalf - 2; j >= 1; j--) pushPoint(-st.half[j][0], st.half[j][1], j);
  }

  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + ((j + 1) % ring);
      const d = (i + 1) * ring + j;
      indices.push(a, c, b, a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry };
}
