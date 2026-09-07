/**
 * A procedurally built, deliberately generic 2026-style Model Y: lofted
 * crossover body, full-width front and rear light bars, recessed main beams,
 * red paint, door windows that slide down and a liftgate on a hinge. No
 * downloaded assets, no badges. Lamps are placed by raycasting onto the
 * finished body so they sit flush on the curved surfaces.
 */
import * as THREE from 'three';
import type { LampState } from './choreo';
import { buildBodyGeometry, buildPaneGeometry, CAR, halfWidth, HATCH, splitBody, WINDOWS } from './loft';

export interface Lamp {
  material: THREE.MeshStandardMaterial;
  glows: THREE.Sprite[];
  maxEmissive: number;
  maxGlow: number;
}

export interface CarRig {
  /** Outer group: yaw for turntable / drag. */
  spin: THREE.Group;
  /** Inner group: bob from the choreography. */
  body: THREE.Group;
  apply(state: LampState): void;
  dispose(): void;
}

const WINDOW_TRAVEL = 0.47;
const HATCH_OPEN = 1.15;

function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shadowTexture(): THREE.Texture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  return new THREE.CanvasTexture(canvas);
}

interface Hit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

function probe(target: THREE.Mesh, origin: THREE.Vector3, dir: THREE.Vector3, ray = new THREE.Raycaster()): Hit | null {
  ray.set(origin, dir.clone().normalize());
  const hit = ray.intersectObject(target, false)[0];
  if (!hit?.face) return null;
  return { point: hit.point.clone(), normal: hit.face.normal.clone().normalize() };
}

