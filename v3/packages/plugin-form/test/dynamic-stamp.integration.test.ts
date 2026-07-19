import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createQuickJsSandbox } from '@embedpdf-x/js-sandbox';
import { createLocalEngine } from '../../../../packages/engine/src';
import { createFormScriptingController } from '../src/scripting';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures', 'EmbedPDF_Dynamic_Approval_Stamp.pdf');

describe('plugin-form dynamic-stamp acceptance', () => {
  it('routes extracted /C actions through one canonical effects transaction', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open(
      {
        kind: 'bytes',
        id: 'plugin-form-dynamic-stamp',
        bytes: new Uint8Array(await readFile(fixturePath)),
      },
      { scope: ['*'] },
    );
    const pages = await doc.pages.list();
    const controller = createFormScriptingController({
      doc,
      document: () => ({
        id: doc.id,
        name: 'proposal.pdf',
        pageCount: pages.pageCount,
        pages: pages.pages,
        revision: 0,
      }),
      config: {
        enabled: true,
        identity: {
          name: 'Alex Morgan',
          loginName: 'alex',
          corporation: 'EmbedPDF',
          email: 'alex@example.com',
        },
        now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: () => 180,
        randomSeed: () => 7,
      },
      sandboxFactory: createQuickJsSandbox,
    });

    try {
      const snapshot = await doc.forms.list();
      const result = await controller.recalculate(snapshot);

      expect(result.status).toBe('applied');
      expect(result.effectsResult?.results.map(({ status }) => status)).toEqual([
        'applied',
        'applied',
        'applied',
        'applied',
      ]);
      const reread = await doc.forms.list();
      expect(
        Object.fromEntries(reread.fields.map((field) => [field.name, field.valueEntry])),
      ).toEqual({
        approvedBy: { kind: 'scalar', value: 'Alex Morgan' },
        company: { kind: 'scalar', value: 'EmbedPDF' },
        stampDate: { kind: 'scalar', value: 'Jul 15, 2026' },
        documentName: { kind: 'scalar', value: 'proposal.pdf' },
      });
    } finally {
      controller.dispose();
      await doc.close();
      await engine.destroy();
    }
  });
});
