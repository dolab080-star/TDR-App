import { useRef } from 'react';

/**
 * Pictures of the tool's own option panels (captured from the real UI with
 * every moving part expanded), shown as a swipeable strip so visitors can
 * see what they'll control without a live form on the sales page.
 */
const PICTURES = [
  { src: '/peek/style.png', title: 'Show style', desc: 'Chill, Balanced or Energetic, plus an intensity dial.' },
  { src: '/peek/charge-port.png', title: 'Charge port', desc: 'When it opens and closes, rainbow LED while open.' },
  { src: '/peek/mirrors.png', title: 'Mirrors', desc: 'Fold on drops, how long they stay folded, how many times.' },
  { src: '/peek/windows.png', title: 'Windows', desc: 'Which windows dance, when, and for how long.' },
  { src: '/peek/liftgate.png', title: 'Liftgate', desc: 'Open, dance and close on your cue.' },
];

export function OptionsGallery() {
  const trackRef = useRef<HTMLDivElement>(null);
  const step = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * Math.max(240, track.clientWidth * 0.8), behavior: 'smooth' });
  };
  return (
    <section className="panel peek" aria-label="Customization">
      <div className="peek-head">
        <h2>Customization</h2>
        <div className="peek-nav">
          <button className="btn" onClick={() => step(-1)} aria-label="Previous">
            ‹
          </button>
          <button className="btn" onClick={() => step(1)} aria-label="Next">
            ›
          </button>
        </div>
      </div>
      <div className="peek-track" ref={trackRef}>
        {PICTURES.map((p) => (
          <figure className="peek-card" key={p.src}>
            <img src={p.src} alt={`The ${p.title} options in the tool`} decoding="async" draggable={false} />
            <figcaption>
              <b>{p.title}</b>
              <span>{p.desc}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="hint peek-hint">Swipe through — every one of these is yours after checkout.</p>
    </section>
  );
}
