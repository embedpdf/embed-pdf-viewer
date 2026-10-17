import { certificatePath, fixturePath, reportPath } from './paths';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from 'vitest';
import { createLocalEngine } from '../../../../../dist/index.js';
import { validateSignatures } from '../../../../../../../core/signature/src/index.ts';
for (const runtime of ['wasm', 'native'] as const) {
  test(`reference-writer unchanged page rewrite: ${runtime}`, async () => {
    const path = fixturePath('supplemental/approval-inline-rewrite-reference-writer.pdf');
    const engine = createLocalEngine({ runtime: { prefer: runtime } });
    try {
      const doc = await engine.open(
        runtime === 'native'
          ? { kind: 'layerFile', id: 'rewrite', basePath: path }
          : { kind: 'bytes', id: 'rewrite', bytes: new Uint8Array(await readFile(path)) },
        { scope: ['*'] },
      );
      const certificate = new Uint8Array(await readFile(certificatePath));
      const results = await validateSignatures(doc, {
        trust: { anchors: async () => [certificate] },
      });
      expect(results[0].integrity).toBe('valid');
      expect(results[0].cryptography).toBe('valid');
      expect(results[0].modifications.verdict).toBe('unchanged');
      await writeFile(
        reportPath(`supplemental/reference-writer-engine-${runtime}.json`),
        JSON.stringify(results, null, 2),
      );
    } finally {
      await engine.destroy();
    }
  });
}
