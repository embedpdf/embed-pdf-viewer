import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { createFormScriptingController } from '../src/scripting';

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

describe('recalc probe', () => {
  it('commit guests=50 triggers recalc', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open(
      { kind: 'bytes', id: 'probe', bytes: new Uint8Array(await readFile(fixturePath)) },
      { scope: ['*'] },
    );
    const pages = await doc.pages.list();
    const controller = createFormScriptingController({
      doc,
      document: () => ({
        id: doc.id,
        name: 'demo.pdf',
        pageCount: pages.pageCount,
        pages: pages.pages,
        revision: 0,
      }),
      config: {
        enabled: true,
        now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: () => 0,
      },
      sandboxFactory: () => createQuickJsSandbox(),
    });
    const snap = await doc.forms.list();
    const guests = snap.fields.find((f) => f.name === 'guests')!;
    console.log(
      'GUESTS ref:',
      JSON.stringify(guests.ref),
      'actions:',
      Object.keys(guests.actions ?? {}),
    );
    const result = await controller.commit(snap, guests.ref, { type: 'text', value: '50' });
    console.log('STATUS:', result.status);
    console.log(
      'EFFECTS RESULT:',
      result.effectsResult
        ? JSON.stringify(result.effectsResult.results.map((r: any) => ({ s: r.status })))
        : null,
    );
    console.log('DIAGNOSTICS:', JSON.stringify(result.diagnostics));
    console.log('ERROR:', JSON.stringify(result.error ?? null));
    const after = await doc.forms.list();
    const total = after.fields.find((f) => f.name === 'total_amount');
    console.log('total_amount value entry:', JSON.stringify(total?.valueEntry ?? total?.value));
    controller.dispose();
    await doc.close();
    await engine.destroy();
    expect(true).toBe(true);
  });
});
