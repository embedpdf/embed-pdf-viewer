import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, 'fixtures/pure-reexport');
const distDir = path.join(fixtureDir, 'dist');

describe('defineLibrary() — pure re-export base entry (regression for #27)', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['run', 'build'], {
      cwd: fixtureDir,
      stdio: 'inherit',
      env: { ...process.env, NPM_TOKEN: process.env.NPM_TOKEN ?? '' },
    });
  });

  it('emits dist/index.d.ts for a pure `export *` entry', () => {
    const dts = path.join(distDir, 'index.d.ts');
    expect(existsSync(dts)).toBe(true);
    expect(statSync(dts).size).toBeGreaterThan(0);
  });

  it('emits dist/index.js and dist/index.cjs', () => {
    expect(existsSync(path.join(distDir, 'index.js'))).toBe(true);
    expect(existsSync(path.join(distDir, 'index.cjs'))).toBe(true);
  });
});
