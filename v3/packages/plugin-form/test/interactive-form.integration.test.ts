import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createQuickJsSandbox } from '@embedpdf-x/js-sandbox';
import { createLocalEngine } from '../../../../packages/engine/src';
import type { DocumentHandle, FormFieldDTO, PdfActionTree } from '@embedpdf/engine-core/runtime';

import { createFormScriptingController } from '../src/scripting';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'interactive_pdf_forms_javascript_demo.pdf',
);

async function activationFor(doc: DocumentHandle, field: FormFieldDTO): Promise<PdfActionTree> {
  const widget = field.widgets[0];
  if (!widget || widget.annotObjectNumber <= 0 || widget.pageObjectNumber <= 0) {
    throw new Error(`field '${field.name}' has no addressable widget`);
  }
  const { annotations } = await doc.page(widget.pageObjectNumber).annotations.list();
  const annotation = annotations.find(
    ({ ref }) => ref.kind === 'objectNumber' && ref.annotObjectNumber === widget.annotObjectNumber,
  );
  const action = annotation?.actions?.activate;
  if (!action) throw new Error(`field '${field.name}' has no activation action`);
  return action;
}

describe('interactive form JavaScript acceptance', () => {
  it('executes the demo PDF summary and print buttons through the form transaction', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open(
      {
        kind: 'bytes',
        id: 'interactive-form-javascript',
        bytes: new Uint8Array(await readFile(fixturePath)),
      },
      { scope: ['*'] },
    );
    const pages = await doc.pages.list();
    const controller = createFormScriptingController({
      doc,
      document: () => ({
        id: doc.id,
        name: 'interactive_pdf_forms_javascript_demo.pdf',
        pageCount: pages.pageCount,
        pages: pages.pages,
        revision: 0,
      }),
      config: {
        enabled: true,
        now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: () => 180,
        randomSeed: () => 7,
      },
      sandboxFactory: createQuickJsSandbox,
    });

    try {
      const initial = await doc.forms.list();
      const summaryButton = initial.fields.find(({ name }) => name === 'btn_summary');
      if (!summaryButton) throw new Error('summary button is missing');

      const summaryResult = await controller.activate(
        initial,
        summaryButton.ref,
        await activationFor(doc, summaryButton),
      );

      console.log(JSON.stringify(summaryResult, null, 2));

      expect(summaryResult.status).toBe('applied');
      expect(summaryResult.uiEffects).toContainEqual({ kind: 'gotoPage', page: 1 });
      const afterSummary = await doc.forms.list();
      const summary = afterSummary.fields.find(({ name }) => name === 'summary');
      expect(summary?.valueEntry).toMatchObject({ kind: 'scalar' });
      expect(summary?.valueEntry.kind === 'scalar' ? summary.valueEntry.value : '').toContain(
        'EVENT BRIEF',
      );

      const printButton = afterSummary.fields.find(({ name }) => name === 'btn_print');
      if (!printButton) throw new Error('print button is missing');
      const printResult = await controller.activate(
        afterSummary,
        printButton.ref,
        await activationFor(doc, printButton),
      );

      expect(printResult).toMatchObject({
        status: 'unchanged',
        effectsResult: null,
        uiEffects: [{ kind: 'print' }],
      });
    } finally {
      controller.dispose();
      await doc.close();
      await engine.destroy();
    }
  });
});
