import { EVERY_PERMISSION } from './fixtureScope';
import type { ConformanceFixture, ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { FormFieldDTO } from '../forms/field';

/**
 * Form fields through `pages.insert` and `pages.extract`: the pages bring the
 * fields of their widgets, written into the document's `/AcroForm`, so other
 * PDF apps fill them in too.
 *
 * The form is `form_page_import.pdf` (vendored from the runtime fork's
 * testing/resources): on page 1, `person.name` (Ann) and the monthly button of
 * the radio group `plan`; on page 2, `person.email`, the yearly button (on) and
 * the check box `agree` (checked). Its field `hidden` has no widget, so no page
 * brings it.
 *
 * Invariants:
 *   1. An insert brings every field with a widget on the inserted pages, with
 *      its value and widgets, and they read the same after a save in either
 *      mode, opened again (bytes engines).
 *   2. A top-level field whose name the document already uses comes in as
 *      `name_2` (then `_3`, ...), with its fields under it: the copies stay
 *      apart, each with its own value.
 *   3. An extract brings the fields of the extracted pages' widgets only, and
 *      of a field, only the widgets on those pages.
 */
export interface PageFormFieldsConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  openKind: 'bytes' | 'id';
  /** The form; its bytes are what the suite inserts (on every engine). */
  form: ConformanceFixture;
  /** A document with no form fields, the target of the inserts. */
  target: ConformanceFixture;
}

/** A field as the suite compares it: its value and how many widgets it has. */
interface FieldSummary {
  value: string | boolean;
  widgets: number;
}

const FORM_FIELDS: Record<string, FieldSummary> = {
  'person.name': { value: 'Ann', widgets: 1 },
  'person.email': { value: 'ann@example.com', widgets: 1 },
  plan: { value: 'yearly', widgets: 2 },
  agree: { value: true, widgets: 1 },
};

const SECOND_PAGE_FIELDS: Record<string, FieldSummary> = {
  'person.email': { value: 'ann@example.com', widgets: 1 },
  plan: { value: 'yearly', widgets: 1 },
  agree: { value: true, widgets: 1 },
};

export function runPageFormFieldsConformance(
  runner: ConformanceTestRunner,
  opts: PageFormFieldsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page form fields conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('an insert brings the form fields of the inserted pages', async () => {
      const doc = await open(engine, opts, opts.target);
      try {
        const before = await doc.pages.list();
        await doc.pages.insert(await opts.form.bytes());
        expect(await fieldsOf(doc)).toEqual(FORM_FIELDS);
        // Every widget is on an inserted page.
        const pages = new Set(
          (await doc.pages.list()).pages.slice(before.pageCount).map((p) => p.ref.objectNumber),
        );
        const widgets = (await doc.forms.list()).fields.flatMap((field) => field.widgets);
        expect(widgets.every((widget) => widget.page && pages.has(widget.page.objectNumber))).toBe(
          true,
        );
      } finally {
        await doc.close();
      }
    });

    test('the inserted fields read the same after a save in either mode', async () => {
      if (opts.openKind !== 'bytes') return;
      for (const mode of ['rewrite', 'incremental'] as const) {
        const doc = await open(engine, opts, opts.target);
        let reopened: DocumentHandle | null = null;
        try {
          await doc.pages.insert(await opts.form.bytes());
          const bytes = await doc.download({ mode });
          reopened = await engine.open(
            { kind: 'bytes', id: `${opts.target.id}-form-insert-${mode}`, bytes },
            EVERY_PERMISSION,
          );
          expect(await fieldsOf(reopened)).toEqual(FORM_FIELDS);
        } finally {
          if (reopened) await reopened.close();
          await doc.close();
        }
      }
    });

    test('fields named as the document names its own come in as name_2, kept apart', async () => {
      const doc = await open(engine, opts, opts.target);
      let reopened: DocumentHandle | null = null;
      try {
        await doc.pages.insert(await opts.form.bytes());
        await doc.pages.insert(await opts.form.bytes());
        const fields = await fieldsOf(doc);
        expect(fields).toEqual({
          ...FORM_FIELDS,
          'person_2.name': FORM_FIELDS['person.name'],
          'person_2.email': FORM_FIELDS['person.email'],
          plan_2: FORM_FIELDS.plan,
          agree_2: FORM_FIELDS.agree,
        });

        // Filling one copy leaves the other as it was.
        const name = (await doc.forms.list()).fields.find((field) => field.name === 'person.name');
        await doc.forms.setValue(name!.ref, { value: 'Bea' });
        const after = await fieldsOf(doc);
        expect(after['person.name']!.value).toBe('Bea');
        expect(after['person_2.name']!.value).toBe('Ann');

        if (opts.openKind !== 'bytes') return;
        reopened = await engine.open(
          { kind: 'bytes', id: `${opts.target.id}-form-insert-twice`, bytes: await doc.download() },
          EVERY_PERMISSION,
        );
        expect(await fieldsOf(reopened)).toEqual(after);
      } finally {
        if (reopened) await reopened.close();
        await doc.close();
      }
    });

    test('an extract brings only the fields of the extracted pages', async () => {
      const form = await open(engine, opts, opts.form);
      const doc = await open(engine, opts, opts.target);
      try {
        const { pages } = await form.pages.list();
        await doc.pages.insert(await form.pages.extract([pages[1]!.ref]));
        expect(await fieldsOf(doc)).toEqual(SECOND_PAGE_FIELDS);
      } finally {
        await doc.close();
        await form.close();
      }
    });
  });
}

/** Each field by its full name. */
async function fieldsOf(doc: DocumentHandle): Promise<Record<string, FieldSummary>> {
  const { fields } = await doc.forms.list();
  return Object.fromEntries(
    fields.map((field) => [field.name, { value: valueOf(field), widgets: field.widgets.length }]),
  );
}

function valueOf(field: FormFieldDTO): string | boolean {
  switch (field.family) {
    case 'text':
    case 'radio':
      return field.value;
    case 'checkbox':
      return field.checked;
    default:
      return '';
  }
}

async function open(
  engine: Engine,
  opts: PageFormFieldsConformanceOptions,
  fixture: ConformanceFixture,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await fixture.bytes();
    return engine.open({ kind: 'bytes', id: fixture.id, bytes }, EVERY_PERMISSION);
  }
  return engine.open({ kind: 'id', id: fixture.cloudId ?? fixture.id });
}
