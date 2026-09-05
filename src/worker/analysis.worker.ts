/// <reference lib="webworker" />
import { analyze, type AnalysisResult } from '../lib/audio/analyze';

export interface AnalyzeRequest {
  type: 'analyze';
  mono: Float32Array;
  sampleRate: number;
}

export type WorkerMessage =
  | { type: 'progress'; stage: string; fraction: number }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const msg = e.data;
  if (msg.type !== 'analyze') return;
  try {
    let lastPost = 0;
    const result = analyze(msg.mono, msg.sampleRate, (stage, fraction) => {
      const now = Date.now();
      if (fraction >= 1 || now - lastPost > 80) {
        lastPost = now;
        ctx.postMessage({ type: 'progress', stage, fraction } satisfies WorkerMessage);
      }
    });
    const transfer = [result.loudness.buffer, result.lowEnergy.buffer, result.highEnergy.buffer];
    ctx.postMessage({ type: 'result', result } satisfies WorkerMessage, transfer);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message ?? String(err) } satisfies WorkerMessage);
  }
};
