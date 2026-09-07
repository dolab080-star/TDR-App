import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
