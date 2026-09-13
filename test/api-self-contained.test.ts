import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Vercel compiles api/*.ts to ES modules and, because package.json has
 * "type": "module", a runtime import of '../src/lib/x' (no extension) fails
 * with ERR_MODULE_NOT_FOUND and the whole function refuses to load. The
 * license check therefore only imports Node built-ins at runtime; project
 * modules may be referenced as `import type` only (erased at compile time).
 */
describe('api/verify-license.ts stays self-contained', () => {
  const source = readFileSync(new URL('../api/verify-license.ts', import.meta.url), 'utf8');
  const runtimeImports = [...source.matchAll(/^import\s+(?!type\s)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

  it('has at least one runtime import (the regex is looking at the right thing)', () => {
    expect(runtimeImports.length).toBeGreaterThan(0);
  });

  it('imports only node: built-ins at runtime', () => {
    for (const spec of runtimeImports) expect(spec, `runtime import of ${spec}`).toMatch(/^node:/);
  });

  it('has no require() calls', () => {
    expect(source).not.toMatch(/\brequire\(/);
  });
});
