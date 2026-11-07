/**
 * A tagged form's Tab order, read end to end. The USCIS Form I-140 (`sample.pdf`) says `/Tabs /S`
 * on every page and tags every field: its tags put the attorney's box before Part 1 and the mailing
 * address in its printed order, where the page lists its fields another way (a barcode first, the
 * state before the unit boxes). `embedpdf-forms.pdf` is tagged and says `/Tabs /S` too, but its
 * fields were added without tags, as a form built on a printed page often is: they have no place in
 * the tags, and Tab keeps the order the page lists them in.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { FormSnapshot, WidgetAnnotation } from '@embedpdf/engine-core/runtime';

import { createLocalEngine, tabOrderOf } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const i140 = resolve(here, '../../../../examples/engine-runtime-demo/public/sample.pdf');
const fieldsWithoutTags = resolve(here, 'fixtures/embedpdf-forms.pdf');

/** The last part of a box's field name: `Pt1Line1a_FamilyName[0]`. */
const nameOf = (form: FormSnapshot, widget: WidgetAnnotation) =>
  form.fields
    .find((field) =>
      field.widgets.some(({ objectNumber }) => objectNumber === objectNumberOf(widget)),
    )
    ?.name.split('.')
    .pop();
const objectNumberOf = (widget: WidgetAnnotation) =>
  widget.ref.kind === 'objectNumber' ? widget.ref.objectNumber : 0;

async function firstPageOf(file: string, prefer: 'wasm' | 'native') {
  const engine = await createLocalEngine({ runtime: { prefer } });
  const doc = await engine.open(
    { kind: 'bytes', bytes: new Uint8Array(await readFile(file)) },
    { scope: ['*'] },
  );
  const { pages } = await doc.pages.list();
  const form = await doc.forms.list();
  const widgets = form.widgets.filter(
    (widget) => widget.page.objectNumber === pages[0]!.ref.objectNumber,
  );
  return { doc, engine, page: pages[0]!, form, widgets };
}

describe.each(['wasm', 'native'] as const)('the Tab order of a tagged form (%s)', (prefer) => {
  test("reads where each field box sits in the tags, and Tab follows the tags' order", async () => {
    const { doc, engine, page, form, widgets } = await firstPageOf(i140, prefer);
    try {
      expect(page.tabOrder).toBe('structure');
      expect(widgets.length).toBe(33);
      expect(widgets.every((widget) => widget.structurePosition !== null)).toBe(true);
      // The page lists a barcode first; the tags start with the attorney's box at the top.
      expect(nameOf(form, widgets[0]!)).toBe('PDF417BarCode1[0]');
      expect(
        tabOrderOf(widgets, [page])
          .slice(0, 12)
          .map((widget) => nameOf(form, widget)),
      ).toEqual([
        'G28CheckBox[0]',
        'attyStateBarNumber[0]',
        'attyUSCISOnlineNum[0]',
        'Pt1Line1a_FamilyName[0]',
        'Pt1Line1b_GivenName[0]',
        'Pt1Line1c_MiddleName[0]',
        'Line2_CompanyName[0]',
        'Line6a_InCareofName[0]',
        'Line6b_StreetNumberName[0]',
        'Line6c_Unit[2]',
        'Line6c_Unit[0]',
        'Line6c_Unit[1]',
      ]);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test("keeps the page's own order for field boxes its tags leave out", async () => {
    const { doc, engine, page, widgets } = await firstPageOf(fieldsWithoutTags, prefer);
    try {
      expect(page.tabOrder).toBe('structure');
      expect(widgets.length).toBe(9);
      expect(widgets.every((widget) => widget.structurePosition === null)).toBe(true);
      expect(tabOrderOf(widgets, [page])).toEqual(widgets);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
