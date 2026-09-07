import { useRef } from 'react';
import { AnimatedCar, type Pace } from './AnimatedCar';

const CARDS: { id: Pace; title: string; desc: string }[] = [
  { id: 'chill', title: 'Chill', desc: 'Soft fades and DRLs breathing with the music. Fewer flashes, easy on the eyes.' },
  { id: 'standard', title: 'Standard', desc: 'Beats, hits and a few strobes on the drops — the balanced, do-anything setting.' },
  { id: 'max', title: 'Max', desc: 'Headlights alternate, everything strobes on every hit — full send for the big moments.' },
];

export function StyleShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: number) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="showcase">
      <div className="showcase-head">
        <h2>Three ways to move</h2>
        <div className="showcase-nav">
          <button className="btn" onClick={() => scrollBy(-1)} aria-label="Previous style">
            ‹
          </button>
          <button className="btn" onClick={() => scrollBy(1)} aria-label="Next style">
            ›
          </button>
        </div>
      </div>
      <div className="showcase-track" ref={trackRef}>
        {CARDS.map((c) => (
          <div className="showcase-card" key={c.id}>
            <AnimatedCar pace={c.id} className="showcase-car" />
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </div>
        ))}
      </div>
      <p className="hint showcase-hint">Swipe or use the arrows — these are canned animations, not a real song.</p>
    </section>
  );
}
