import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageFormFieldsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import type { DocumentHandle, Engine, FormFieldDTO } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, 'fixtures');
const read = async (file: string) => new Uint8Array(await readFile(resolve(fixtures, file)));

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runPageFormFieldsConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  form: { id: 'form-page-import-pdf', bytes: () => read('form_page_import.pdf'), expected: {} },
  target: { id: 'hello-world-form-target', bytes: () => read('hello_world.pdf'), expected: {} },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});

/** A one-page PDF with nothing on it: what the merge tool inserts every file into. */
function blankPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  let file = '%PDF-1.7\n';
  const offsets = objects.map((body, index) => {
    const offset = file.length;
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(file);
}

/** Each field by its full name: family, value and how many widgets. */
async function formOf(doc: DocumentHandle) {
  const { fields } = await doc.forms.list();
  return Object.fromEntries(fields.map((field) => [field.name, summary(field)]));
}

function summary(field: FormFieldDTO) {
  const value =
    field.family === 'checkbox' ? field.checked : 'value' in field ? field.value : undefined;
  return { family: field.family, value, widgets: field.widgets.length };
}

describe('merging form PDFs into a blank one (engine-local, wasm runtime)', () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });

  afterAll(async () => {
    await engine.destroy();
  });

  for (const file of ['embedpdf-forms.pdf', 'listbox_form.pdf']) {
    for (const mode of ['rewrite', 'incremental'] as const) {
      test(`${file} keeps its form after a ${mode} save`, async () => {
        const source = await engine.open({ kind: 'bytes', bytes: await read(file) });
        const merged = await engine.open({ kind: 'bytes', bytes: blankPdf() });
        let reopened: DocumentHandle | null = null;
        try {
          const expected = await formOf(source);
          expect(Object.keys(expected).length).toBeGreaterThan(0);
          await merged.pages.insert(await read(file));
          const { pages } = await merged.pages.list();
          await merged.pages.delete([pages[0]!.ref]);
          const bytes = await merged.download({ mode });
          // Other PDF apps find the fields through /AcroForm.
          expect(new TextDecoder('latin1').decode(bytes)).toContain('/AcroForm');

          reopened = await engine.open({ kind: 'bytes', bytes });
          expect(await formOf(reopened)).toEqual(expected);
        } finally {
          if (reopened) await reopened.close();
          await merged.close();
          await source.close();
        }
      });
    }
  }
});
