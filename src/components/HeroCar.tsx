import { lazy, Suspense, useCallback, useState } from 'react';
import { AnimatedCar } from './AnimatedCar';
import { PhotoCar } from './PhotoCar';
import type { Pace } from '../lib/car3d/choreo';

const Car3D = lazy(() => import('./Car3D'));

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Props {
  pace: Pace;
  mode: 'photo' | '3d';
}

export function HeroCar({ pace, mode }: Props) {
  const [webgl, setWebgl] = useState(hasWebGL);
  const onUnavailable = useCallback(() => setWebgl(false), []);
  if (mode === 'photo') return <PhotoCar pace={pace} />;
  const fallback = <AnimatedCar pace={pace} className="hero-car" label="A red Tesla Model Y with its lights dancing" />;
  if (!webgl) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Car3D pace={pace} onUnavailable={onUnavailable} label="A generic red 2026 Model Y in 3D with its light bars, headlights and mirrors dancing. Drag to spin it." />
    </Suspense>
  );
}