export function buildCar(): CarRig {
  const spin = new THREE.Group();
  const body = new THREE.Group();
  spin.add(body);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const paintParams = { color: 0xffffff, vertexColors: true, metalness: 0.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 };
  const paint = track(new THREE.MeshPhysicalMaterial(paintParams));
  const paintBothSides = track(new THREE.MeshPhysicalMaterial({ ...paintParams, side: THREE.DoubleSide }));
  const paintSolid = track(new THREE.MeshPhysicalMaterial({ color: 0xc21521, metalness: 0.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x07090f, metalness: 0.6, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide }));
  const trim = track(new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.75, metalness: 0.1 }));
  const cabin = track(new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.98, metalness: 0 }));
  const rubber = track(new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.95 }));
  const alloy = track(new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.35, metalness: 0.85 }));
  const chrome = track(new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.9 }));

  // The full body is only used for placing parts by raycast; it is drawn as shell + liftgate.
  const full = track(buildBodyGeometry({ paint: new THREE.Color(0xc21521), glass: new THREE.Color(0x07090f), cabin: new THREE.Color(0x2a2522) }));
  const probeMesh = new THREE.Mesh(full);
  probeMesh.updateMatrixWorld(true);
  const { shell, hatch, cabin: cabinGeo } = splitBody(full);
  body.add(new THREE.Mesh(track(shell), paint));
  body.add(new THREE.Mesh(track(cabinGeo), cabin));

  const hatchPivot = new THREE.Group();
  hatchPivot.position.set(HATCH.hingeX, HATCH.hingeY, 0);
  const hatchMesh = new THREE.Mesh(track(hatch), paintBothSides);
  hatchMesh.position.set(-HATCH.hingeX, -HATCH.hingeY, 0);
  hatchPivot.add(hatchMesh);
  body.add(hatchPivot);

  // Cargo bay seen when the liftgate is up.
  const cargo = new THREE.Mesh(track(new THREE.BoxGeometry(0.85, 0.52, 1.3)), cabin);
  cargo.position.set(-1.95, 0.86, 0);
  body.add(cargo);

  // Door windows: panes that match the flank and slide down into the doors.
  const panes: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    for (const w of WINDOWS) {
      const pane = new THREE.Mesh(track(buildPaneGeometry(w.from, w.to, side)), glass);
      body.add(pane);
      panes.push(pane);
    }
  }

  // Dark underbody fills the view through the wheel pockets.
  const underbody = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 0.4, CAR.pocketHalfWidth * 2 - 0.04)), trim);
  underbody.position.set(0, 0.45, 0);
  body.add(underbody);

  // Wheels: groups are rotated so local Y is the axle (world Z); the outer face is at local y = ±0.12.
  const tireGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 40));
  const rimGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 0.27, 32));
  const hubGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.31, 16));
  const spokeGeo = track(new THREE.BoxGeometry(0.26, 0.03, 0.06));
  const archGeo = track(new THREE.RingGeometry(CAR.archRadius - 0.03, CAR.archRadius + 0.06, 40, 1, 0, Math.PI));
  const archMat = track(new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(sx * CAR.wheelX, CAR.wheelY, sz * CAR.wheelZ);
      wheel.rotation.x = Math.PI / 2;
      wheel.add(new THREE.Mesh(tireGeo, rubber));
      wheel.add(new THREE.Mesh(rimGeo, trim));
      wheel.add(new THREE.Mesh(hubGeo, alloy));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(spokeGeo, alloy);
        spoke.rotation.y = a;
        spoke.position.set(Math.cos(a) * 0.125, sz * 0.145, -Math.sin(a) * 0.125);
        wheel.add(spoke);
      }
      body.add(wheel);

      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(sx * CAR.wheelX, CAR.wheelY, sz * (halfWidth(sx * CAR.wheelX) + 0.004));
      body.add(arch);
    }
  }

  const ray = new THREE.Raycaster();
  /** Places `obj` at a body-space position under `parent` (which may itself be offset, like the liftgate pivot). */
  const attach = (obj: THREE.Object3D, parent: THREE.Object3D) => {
    obj.position.sub(parent.position);
    parent.add(obj);
  };

  // Flush door handles.
  const handleGeo = track(new THREE.BoxGeometry(0.12, 0.022, 0.012));
  for (const side of [-1, 1]) {
    for (const [x, y] of [
      [0.45, 0.9],
      [-0.65, 0.92],
    ]) {
      const hit = probe(probeMesh, new THREE.Vector3(x, y, side * 5), new THREE.Vector3(0, 0, -side), ray);
      if (!hit) continue;
      const handle = new THREE.Mesh(handleGeo, chrome);
      handle.position.copy(hit.point).addScaledVector(hit.normal, 0.002);
      handle.lookAt(hit.point.clone().add(hit.normal));
      body.add(handle);
    }
  }

  // Lamps.
  const glowMap = track(glowTexture());
  const makeLamp = (color: number, maxEmissive: number, maxGlow: number): Lamp => ({
    material: track(new THREE.MeshStandardMaterial({ color: 0x1c1d22, emissive: color, emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 })),
    glows: [],
    maxEmissive,
    maxGlow,
  });
  const addGlow = (lamp: Lamp, color: number, at: THREE.Vector3, normal: THREE.Vector3, w: number, h: number, parent: THREE.Object3D = body) => {
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowMap, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    sprite.position.copy(at).addScaledVector(normal, 0.06);
    sprite.scale.set(w, h, 1);
    lamp.glows.push(sprite);
    attach(sprite, parent);
  };

  const placeStrip = (opts: {
    side: 'front' | 'rear';
    y: number;
    zFrom: number;
    zTo: number;
    count: number;
    h: number;
    depth: number;
    lift: number;
    material: (i: number) => THREE.Material;
    parent?: THREE.Object3D;
  }) => {
    const spacing = (opts.zTo - opts.zFrom) / opts.count;
    const geo = track(new THREE.BoxGeometry(spacing * 1.3, opts.h, opts.depth));
    const dir = new THREE.Vector3(opts.side === 'front' ? -1 : 1, 0, 0);
    const hits: Hit[] = [];
    for (let i = 0; i < opts.count; i++) {
      const z = opts.zFrom + (i + 0.5) * spacing;
      const hit = probe(probeMesh, new THREE.Vector3(opts.side === 'front' ? 5 : -5, opts.y, z), dir, ray);
      if (!hit) continue;
      const mesh = new THREE.Mesh(geo, opts.material(i));
      mesh.position.copy(hit.point).addScaledVector(hit.normal, opts.lift - opts.depth / 2);
      mesh.lookAt(hit.point.clone().add(hit.normal));
      attach(mesh, opts.parent ?? body);
      hits.push(hit);
    }
    return hits;
  };

  const white = 0xf4f8ff;
  const amber = 0xffa620;
  const red = 0xff2a2a;

  const frontBar = makeLamp(white, 3.2, 0.9);
  const turnL = makeLamp(amber, 3.5, 0.8);
  const turnR = makeLamp(amber, 3.5, 0.8);
  const frontHits = placeStrip({
    side: 'front',
    y: 0.71,
    zFrom: -0.74,
    zTo: 0.74,
    count: 22,
    h: 0.035,
    depth: 0.05,
    lift: 0.012,
    material: (i) => (i < 4 ? turnL.material : i >= 18 ? turnR.material : frontBar.material),
  });
  if (frontHits.length > 4) {
    const mid = frontHits[Math.floor(frontHits.length / 2)];
    addGlow(frontBar, white, mid.point, mid.normal, 2.4, 0.7);
    addGlow(turnL, amber, frontHits[1].point, frontHits[1].normal, 0.7, 0.45);
    addGlow(turnR, amber, frontHits[frontHits.length - 2].point, frontHits[frontHits.length - 2].normal, 0.7, 0.45);
  }

  // Recessed dark band with the main beams inside it.
  placeStrip({ side: 'front', y: 0.6, zFrom: -0.7, zTo: 0.7, count: 16, h: 0.1, depth: 0.04, lift: 0.006, material: () => trim });
  const headL = makeLamp(white, 3.5, 1);
  const headR = makeLamp(white, 3.5, 1);
  for (const [lamp, z] of [
    [headL, -0.5],
    [headR, 0.5],
  ] as const) {
    const hit = probe(probeMesh, new THREE.Vector3(5, 0.6, z), new THREE.Vector3(-1, 0, 0), ray);
    if (!hit) continue;
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.06, 0.05)), lamp.material);
    mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.018 - 0.025);
    mesh.lookAt(hit.point.clone().add(hit.normal));
    body.add(mesh);
    addGlow(lamp, white, hit.point, hit.normal, 1.0, 0.65);
  }

  // Lower intake / diffuser.
  placeStrip({ side: 'front', y: 0.42, zFrom: -0.6, zTo: 0.6, count: 12, h: 0.1, depth: 0.04, lift: 0.006, material: () => trim });
  placeStrip({ side: 'rear', y: 0.42, zFrom: -0.62, zTo: 0.62, count: 12, h: 0.1, depth: 0.04, lift: 0.006, material: () => trim });

  // Full-width rear bar on the liftgate: outer parts double as indicators, the centre carries the brake boost.
  const tail = makeLamp(red, 2.6, 0.8);
  const tailL = makeLamp(red, 2.6, 0.7);
  const tailR = makeLamp(red, 2.6, 0.7);
  const rearHits = placeStrip({
    side: 'rear',
    y: 0.93,
    zFrom: -0.74,
    zTo: 0.74,
    count: 22,
    h: 0.045,
    depth: 0.05,
    lift: 0.012,
    material: (i) => (i < 5 ? tailL.material : i >= 17 ? tailR.material : tail.material),
    parent: hatchPivot,
  });
  if (rearHits.length > 4) {
    const mid = rearHits[Math.floor(rearHits.length / 2)];
    addGlow(tail, red, mid.point, mid.normal, 2.6, 0.9, hatchPivot);
    addGlow(tailL, red, rearHits[1].point, rearHits[1].normal, 0.8, 0.5, hatchPivot);
    addGlow(tailR, red, rearHits[rearHits.length - 2].point, rearHits[rearHits.length - 2].normal, 0.8, 0.5, hatchPivot);
  }

  const reverse = makeLamp(white, 3, 0.7);
  for (const z of [-0.5, 0.5]) {
    const hit = probe(probeMesh, new THREE.Vector3(-5, 0.55, z), new THREE.Vector3(1, 0, 0), ray);
    if (!hit) continue;
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.045, 0.04)), reverse.material);
    mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.012 - 0.02);
    mesh.lookAt(hit.point.clone().add(hit.normal));
    body.add(mesh);
    addGlow(reverse, white, hit.point, hit.normal, 0.55, 0.4);
  }

  // Charge port on the rear left quarter.
  const port = makeLamp(0x40c0ff, 3, 0.6);
  {
    const hit = probe(probeMesh, new THREE.Vector3(-1.95, 0.9, -5), new THREE.Vector3(0, 0, 1), ray);
    if (hit) {
      const mesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20)), port.material);
      mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.004);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
      body.add(mesh);
      addGlow(port, 0x40c0ff, hit.point, hit.normal, 0.45, 0.45);
    }
  }

  // Mirrors on pivots so they can fold.
  const mirrorArm = track(new THREE.BoxGeometry(0.05, 0.03, 0.12));
  const mirrorHead = track(new THREE.BoxGeometry(0.11, 0.09, 0.2));
  const mirrorFace = track(new THREE.BoxGeometry(0.01, 0.075, 0.17));
  const mirrors: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hit = probe(probeMesh, new THREE.Vector3(0.9, 0.97, side * 5), new THREE.Vector3(0, 0, -side), ray);
    const pivot = new THREE.Group();
    pivot.position.copy(hit ? hit.point : new THREE.Vector3(0.9, 0.97, side * 0.9));
    const arm = new THREE.Mesh(mirrorArm, trim);
    arm.position.set(0, 0.04, side * 0.06);
    arm.rotation.x = side * 0.5;
    pivot.add(arm);
    const head = new THREE.Mesh(mirrorHead, paintSolid);
    head.position.set(-0.02, 0.08, side * 0.16);
    pivot.add(head);
    const face = new THREE.Mesh(mirrorFace, glass);
    face.position.set(-0.078, 0.08, side * 0.16);
    pivot.add(face);
    body.add(pivot);
    mirrors.push(pivot);
  }

  // Ground contact shadow.
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(5.6, 3.0)), track(new THREE.MeshBasicMaterial({ map: track(shadowTexture()), transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  spin.add(shadow);

  const frontLight = new THREE.PointLight(0xdfe9ff, 0, 4.5, 2);
  frontLight.position.set(2.9, 0.7, 0);
  body.add(frontLight);
  const rearLight = new THREE.PointLight(0xff3030, 0, 4.5, 2);
  rearLight.position.set(-2.9, 0.85, 0);
  body.add(rearLight);

  const setLamp = (lamp: Lamp, v: number) => {
    lamp.material.emissiveIntensity = lamp.maxEmissive * v;
    for (const g of lamp.glows) {
      g.material.opacity = lamp.maxGlow * v;
      g.visible = v > 0.02;
    }
  };

  const apply = (s: LampState) => {
    setLamp(frontBar, s.bar);
    setLamp(turnL, Math.max(s.turnL, s.bar * 0.15));
    setLamp(turnR, Math.max(s.turnR, s.bar * 0.15));
    setLamp(headL, s.headL);
    setLamp(headR, s.headR);
    const rear = Math.min(1, s.tail * 0.7 + s.brake);
    setLamp(tail, rear);
    setLamp(tailL, Math.min(1, Math.max(s.tail * 0.7, s.turnL)));
    setLamp(tailR, Math.min(1, Math.max(s.tail * 0.7, s.turnR)));
    setLamp(reverse, s.reverse);
    port.material.emissive.setHSL(s.portHue, 1, 0.55);
    for (const g of port.glows) g.material.color.setHSL(s.portHue, 1, 0.6);
    setLamp(port, s.port);
    frontLight.intensity = 14 * (s.bar * 0.6 + Math.max(s.headL, s.headR) * 0.6);
    rearLight.intensity = 12 * rear;
    mirrors[0].rotation.y = s.mirrorFold * 1.3;
    mirrors[1].rotation.y = -s.mirrorFold * 1.3;
    for (const pane of panes) pane.position.y = -s.windows * WINDOW_TRAVEL;
    hatchPivot.rotation.z = -s.trunk * HATCH_OPEN;
    body.position.y = s.bob;
  };

  return {
    spin,
    body,
    apply,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
