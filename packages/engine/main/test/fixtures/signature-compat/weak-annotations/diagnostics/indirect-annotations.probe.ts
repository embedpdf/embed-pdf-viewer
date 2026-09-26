import { certificatePath, fixturePath, reportPath } from './paths';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from 'vitest';
import { createLocalEngine } from '../../../../../dist/index.js';
import { validateSignatures } from '../../../../../../../core/signature/src/index.ts';
for (const action of ['control', 'rewrite-reference-writer'] as const) {
  for (const runtime of ['wasm', 'native'] as const) {
    test(`indirect annotations ${action}: ${runtime}`, async () => {
      const path = fixturePath(`supplemental/approval-indirect-annotations-${action}.pdf`);
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
          reportPath(`supplemental/indirect-annotations-${action}-${runtime}.json`),
          JSON.stringify(results, null, 2),
        );
      } finally {
        await engine.destroy();
      }
    });
  }
}
