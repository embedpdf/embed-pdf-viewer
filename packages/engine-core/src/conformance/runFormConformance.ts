import type {
  ConformanceFixture,
  ConformanceOptions,
  ConformanceTestRunner,
} from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { FormFieldDTO } from '../forms/field';
import {
  FormImportResultSchema,
  FormRepairResultSchema,
  FormSetValueResultSchema,
} from '../wire/schemas';
import { FormSnapshotSchema } from '../forms/schema';

/**
 * The three fixtures the forms suite needs. Shapes (names, object numbers,
 * values) match the pdf-runtime fork's test resources:
 *
 * - `toggleFields` — toggle_fields.pdf: text field `maxlen_text`
 *   (/MaxLen 5, value "abc"), radio `ntto_radio` (NoToggleToOff, /DV x,
 *   widgets x/y), radio `unison_radio` (RadiosInUnison), checkbox
 *   `opt_check` (/Opt "Alpha", on-state "On"), hierarchical text field
 *   `billing.name`.
 * - `orphanWidgets` — orphan_widgets.pdf: `linked_text` in /AcroForm
 *   /Fields plus RECOVERED `orphan_check` and `orphan_radio`.
 * - `choiceFields` — listbox_form.pdf: `Listbox_MultiSelect` (options
 *   Apple..), `Listbox_SingleSelect`.
 */
export interface FormConformanceFixtures {
  /** toggle_fields.pdf; `pageObjectNumber` = its single page (object 3). */
  toggleFields: ConformanceFixture & { pageObjectNumber: number };
  orphanWidgets: ConformanceFixture;
  choiceFields: ConformanceFixture;
  /**
   * A second, independent copy of `toggleFields` used as the XFDF import
   * target. Required for `openKind: 'id'` (cloud) — id-opened documents are
   * server-side state, so the suite cannot mint a copy by re-opening the
   * same bytes under a suffixed id the way the bytes transport does.
   */
  importTarget?: ConformanceFixture;
}

export interface FormConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixtures: FormConformanceFixtures;
}

