import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPieceInfoConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { EngineErrorCode, type PieceInfoPatch } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'pdf-runtime-demo',
  'public',
  'sample.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runPieceInfoConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'sample-pdf-pieceinfo',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: { trapped: 'unknown' },
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});

describe('pieceInfo update preflight: engine-local', () => {
  test('rejects the whole patch before the first write when any value is invalid', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const bytes = new Uint8Array(await readFile(fixturePath));
    const doc = await engine.open({ kind: 'bytes', id: 'pieceinfo-preflight', bytes });
    const application = 'EMBD_PreflightTest';
    try {
      await doc.pieceInfo!.update(application, { seed: 'before' });

      const invalidPatches: PieceInfoPatch[] = [
        { candidate: 'must-not-land', invalid: Number.POSITIVE_INFINITY },
        { candidate: 'must-not-land', invalid: { name: '' } },
        { candidate: 'must-not-land', invalid: ['valid', 42] } as unknown as PieceInfoPatch,
        {
          candidate: 'must-not-land',
          invalid: { unsupported: true },
        } as unknown as PieceInfoPatch,
        { candidate: 'must-not-land', '': 'invalid-key' },
      ];

      for (const patch of invalidPatches) {
        await expect(doc.pieceInfo!.update(application, patch)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        expect((await doc.pieceInfo!.read(application))!.entries).toEqual({
          seed: { type: 'string', value: 'before' },
        });
      }
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
