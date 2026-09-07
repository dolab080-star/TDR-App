import { lazy, Suspense, useCallback, useState } from 'react';
import { AnimatedCar } from './AnimatedCar';

const Car3D = lazy(() => import('./Car3D'));

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function HeroCar() {
  const [webgl, setWebgl] = useState(hasWebGL);
  const onUnavailable = useCallback(() => setWebgl(false), []);
  const fallback = <AnimatedCar pace="standard" className="hero-car" label="A red Tesla Model Y with its lights dancing" />;
  if (!webgl) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Car3D onUnavailable={onUnavailable} />
    </Suspense>
  );
}
