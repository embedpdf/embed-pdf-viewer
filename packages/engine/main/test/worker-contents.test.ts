/**
 * What the built engine files hold. `embedpdf-worker.js` and `inline-transport.js` are each one
 * self-contained file, which can't load a part of itself later: a module one of them only
 * imports lazily is in the file all the same, and every visitor downloads it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { standardFontProgram } from '@embedpdf/core-fonts';
import { STANDARD_FONTS } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The most a file may take as a visitor downloads it, gzipped. When a file outgrows it, look for
 * what came in with the change (esbuild's metafile lists every module's share), and raise the
 * limit only for code the engine runs.
 */
const GZIP_LIMIT_BYTES = 275_000;

describe.each(['embedpdf-worker.js', 'inline-transport.js'])('workers/%s', (file) => {
  const code = readFileSync(resolve(root, 'workers', file), 'utf8');

  it('holds no standard font’s file: PDFium draws with its own copies', async () => {
    const held: string[] = [];
    for (const font of STANDARD_FONTS) {
      const bytes = await standardFontProgram(font).load();
      if (code.includes(Buffer.from(bytes).toString('base64'))) held.push(font);
    }
    expect(held).toEqual([]);
  });

  it(`takes at most ${GZIP_LIMIT_BYTES} bytes gzipped`, () => {
    expect(gzipSync(code, { level: 9 }).byteLength).toBeLessThanOrEqual(GZIP_LIMIT_BYTES);
  });
});
