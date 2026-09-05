import { useEffect, useRef } from 'react';
import type { AnalysisResult } from '../lib/audio/analyze';
import type { ShowEvent } from '../lib/show/types';

interface Props {
  analysis: AnalysisResult;
  events: ShowEvent[];
  getTime: () => number;
  onSeek: (t: number) => void;
}

const TIER_COLOR: Record<string, string> = {
  low: 'rgba(90,169,255,0.16)',
  mid: 'rgba(255,176,32,0.16)',
  high: 'rgba(232,33,39,0.22)',
};

export function Timeline({ analysis, events, getTime, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;

    const drawStatic = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const g = off.getContext('2d')!;
      g.scale(dpr, dpr);
      const dur = analysis.duration;
      const x = (t: number) => (t / dur) * width;
      // sections
      for (const s of analysis.sections) {
        g.fillStyle = TIER_COLOR[s.tier];
        g.fillRect(x(s.startTime), 0, x(s.endTime) - x(s.startTime), height);
        if (s.build) {
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x(s.endTime) - Math.min(40, x(s.endTime) - x(s.startTime)), 0, Math.min(40, x(s.endTime) - x(s.startTime)), height);
        }
      }
      // loudness
      g.beginPath();
      g.moveTo(0, height);
      const n = analysis.loudness.length;
      for (let i = 0; i < width; i++) {
        const idx = Math.min(n - 1, Math.floor((i / width) * n));
        const v = analysis.loudness[idx];
        g.lineTo(i, height - 6 - v * (height - 22));
      }
      g.lineTo(width, height);
      g.closePath();
      g.fillStyle = 'rgba(233,236,243,0.28)';
      g.fill();
      // bars
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      for (const b of analysis.bars) {
        const px = Math.round(x(b)) + 0.5;
        g.beginPath();
        g.moveTo(px, height - 10);
        g.lineTo(px, height);
        g.stroke();
      }
      // events
      g.font = '10px system-ui, sans-serif';
      for (const e of events) {
        const px = Math.round(x(e.time)) + 0.5;
        g.strokeStyle = e.kind === 'drop' ? '#ff5a5f' : e.kind === 'build' ? '#ffb020' : e.kind === 'ending' ? '#e9ecf3' : '#5aa9ff';
        g.beginPath();
        g.moveTo(px, 0);
        g.lineTo(px, height - 12);
        g.stroke();
        if (e.kind !== 'closure') {
          g.fillStyle = g.strokeStyle;
          g.fillText(e.label, Math.min(width - 40, px + 3), 11);
        }
      }
      staticRef.current = off;
    };

    drawStatic();
    const ro = new ResizeObserver(() => drawStatic());
    ro.observe(canvas);

    let raf = 0;
    const ctx = canvas.getContext('2d')!;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const bg = staticRef.current;
      if (!bg) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      ctx.scale(dpr, dpr);
      const px = (getTime() / analysis.duration) * width;
      ctx.fillStyle = '#e9ecf3';
      ctx.fillRect(px - 1, 0, 2, height);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analysis, events, getTime]);

  const seekFromEvent = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(frac * analysis.duration);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="timeline"
        onPointerDown={(e) => {
          seekFromEvent(e.clientX);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromEvent(e.clientX);
        }}
        aria-label="Song timeline, click to seek"
      />
      <div className="tl-legend">
        <span>
          <i style={{ background: 'rgba(90,169,255,0.6)' }} />
          quiet
        </span>
        <span>
          <i style={{ background: 'rgba(255,176,32,0.6)' }} />
          groove
        </span>
        <span>
          <i style={{ background: 'rgba(232,33,39,0.7)' }} />
          loud
        </span>
        <span>
          <i style={{ background: '#ff5a5f' }} />
          drop
        </span>
        <span>
          <i style={{ background: '#5aa9ff' }} />
          closure move
        </span>
      </div>
    </div>
  );
}