export function runFormConformance(
  runner: ConformanceTestRunner,
  opts: FormConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`forms conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      await engine.destroy();
    });

    async function open(fixture: ConformanceFixture, idSuffix = ''): Promise<DocumentHandle> {
      if (opts.openKind === 'bytes') {
        const bytes = await fixture.bytes();
        return engine.open({ kind: 'bytes', id: fixture.id + idSuffix, bytes });
      }
      return engine.open({ kind: 'id', id: fixture.cloudId ?? fixture.id });
    }

    function fieldByName(fields: FormFieldDTO[], name: string): FormFieldDTO {
      const field = fields.find((f) => f.name === name);
      expect(Boolean(field)).toBe(true);
      return field!;
    }

    test('lists the reconciled field tree with per-family DTOs', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const snapshot = await doc.forms.list();
        // Wire parity: the snapshot must survive its own schema.
        FormSnapshotSchema.parse(snapshot);
        expect(snapshot.formKind).toBe('acroform');

        const text = fieldByName(snapshot.fields, 'maxlen_text');
        if (text.family !== 'text') throw new Error('expected text family');
        expect(text.value).toBe('abc');
        expect(text.valueEntry).toEqual({ kind: 'scalar', value: 'abc' });
        expect(text.defaultValueEntry).toEqual({ kind: 'none' });
        expect(text.maxLength).toBe(5);
        expect(text.widgets.length).toBe(1);

        const radio = fieldByName(snapshot.fields, 'ntto_radio');
        if (radio.family !== 'radio') throw new Error('expected radio family');
        expect(radio.noToggleToOff).toBe(true);
        expect(radio.value).toBe('x');
        expect(radio.valueEntry).toEqual({ kind: 'scalar', value: 'x' });
        expect(radio.defaultValueEntry).toEqual({ kind: 'scalar', value: 'x' });
        expect(radio.widgets.map((w) => w.onState)).toEqual(['x', 'y']);
        expect(radio.widgets.map((w) => w.checked)).toEqual([true, false]);

        const unison = fieldByName(snapshot.fields, 'unison_radio');
        if (unison.family !== 'radio') throw new Error('expected radio family');
        expect(unison.radiosInUnison).toBe(true);

        const check = fieldByName(snapshot.fields, 'opt_check');
        if (check.family !== 'checkbox') throw new Error('expected checkbox family');
        expect(check.checked).toBe(false);
        expect(check.exportValue).toBe('Alpha');

        // Hierarchical fields surface under their fully qualified name.
        const nested = fieldByName(snapshot.fields, 'billing.name');
        expect(nested.family).toBe('text');
        expect(snapshot.calculationOrder).toEqual([]);
      } finally {
        await doc.close();
      }
    });

    test('writes text values and enforces /MaxLen', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const result = await doc.forms.setValue(
          { kind: 'fqn', name: 'maxlen_text' },
          { type: 'text', value: 'abcde' },
        );
        FormSetValueResultSchema.parse(result);
        expect(result.field.family).toBe('text');
        if (result.field.family === 'text') expect(result.field.value).toBe('abcde');
        expect(result.changedWidgets.length).toBe(1);

        await expect(
          doc.forms.setValue(
            { kind: 'fqn', name: 'maxlen_text' },
            { type: 'text', value: 'abcdef' },
          ),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // Re-read through the (invalidated) snapshot: the write is visible.
        const after = await doc.forms.get({ kind: 'fqn', name: 'maxlen_text' });
        if (after.family === 'text') expect(after.value).toBe('abcde');
      } finally {
        await doc.close();
      }
    });

    test('toggles radio groups and honors NoToggleToOff', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const radioRef = { kind: 'fqn', name: 'ntto_radio' } as const;
        const result = await doc.forms.setValue(radioRef, { type: 'toggle', state: 'y' });
        if (result.field.family !== 'radio') throw new Error('expected radio family');
        expect(result.field.value).toBe('y');
        expect(result.field.widgets.map((w) => w.checked)).toEqual([false, true]);
        expect(result.changedWidgets.length).toBe(2); // x -> Off, y -> on

        // Clearing a NoToggleToOff group is a validation error.
        await expect(
          doc.forms.setValue(radioRef, { type: 'toggle', state: null }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // Checkbox with /Opt: checking reads back the export value.
        const check = await doc.forms.setValue(
          { kind: 'fqn', name: 'opt_check' },
          { type: 'toggle', state: 'On' },
        );
        if (check.field.family !== 'checkbox') throw new Error('expected checkbox family');
        expect(check.field.checked).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('rejects family/value mismatches without touching the field', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        // Compare against the CURRENT value, not the fixture seed: on
        // transports with durable server state (cloud), earlier tests'
        // legitimate writes persist. The invariant under test is that a
        // rejected write changes NOTHING.
        const before = await doc.forms.get({ kind: 'fqn', name: 'maxlen_text' });
        if (before.family !== 'text') throw new Error('expected text family');
        await expect(
          doc.forms.setValue({ kind: 'fqn', name: 'maxlen_text' }, { type: 'toggle', state: 'On' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const field = await doc.forms.get({ kind: 'fqn', name: 'maxlen_text' });
        if (field.family === 'text') expect(field.value).toBe(before.value);
      } finally {
        await doc.close();
      }
    });

    test('applies ordered script effects once and produces zero churn for a no-op batch', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      if (!doc.forms.applyEffects) {
        await doc.close();
        return;
      }
      try {
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'form.effectsApplied') events.push(event);
        });
        const result = await doc.forms.applyEffects([
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { type: 'text', value: 'fx' },
          },
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'missing.effect.field' },
            value: { type: 'text', value: 'ignored' },
          },
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { type: 'text', value: 'fx' },
          },
        ]);
        expect(result.results.map((entry) => entry.status)).toEqual([
          'applied',
          'rejected',
          'unchanged',
        ]);
        expect(result.meta === null).toBe(false);
        expect(events).toHaveLength(1);

        const noOp = await doc.forms.applyEffects([
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { type: 'text', value: 'fx' },
          },
        ]);
        expect(noOp.results.map((entry) => entry.status)).toEqual(['unchanged']);
        expect(noOp.meta).toBeNull();
        expect(events).toHaveLength(1);
        unsubscribe();
      } finally {
        await doc.close();
      }
    });

    test('selects multi-select list box options by export value', async () => {
      const doc = await open(opts.fixtures.choiceFields);
      try {
        const multiRef = { kind: 'fqn', name: 'Listbox_MultiSelect' } as const;
        const result = await doc.forms.setValue(multiRef, {
          type: 'choice',
          values: ['Cherry', 'Apple'],
        });
        if (result.field.family !== 'listbox') throw new Error('expected listbox family');
        // Option order, not input order.
        expect(result.field.selectedValues).toEqual(['Apple', 'Cherry']);
        expect(result.field.valueEntry.kind).toBe('array');

        // Multiple values on a single-select list box is a validation error.
        await expect(
          doc.forms.setValue(
            { kind: 'fqn', name: 'Listbox_SingleSelect' },
            { type: 'choice', values: ['foo', 'bar'] },
          ),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      } finally {
        await doc.close();
      }
    });

    test('reset restores /DV or clears the value', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        // ntto_radio carries /DV x.
        await doc.forms.setValue(
          { kind: 'fqn', name: 'ntto_radio' },
          { type: 'toggle', state: 'y' },
        );
        const radio = await doc.forms.reset({ kind: 'fqn', name: 'ntto_radio' });
        if (radio.field.family === 'radio') expect(radio.field.value).toBe('x');

        // maxlen_text has no /DV: reset clears.
        await doc.forms.setValue(
          { kind: 'fqn', name: 'maxlen_text' },
          { type: 'text', value: 'zzz' },
        );
        const text = await doc.forms.reset({ kind: 'fqn', name: 'maxlen_text' });
        if (text.field.family === 'text') expect(text.field.value).toBe('');
      } finally {
        await doc.close();
      }
    });

    test('round-trips form data across documents via XFDF and FDF', async () => {
      const first = await open(opts.fixtures.toggleFields);
      let second: DocumentHandle | null = null;
      try {
        // A second, independent copy of the same fixture (a dedicated
        // fixture when the transport needs server-side state, else the same
        // bytes under a suffixed id so the two sessions coexist).
        second = opts.fixtures.importTarget
          ? await open(opts.fixtures.importTarget)
          : await open(opts.fixtures.toggleFields, '-import-target');
        const tricky = 'a<b>&"c" \'d\'';
        await first.forms.setValue(
          { kind: 'fqn', name: 'billing.name' },
          { type: 'text', value: tricky },
        );

        const xfdf = await first.forms.exportData('xfdf');
        expect(xfdf.format).toBe('xfdf');
        expect(xfdf.bytes.length > 0).toBe(true);

        const imported = await second!.forms.importData(xfdf.bytes);
        FormImportResultSchema.parse(imported);
        expect(imported.fieldsSkipped).toBe(0);
        expect(imported.fieldsApplied > 0).toBe(true);
        const nested = imported.snapshot.fields.find((f) => f.name === 'billing.name');
        if (nested?.family === 'text') expect(nested.value).toBe(tricky);

        const fdf = await first.forms.exportData('fdf');
        expect(fdf.format).toBe('fdf');
        const head = String.fromCharCode(...fdf.bytes.slice(0, 5));
        expect(head).toBe('%FDF-');
      } finally {
        await first.close();
        if (second) await second.close();
      }
    });

    test('rejects garbage import payloads', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        await expect(
          doc.forms.importData(new TextEncoder().encode('not a form payload')),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      } finally {
        await doc.close();
      }
    });

    test('emits form events on mutations', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type.startsWith('form.')) events.push(event);
        });
        await doc.forms.setValue(
          { kind: 'fqn', name: 'maxlen_text' },
          { type: 'text', value: 'ok' },
        );
        unsubscribe();
        expect(events.length).toBe(1);
        expect(events[0]!.type).toBe('form.valueChanged');
      } finally {
        await doc.close();
      }
    });

    test('repair makes recovered fields durable and is idempotent', async () => {
      const doc = await open(opts.fixtures.orphanWidgets);
      try {
        const before = await doc.forms.list();
        expect(before.fields.length).toBe(3);
        expect(before.fields.filter((f) => f.origin === 'recovered').length).toBe(2);

        const repair = await doc.forms.repair();
        FormRepairResultSchema.parse(repair);
        expect(repair.fieldsLinked).toBe(2);
        expect(repair.acroformCreated).toBe(false);
        expect(repair.fieldsUnrepairable).toBe(0);

        const after = await doc.forms.list();
        expect(after.fields.every((f) => f.origin === 'acroform')).toBe(true);

        const again = await doc.forms.repair();
        expect(again.fieldsLinked).toBe(0);
        expect(again.widgetsLinked).toBe(0);
      } finally {
        await doc.close();
      }
    });

    test('widgets live the full annotation-plane loop', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pon = opts.fixtures.toggleFields.pageObjectNumber;
      try {
        // 1. Born as an annotation: inert, styled with the house vocabulary.
        const page = doc.page(pon);
        const created = await page.annotations.create({
          subtype: 'widget',
          rect: { left: 20, bottom: 20, right: 200, top: 44 },
          interiorColor: { r: 246, g: 248, b: 250 },
          color: { r: 31, g: 111, b: 235 },
          strokeWidth: 1,
          fontSize: 10,
        });
        if (created.created.subtype !== 'widget') throw new Error('expected widget DTO');
        expect(created.created.fieldObjectNumber).toBe(0); // inert
        expect(created.created.interiorColor).toEqual({ r: 246, g: 248, b: 250 });
        const widgetRef = created.created.ref;
        if (widgetRef.kind !== 'objectNumber') throw new Error('expected durable ref');

        // 2. Adopted by a field -> the DTO joins to the field plane.
        const field = await doc.forms.createField({ family: 'text', name: 'loop_field' });
        await doc.forms.attachWidget(field.field.ref, {
          annotObjectNumber: widgetRef.annotObjectNumber,
          pageObjectNumber: pon,
        });
        const { annotations } = await page.annotations.list();
        const widgetDto = annotations.find(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === widgetRef.annotObjectNumber,
        );
        if (widgetDto?.subtype !== 'widget') throw new Error('expected widget DTO');
        expect(widgetDto.fieldObjectNumber).toBe(field.field.fieldObjectNumber);

        // 3. Restyled/moved through the SAME annotation path as every kind.
        const patched = await page.annotations.update(widgetRef, {
          subtype: 'widget',
          interiorColor: { r: 255, g: 247, b: 219 },
        });
        if (patched.updated.subtype !== 'widget') throw new Error('expected widget DTO');
        expect(patched.updated.interiorColor).toEqual({ r: 255, g: 247, b: 219 });

        // 4. Deleting an ATTACHED widget is refused - the field-tree owns it.
        await expect(page.annotations.delete(widgetRef)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // 5. Detach -> inert again -> ordinary annotation delete succeeds.
        await doc.forms.detachWidget(field.field.ref, {
          annotObjectNumber: widgetRef.annotObjectNumber,
          pageObjectNumber: pon,
        });
        await page.annotations.delete(widgetRef);

        // The field survives, unplaced.
        const after = await doc.forms.get(field.field.ref);
        expect(after.widgets.length).toBe(0);
      } finally {
        await doc.close();
      }
    });

    test('createField composes styled widgets atomically', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pon = opts.fixtures.toggleFields.pageObjectNumber;
      try {
        const created = await doc.forms.createField({
          family: 'radio',
          name: 'authored_radio',
          noToggleToOff: true,
          widgets: [
            {
              pageObjectNumber: pon,
              rect: { left: 20, bottom: 60, right: 40, top: 80 },
              onState: 'yes',
              appearance: { color: { r: 0, g: 0, b: 0 }, strokeWidth: 1 },
            },
            {
              pageObjectNumber: pon,
              rect: { left: 60, bottom: 60, right: 80, top: 80 },
              onState: 'no',
            },
          ],
        });
        if (created.field.family !== 'radio') throw new Error('expected radio');
        expect(created.field.noToggleToOff).toBe(true);
        expect(created.field.widgets.map((w) => w.onState)).toEqual(['yes', 'no']);

        // The newborn group fills through the normal value path.
        const filled = await doc.forms.setValue(created.field.ref, {
          type: 'toggle',
          state: 'yes',
        });
        if (filled.field.family !== 'radio') throw new Error('expected radio');
        expect(filled.field.value).toBe('yes');

        // updateField: rename + conflict validation.
        await doc.forms.updateField(created.field.ref, {
          family: 'radio',
          name: 'renamed_radio',
        });
        await expect(
          doc.forms.updateField(created.field.ref, { family: 'radio', name: 'unison_radio' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // deleteField cascades: field gone AND its widgets gone.
        const before = await doc.page(pon).annotations.list();
        const removed = await doc.forms.deleteField(created.field.ref);
        expect(removed.removedWidgets.length).toBe(2);
        const after = await doc.page(pon).annotations.list();
        expect(after.annotations.length).toBe(before.annotations.length - 2);
        await expect(doc.forms.get({ kind: 'fqn', name: 'renamed_radio' })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      } finally {
        await doc.close();
      }
    });

    test('unknown refs fail with NotFound', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        await expect(doc.forms.get({ kind: 'fqn', name: 'no.such.field' })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      } finally {
        await doc.close();
      }
    });
  });
}
