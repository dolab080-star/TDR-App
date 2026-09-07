import { useRef, useState } from 'react';
import { OptionsGallery } from './OptionsGallery';
import { DemoShowcase } from './DemoShowcase';
import { InstallPanel } from './InstallPanel';
import { QandA } from './QandA';
import { LicenseKeyForm } from './LicenseKeyForm';
import { PRICE_DISPLAY } from '../lib/price';
import { checkoutUrl, isGumroadConfigured, type ActivationResult } from '../lib/gumroad';
import type { InstallState } from '../hooks/useInstallPrompt';

interface Props {
  install: InstallState;
  onActivate: (key: string) => Promise<ActivationResult>;
}

type Sub = 'install' | 'qa' | 'key';

const STEPS = [
  { title: 'Upload your song', desc: 'Drop in any MP3 or WAV.' },
  { title: 'Pick your dance moves', desc: 'Choose from the provided dance moves, or customize every light and moving part to your liking.' },
  { title: 'Plug in and dance', desc: 'Download onto your USB stick, plug it into your car and dance away.' },
];

const SUBS: { id: Sub; icon: string; label: string; short: string }[] = [
  { id: 'key', icon: '🔑', label: 'Already bought? Enter license key', short: 'License key' },
  { id: 'qa', icon: '❓', label: 'Q&A', short: 'Q&A' },
  { id: 'install', icon: '📲', label: 'Installing the app', short: 'Install app' },
];

export function Home({ install, onActivate }: Props) {
  const [open, setOpen] = useState<Sub | null>(null);
  /** Q&A and Installing take over the page; the license key form is a single line and stays inline. */
  const fullPage = open === 'qa' || open === 'install';
  const stepsRef = useRef<HTMLDivElement>(null);
  const swipeSteps = (dir: 1 | -1) => {
    const track = stepsRef.current;
    if (track) track.scrollBy({ left: dir * Math.max(240, track.clientWidth * 0.8), behavior: 'smooth' });
  };
  const configured = isGumroadConfigured();

  return (
    <div className="home">
      <nav className="sub-actions sub-header" aria-label="Quick links">
        {SUBS.map((s) => (
          <button key={s.id} className={`btn${open === s.id ? ' on' : ''}`} aria-expanded={open === s.id} aria-label={s.label} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="emoji" aria-hidden="true">
              {s.icon}
            </span>
            <span className="label-full">{s.label}</span>
            <span className="label-short">{s.short}</span>
          </button>
        ))}
      </nav>
      {open === 'key' && (
        <div className="sub-panel">
          <LicenseKeyForm onActivate={onActivate} onClose={() => setOpen(null)} />
        </div>
      )}
      {open === 'install' && (
        <div className="sub-panel">
          <InstallPanel install={install} onClose={() => setOpen(null)} />
        </div>
      )}
      {open === 'qa' && (
        <div className="sub-panel sub-stack">
          <QandA />
          <button className="btn ghost" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}

      <section className="panel steps-section" hidden={fullPage} aria-label="Steps">
        <div className="peek-head">
          <h2>Steps</h2>
          <div className="peek-nav">
            <button className="btn" onClick={() => swipeSteps(-1)} aria-label="Previous step">
              ‹
            </button>
            <button className="btn" onClick={() => swipeSteps(1)} aria-label="Next step">
              ›
            </button>
          </div>
        </div>
        <div className="steps-track" ref={stepsRef}>
          {STEPS.map((step, i) => (
            <div className="step" key={step.title}>
              <b>
                {i + 1}. {step.title}
              </b>
              <span>{step.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <DemoShowcase hidden={fullPage} />

      {!fullPage && <OptionsGallery />}

      <section className="buy-section" id="pricing" hidden={fullPage}>
        {configured ? (
          <a className="btn primary big stacked" href={checkoutUrl()} target="_blank" rel="noopener noreferrer">
            <span>Buy now — {PRICE_DISPLAY}</span>
            <small>One-time payment · no subscription</small>
          </a>
        ) : (
          <button className="btn primary big stacked" disabled>
            <span>Buy now — {PRICE_DISPLAY}</span>
            <small>Payments aren't set up yet — check back soon</small>
          </button>
        )}
        <p className="hint">
          Secure checkout by Gumroad. Your license key arrives by email right away — paste it under <b>Already bought?</b> to unlock. All sales are
          final.
        </p>
      </section>
    </div>
  );
}
