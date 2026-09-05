import { useCallback, useEffect, useRef } from 'react';
import type { AnalysisResult } from '../lib/audio/analyze';
import type { WorkerMessage } from '../worker/analysis.worker';

export interface AnalysisProgress {
  stage: string;
  fraction: number;
}

/**
 * Runs the analysis pipeline in a Web Worker so the UI stays responsive.
 * Falls back to running on the main thread if workers are unavailable.
 */
export function useAnalysisWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((mono: Float32Array, sampleRate: number, onProgress: (p: AnalysisProgress) => void): Promise<AnalysisResult> => {
    workerRef.current?.terminate();
    let worker: Worker;
    try {
      worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return import('../lib/audio/analyze').then((m) => m.analyze(mono, sampleRate, (stage, fraction) => onProgress({ stage, fraction })));
    }
    workerRef.current = worker;
    return new Promise<AnalysisResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') onProgress({ stage: msg.stage, fraction: msg.fraction });
        else if (msg.type === 'result') {
          resolve(msg.result);
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        }
      };
      worker.onerror = (ev) => {
        reject(new Error(ev.message || 'Analysis worker failed'));
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };
      const copy = new Float32Array(mono); // keep the caller's buffer intact
      worker.postMessage({ type: 'analyze', mono: copy, sampleRate }, [copy.buffer]);
    });
  }, []);

  return run;
}
