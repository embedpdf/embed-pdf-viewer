import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validatePackageExports } from '../src/vite/validate-package-exports';

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(path.join(tmpdir(), 'embedpdf-validator-'));
  mkdirSync(path.join(tempDir, 'dist'), { recursive: true });
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

const writePkg = (pkg: object) => {
  writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));
};

const writeDistFile = (relative: string, content = '// content') => {
  const abs = path.join(tempDir, 'dist', relative);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};

const runCloseBundle = async (outputPrefix?: string) => {
  const plugin = validatePackageExports({ outputPrefix });
  const handler = (plugin.closeBundle as { handler: () => unknown }).handler;
  await handler.call(plugin);
};

describe('validatePackageExports', () => {
  it('passes when every advertised types/main/module file exists', async () => {
    writePkg({
      types: './dist/index.d.ts',
      main: './dist/index.cjs',
      module: './dist/index.js',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    });
    writeDistFile('index.d.ts');
    writeDistFile('index.js');
    writeDistFile('index.cjs');

    await expect(runCloseBundle()).resolves.toBeUndefined();
  });

  it('throws when an advertised types target is missing', async () => {
    writePkg({ types: './dist/index.d.ts' });

    await expect(runCloseBundle()).rejects.toThrow(/dist\/index\.d\.ts/);
  });

  it('throws when an advertised types target is empty', async () => {
    writePkg({ types: './dist/index.d.ts' });
    writeDistFile('index.d.ts', '');

    await expect(runCloseBundle()).rejects.toThrow(/dist\/index\.d\.ts/);
  });

  it('only checks files under the active prefix in framework modes', async () => {
    writePkg({
      exports: {
        '.': { types: './dist/index.d.ts' },
        './angular': { types: './dist/angular/index.d.ts' },
      },
    });
    writeDistFile('angular/index.d.ts');

    await expect(runCloseBundle('angular')).resolves.toBeUndefined();
  });

  it('skips files under known framework prefixes when validating base mode', async () => {
    writePkg({
      types: './dist/index.d.ts',
      exports: {
        './angular': { types: './dist/angular/index.d.ts' },
      },
    });
    writeDistFile('index.d.ts');

    await expect(runCloseBundle()).resolves.toBeUndefined();
  });

  it('ignores entries that do not target dist/', async () => {
    writePkg({
      exports: { './scripts/post-build': './src/scripts/post-build.js' },
    });

    await expect(runCloseBundle()).resolves.toBeUndefined();
  });
});
