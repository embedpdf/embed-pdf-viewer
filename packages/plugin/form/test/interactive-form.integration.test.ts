import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type {
  DocumentHandle,
  FormFieldDTO,
  FormSnapshot,
  PdfActionTree,
} from '@embedpdf/engine-core/runtime';

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

function expectAdobeResetState(snapshot: FormSnapshot): void {
  expect(snapshot.fields.find(({ name }) => name === 'package')).toMatchObject({
    family: 'combobox',
    value: 'Studio - $500',
  });
  expect(snapshot.fields.find(({ name }) => name === 'recording')).toMatchObject({
    family: 'checkbox',
    checked: false,
  });
  expect(snapshot.fields.find(({ name }) => name === 'catering')).toMatchObject({
    family: 'checkbox',
    checked: false,
  });
  expect(snapshot.fields.find(({ name }) => name === 'base_amount')).toMatchObject({
    family: 'text',
    value: '$500.00',
  });
  expect(snapshot.fields.find(({ name }) => name === 'guest_amount')).toMatchObject({
    family: 'text',
    value: '$180.00',
  });
  expect(snapshot.fields.find(({ name }) => name === 'extras_amount')).toMatchObject({
    family: 'text',
    value: '$0.00',
  });
  expect(snapshot.fields.find(({ name }) => name === 'total_amount')).toMatchObject({
    family: 'text',
    value: '$680.00',
  });
}

describe('interactive form JavaScript acceptance', () => {
  it('executes the demo PDF buttons through the form transaction', async () => {
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

      expect(summaryResult.status).toBe('applied');
      expect(summaryResult.uiEffects).toContainEqual({ kind: 'gotoPage', page: 1, phase: 'user' });
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
        uiEffects: [{ kind: 'print', phase: 'user' }],
      });

      const packageField = afterSummary.fields.find(({ name }) => name === 'package');
      const recording = afterSummary.fields.find(({ name }) => name === 'recording');
      if (packageField?.family !== 'combobox' || recording?.family !== 'checkbox') {
        throw new Error('demo package/recording fields are missing');
      }
      const premium = packageField.options.find(({ label }) => label === 'Premium - $900');
      if (!premium) throw new Error('Premium package option is missing');

      await controller.commit(await doc.forms.list(), packageField.ref, {
        type: 'choice',
        values: [premium.value],
      });
      await controller.commit(await doc.forms.list(), recording.ref, {
        type: 'toggle',
        state: recording.exportValue,
      });

      const beforeReset = await doc.forms.list();
      const resetButton = beforeReset.fields.find(({ name }) => name === 'btn_reset');
      if (!resetButton) throw new Error('reset button is missing');
      const resetResult = await controller.activate(
        beforeReset,
        resetButton.ref,
        await activationFor(doc, resetButton),
      );
      expect(resetResult.status).toBe('applied');

      let afterReset = await doc.forms.list();
      expectAdobeResetState(afterReset);

      for (let attempt = 0; attempt < 2; attempt++) {
        const repeatedResetButton = afterReset.fields.find(({ name }) => name === 'btn_reset');
        if (!repeatedResetButton) throw new Error('reset button is missing after reset');
        const repeatedResetResult = await controller.activate(
          afterReset,
          repeatedResetButton.ref,
          await activationFor(doc, repeatedResetButton),
        );
        expect(repeatedResetResult.status).toBe('unchanged');
        afterReset = await doc.forms.list();
        expectAdobeResetState(afterReset);
      }

      const confirmation = afterReset.fields.find(({ name }) => name === 'confirmation');
      if (confirmation?.family !== 'text') throw new Error('confirmation field is missing');
      await controller.commit(afterReset, confirmation.ref, { type: 'text', value: 'CONFIRM' });

      const beforeConfirm = await doc.forms.list();
      const confirmButton = beforeConfirm.fields.find(({ name }) => name === 'btn_confirm');
      if (!confirmButton) throw new Error('confirm button is missing');
      const confirmResult = await controller.activate(
        beforeConfirm,
        confirmButton.ref,
        await activationFor(doc, confirmButton),
      );
      expect(confirmResult.uiEffects).toContainEqual({
        kind: 'alert',
        message: 'Event confirmed. This alert was launched by embedded PDF JavaScript.',
        icon: 3,
        phase: 'user',
      });

      const afterConfirm = await doc.forms.list();
      expect(afterConfirm.fields.find(({ name }) => name === 'confirmation_result')).toMatchObject({
        family: 'text',
        value: expect.stringContaining('Confirmed on '),
      });
    } finally {
      controller.dispose();
      await doc.close();
      await engine.destroy();
    }
  });
});
