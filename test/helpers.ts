import type { AnalysisResult, Beat } from '../src/lib/audio/analyze';
import type { Section, SectionTier } from '../src/lib/audio/sections';

/** Build a synthetic analysis with a steady beat grid and given section tiers. */
export function makeAnalysis(durationS: number, bpm: number, tiers: SectionTier[] = ['low', 'mid', 'high', 'mid']): AnalysisResult {
  const period = 60 / bpm;
  const beats: Beat[] = [];
  let i = 0;
  for (let t = 0.1; t < durationS - 0.05; t += period, i++) {
    beats.push({ time: t, strength: 0.8, index: i, bar: Math.floor(i / 4), beatInBar: i % 4, inferred: false });
  }
  const bars = beats.filter((b) => b.beatInBar === 0).map((b) => b.time);
  const fps = 50;
  const frames = Math.ceil(durationS * fps);
  const loudness = new Float32Array(frames).fill(0.8);
  const lowEnergy = new Float32Array(frames).fill(0.6);
  const highEnergy = new Float32Array(frames).fill(0.5);
  const totalBars = bars.length;
  const sections: Section[] = [];
  const perSection = Math.max(1, Math.floor(totalBars / tiers.length));
  tiers.forEach((tier, s) => {
    const startBar = s * perSection;
    const endBar = s === tiers.length - 1 ? totalBars : (s + 1) * perSection;
    sections.push({
      index: s,
      startTime: s === 0 ? 0 : bars[startBar],
      endTime: s === tiers.length - 1 ? durationS : bars[endBar],
      startBar,
      endBar,
      tier,
      energy: tier === 'high' ? 1 : tier === 'mid' ? 0.6 : 0.2,
      build: tier !== 'high' && tiers[s + 1] === 'high',
    });
  });
  const onsets = {
    low: beats.filter((b) => b.beatInBar % 2 === 0).map((b) => ({ time: b.time, strength: 0.9 })),
    mid: beats.filter((b) => b.beatInBar % 2 === 1).map((b) => ({ time: b.time, strength: 0.8 })),
    high: beats.flatMap((b) => [
      { time: b.time, strength: 0.6 },
      { time: b.time + period / 2, strength: 0.7 },
    ]),
  };
  return {
    duration: durationS,
    sampleRate: 44100,
    bpm,
    beatPeriod: period,
    tempoConfidence: 0.9,
    beats,
    bars,
    onsets,
    fps,
    loudness,
    lowEnergy,
    highEnergy,
    sections,
    firstSound: 0,
    lastSound: durationS,
  };
}
