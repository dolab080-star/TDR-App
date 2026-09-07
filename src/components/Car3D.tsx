import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar } from '../lib/car3d/model';
import { choreograph, STATIC_STATE, type Pace } from '../lib/car3d/choreo';

interface Props {
  pace: Pace;
  label?: string;
  /** Called if the WebGL renderer cannot be created, so the caller can fall back. */
  onUnavailable?: () => void;
}

const AUTO_SPIN = 0.22;
const START_YAW = -0.75;

export default function Car3D({ pace, label, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paceRef = useRef(pace);
  const [failed, setFailed] = useState(false);
  paceRef.current = pace;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      onUnavailable?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    const target = new THREE.Vector3(0, 0.62, 0);
    const setCamera = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      const portrait = h > w;
      const radius = portrait ? 9.4 : 8.0;
      const elev = portrait ? 0.4 : 0.32;
      camera.position.set(Math.cos(elev) * radius, Math.sin(elev) * radius + 0.3, 0);
      camera.lookAt(target);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1);
    rim.position.set(-5, 4, -4);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x0b0d12, 0.7));

    const groundTex = (() => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(canvas);
    })();
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({ color: 0x151923, roughness: 0.92, metalness: 0, transparent: true, alphaMap: groundTex, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const car = buildCar();
    car.spin.rotation.y = START_YAW;
    scene.add(car.spin);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Drag to spin; auto-rotation resumes a moment after release.
    let dragging = false;
    let lastX = 0;
    let velocity = 0;
    let idleSince = 0;
    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      velocity = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const d = dx * 0.008;
      car.spin.rotation.y += d;
      velocity = d;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      idleSince = performance.now();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    let visible = true;
    let pageVisible = !document.hidden;
    let last = performance.now();
    let clock = 0;
    let running = false;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduceMotion) {
        clock += dt;
        car.apply(choreograph(paceRef.current, clock));
        if (!dragging) {
          if (Math.abs(velocity) > 0.0005) {
            car.spin.rotation.y += velocity;
            velocity *= 0.92;
          } else if (now - idleSince > 1800) {
            car.spin.rotation.y += AUTO_SPIN * dt;
          }
        }
      } else if (!dragging && Math.abs(velocity) > 0.0005) {
        car.spin.rotation.y += velocity;
        velocity *= 0.92;
      }
      renderer.render(scene, camera);
    };

    const sync = () => {
      const should = visible && pageVisible;
      if (should && !running) {
        running = true;
        last = performance.now();
        renderer.setAnimationLoop(frame);
      } else if (!should && running) {
        running = false;
        renderer.setAnimationLoop(null);
      }
    };

    if (reduceMotion) car.apply(STATIC_STATE);
    setCamera();
    renderer.render(scene, camera);

    const ro = new ResizeObserver(() => {
      setCamera();
      if (!running) renderer.render(scene, camera);
    });
    ro.observe(host);
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.05 },
    );
    io.observe(host);
    const onVisibility = () => {
      pageVisible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    sync();

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      car.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      groundTex.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [onUnavailable]);

  if (failed) return null;
  return <div ref={hostRef} className="car3d" role="img" aria-label={label ?? `3D Tesla with lights dancing at ${pace} intensity. Drag to spin.`} />;
}
