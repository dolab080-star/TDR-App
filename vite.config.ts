import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        pricing: resolve(root, 'pricing.html'),
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
