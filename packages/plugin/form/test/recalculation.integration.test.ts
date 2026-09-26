import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DocumentMeta } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { createFormScriptingController } from '../src/scripting/controller';
import { standaloneRealm } from './helpers/standalone-realm';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'snippet-react',
  'public',
  'interactive_pdf_forms_javascript_demo.pdf',
);

/**
 * A committed value runs the document's calculate scripts: on the demo form,
 * setting the guest count recalculates the total through the /CO chain.
 */
describe('recalculation', () => {
  it('committing a guest count recalculates the total', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open(
      { kind: 'bytes', id: 'recalculation', bytes: new Uint8Array(await readFile(fixturePath)) },
      { scope: ['*'] },
    );
    const pages = await doc.pages.list();
    const document = (): DocumentMeta => ({
      id: doc.id,
      instanceId: doc.id,
      name: 'demo.pdf',
      pageCount: pages.pageCount,
      pages: pages.pages,
      revision: 0,
      renderPolicy: { kind: 'continuous' },
    });
    const realm = standaloneRealm(doc, document, {
      now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
      utcOffsetMinutes: () => 0,
      sandboxFactory: () => createQuickJsSandbox(),
    });
    const controller = createFormScriptingController({
      doc,
      document,
      transaction: realm.transaction,
      budget: realm.budget,
    });
    const before = await doc.forms.list();
    const guests = before.fields.find((field) => field.name === 'guests')!;
    const result = await controller.commit(guests.ref, { type: 'text', value: '50' });
    expect(result.status).toBe('applied');
    expect(result.error ?? null).toBeNull();
    expect(result.diagnostics).toEqual([]);
    expect(result.effectsResult?.results.every((entry) => entry.status === 'applied')).toBe(true);
    const after = await doc.forms.list();
    const total = after.fields.find((field) => field.name === 'total_amount');
    expect(total?.valueEntry).toEqual({ kind: 'scalar', value: '$1700.00' });
    controller.dispose();
    realm.dispose();
    await doc.close();
    await engine.destroy();
  });
});
