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
import type { AnnotationRef } from '../identity/AnnotationRef';
import { annotationKey } from '../identity/annotationKey';
import { toFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import {
  FormImportResultSchema,
  FormRepairResultSchema,
  FormResetResultSchema,
  FormSetValueResultSchema,
  FormWidgetLinkResultSchema,
  FormWidgetsReorderResultSchema,
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
 *   /Fields plus recovered `orphan_check` and `orphan_radio`.
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
  /**
   * Another independent copy of `toggleFields`, whose merged field/widgets
   * the delete test removes. Required for `openKind: 'id'` (cloud): the
   * deletes are durable server state the other tests must not see.
   */
  deleteTarget?: ConformanceFixture;
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

    test('writes text values and truncates to /MaxLen', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const result = await doc.forms.setValue(
          { kind: 'fqn', name: 'maxlen_text' },
          { value: 'abcde' },
        );
        FormSetValueResultSchema.parse(result);
        expect(result.field.family).toBe('text');
        if (result.field.family === 'text') expect(result.field.value).toBe('abcde');
        expect(result.meta.changedWidgets.length).toBe(1);
        // The meta names the field and the page its repainted widget is on.
        expect(result.meta.changedFields).toEqual([result.field.ref]);
        expect(result.meta.affectedPages).toEqual([result.meta.changedWidgets[0]!.page]);

        const truncated = await doc.forms.setValue(
          { kind: 'fqn', name: 'maxlen_text' },
          { value: 'abcdef' },
        );
        if (truncated.field.family !== 'text') throw new Error('expected text family');
        expect(truncated.field.value).toBe('abcde');
        expect(truncated.meta.changedWidgets).toHaveLength(0);

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
        const result = await doc.forms.setValue(radioRef, { value: 'y' });
        if (result.field.family !== 'radio') throw new Error('expected radio family');
        expect(result.field.value).toBe('y');
        expect(result.field.widgets.map((w) => w.checked)).toEqual([false, true]);
        expect(result.meta.changedWidgets.length).toBe(2); // x -> Off, y -> on

        // Clearing a NoToggleToOff group is a validation error.
        await expect(doc.forms.setValue(radioRef, { value: null })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        // A value no button exports is refused.
        await expect(doc.forms.setValue(radioRef, { value: 'z' })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // Checkbox with /Opt: written and read by its export value, not its on-state name.
        const optCheck = { kind: 'fqn', name: 'opt_check' } as const;
        await expect(doc.forms.setValue(optCheck, { value: 'On' })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        const byValue = await doc.forms.setValue(optCheck, { value: 'Alpha' });
        if (byValue.field.family !== 'checkbox') throw new Error('expected checkbox family');
        expect(byValue.field.checked).toBe(true);
        const cleared = await doc.forms.setValue(optCheck, { checked: false });
        if (cleared.field.family !== 'checkbox') throw new Error('expected checkbox family');
        expect(cleared.field.checked).toBe(false);
        const check = await doc.forms.setValue(optCheck, { checked: true });
        if (check.field.family !== 'checkbox') throw new Error('expected checkbox family');
        expect(check.field.checked).toBe(true);
        expect(check.field.exportValue).toBe('Alpha');
      } finally {
        await doc.close();
      }
    });

    test('rejects family/value mismatches without touching the field', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        // Compare against the current value, not the fixture seed: on
        // transports with durable server state (cloud), earlier tests'
        // legitimate writes persist. The invariant under test is that a
        // rejected write changes nothing.
        const before = await doc.forms.get({ kind: 'fqn', name: 'maxlen_text' });
        if (before.family !== 'text') throw new Error('expected text family');
        await expect(
          doc.forms.setValue({ kind: 'fqn', name: 'maxlen_text' }, { checked: true }),
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
          if (event.type === 'forms.effectsApplied') events.push(event);
        });
        const result = await doc.forms.applyEffects([
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { value: 'abcdef' },
          },
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'missing.effect.field' },
            value: { value: 'ignored' },
          },
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { value: 'abcde' },
          },
        ]);
        expect(result.results.map((entry) => entry.status)).toEqual([
          'applied',
          'rejected',
          'unchanged',
        ]);
        // The meta names the written field and every widget an effect repainted.
        expect(result.meta.changedFields.length).toBe(1);
        expect(result.meta.changedWidgets).toEqual(
          result.results.flatMap((entry) => entry.changedWidgets),
        );
        expect(events).toHaveLength(1);
        const appliedText = result.results[0]?.fields[0];
        if (appliedText?.family !== 'text') throw new Error('expected text family');
        expect(appliedText.value).toBe('abcde');

        const noOp = await doc.forms.applyEffects([
          {
            kind: 'setValue',
            ref: { kind: 'fqn', name: 'maxlen_text' },
            value: { value: 'abcde' },
          },
        ]);
        expect(noOp.results.map((entry) => entry.status)).toEqual(['unchanged']);
        // Nothing written: the meta names nothing, and no event fires.
        expect(noOp.meta.changedFields).toEqual([]);
        expect(noOp.meta.changedWidgets).toEqual([]);
        expect(noOp.meta.affectedPages).toEqual([]);
        expect(noOp.meta.cacheDelta).toBeNull();
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
        const result = await doc.forms.setValue(multiRef, { selectedValues: ['Cherry', 'Apple'] });
        if (result.field.family !== 'listbox') throw new Error('expected listbox family');
        // Option order, not input order.
        expect(result.field.selectedValues).toEqual(['Apple', 'Cherry']);
        expect(result.field.valueEntry.kind).toBe('array');

        // Multiple values on a single-select list box is a validation error.
        await expect(
          doc.forms.setValue(
            { kind: 'fqn', name: 'Listbox_SingleSelect' },
            { selectedValues: ['foo', 'bar'] },
          ),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      } finally {
        await doc.close();
      }
    });

    test('reset restores /DV or clears the value, and reports only the fields it changed', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        const radioRef = toFieldRef('ntto_radio');
        const textRef = toFieldRef('maxlen_text');
        // ntto_radio carries /DV x.
        await doc.forms.setValue(radioRef, { value: 'y' });
        const radio = await doc.forms.reset(radioRef);
        FormResetResultSchema.parse(radio);
        expect(radio.fields.map((field) => field.name)).toEqual(['ntto_radio']);
        const [restored] = radio.fields;
        if (restored?.family === 'radio') expect(restored.value).toBe('x');
        expect(radio.meta.changedFields).toEqual([restored!.ref]);

        // maxlen_text has no /DV: reset clears. The radio is already at its
        // default, so it is left out of the result.
        await doc.forms.setValue(textRef, { value: 'zzz' });
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type.startsWith('forms.')) events.push(event);
        });
        const both = await doc.forms.reset([radioRef, textRef]);
        unsubscribe();
        expect(both.fields.map((field) => field.name)).toEqual(['maxlen_text']);
        const [text] = both.fields;
        if (text?.family === 'text') expect(text.value).toBe('');
        expect(events.map((event) => event.type)).toEqual(['forms.valueSet']);

        // Nothing left to restore: no fields, no widgets.
        const again = await doc.forms.reset([radioRef, textRef]);
        expect(again.fields).toEqual([]);
        expect(again.meta.changedWidgets).toEqual([]);

        // An unknown field is refused.
        await expect(doc.forms.reset(toFieldRef('no.such.field'))).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      } finally {
        await doc.close();
      }
    });

    test('reset without refs resets the whole form as one change', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      try {
        await doc.forms.setValue(toFieldRef('ntto_radio'), { value: 'y' });
        await doc.forms.setValue(toFieldRef('billing.name'), { value: 'Ada' });
        const events: Extract<DocumentEvent, { type: 'forms.valueSet' }>[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'forms.valueSet') events.push(event);
        });
        const result = await doc.forms.reset();
        unsubscribe();
        const names = result.fields.map((field) => field.name);
        expect(names).toContain('ntto_radio');
        expect(names).toContain('billing.name');
        // One event per changed field, all in one transaction.
        expect(events.length).toBe(result.fields.length);
        const txIds = new Set(events.map((event) => event.origin.tx?.id));
        expect(txIds.size).toBe(1);
        expect(events.map((event) => event.origin.tx?.index)).toEqual(events.map((_, i) => i));
        expect(events.every((event) => event.origin.tx?.count === events.length)).toBe(true);
        const after = await doc.forms.list();
        const radio = after.fields.find((field) => field.name === 'ntto_radio');
        if (radio?.family === 'radio') expect(radio.value).toBe('x');
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
        await first.forms.setValue({ kind: 'fqn', name: 'billing.name' }, { value: tricky });

        const xfdf = await first.forms.export('xfdf');
        expect(xfdf.format).toBe('xfdf');
        expect(xfdf.bytes.length > 0).toBe(true);

        const imported = await second!.forms.import(xfdf.bytes);
        FormImportResultSchema.parse(imported);
        expect(imported.skipped).toBe(0);
        expect(imported.applied > 0).toBe(true);
        const nested = imported.form.fields.find((f) => f.name === 'billing.name');
        if (nested?.family === 'text') expect(nested.value).toBe(tricky);

        const fdf = await first.forms.export('fdf');
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
          doc.forms.import(new TextEncoder().encode('not a form payload')),
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
          if (event.type.startsWith('forms.')) events.push(event);
        });
        await doc.forms.setValue({ kind: 'fqn', name: 'maxlen_text' }, { value: 'ok' });
        unsubscribe();
        expect(events.length).toBe(1);
        expect(events[0]!.type).toBe('forms.valueSet');
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

    test('widgets live the full form loop', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pageRef = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      const page = doc.page(pageRef);
      try {
        // 1. A field gets a widget where its placement says, styled with the house vocabulary.
        const field = await doc.forms.create({ family: 'text', name: 'loop_field' });
        expect(field.field.widgets).toEqual([]);
        const rect = { x: 20, y: 20, width: 180, height: 24 };
        const added = await doc.forms.addWidget(field.field.ref, {
          page: pageRef,
          rect,
          interiorColor: '#f6f8fa',
          color: '#1f6feb',
          strokeWidth: 1,
          fontSize: 10,
        });
        FormWidgetLinkResultSchema.parse(added);
        expect(added.widgets.map((widget) => widget.rect)).toEqual([rect]);
        expect(added.meta.changedWidgets.length).toBe(1);
        const widgetRef = added.field.widgets[0]?.ref;
        if (widgetRef?.kind !== 'objectNumber') throw new Error('expected durable ref');

        // 2. The form holds its row, joined to its field; the annotations never do.
        const widgetRow = (await doc.forms.list()).widgets.find(
          (w) => annotationKey(w.ref) === annotationKey(widgetRef),
        );
        if (!widgetRow) throw new Error('expected a widget row');
        expect(widgetRow.field).toEqual(field.field.ref);
        expect(widgetRow.fieldFamily).toBe('text');
        expect(widgetRow.rect).toEqual(rect);
        expect(widgetRow.interiorColor).toEqual('#f6f8fa');
        expect(
          (await page.annotations.list()).annotations.some((a) => a.subtype === 'widget'),
        ).toBe(false);

        // 3. Restyled and moved through the form, never the annotation path.
        const patched = await doc.forms.updateWidget(widgetRef, {
          interiorColor: '#fff7db',
          rect: { ...rect, y: 40 },
        });
        expect(patched.widget.interiorColor).toEqual('#fff7db');
        expect(patched.widget.rect).toEqual({ ...rect, y: 40 });
        await expect(
          page.annotations.update(widgetRef, { subtype: 'widget', interiorColor: '#ffffff' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        await expect(page.annotations.delete(widgetRef)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // 4. Removed from its field, it stays on its page as a row in no field.
        const removed = await doc.forms.removeWidget(field.field.ref, widgetRef);
        expect(removed.widgets.map((w) => w.field)).toEqual([null]);
        const inert = (await doc.forms.list()).widgets.find(
          (w) => annotationKey(w.ref) === annotationKey(widgetRef),
        );
        expect(inert?.field).toBeNull();

        // The field survives, unplaced.
        const after = await doc.forms.get(field.field.ref);
        expect(after.widgets.length).toBe(0);
      } finally {
        await doc.close();
      }
    });

    test('deleteWidget takes a widget off its page, and out of its field', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pageRef = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      const page = doc.page(pageRef);
      const events: DocumentEvent[] = [];
      const stop = doc.events.subscribe((event) => events.push(event));
      try {
        const created = await doc.forms.create({
          family: 'text',
          name: 'delete_me',
          widgets: [
            { page: pageRef, rect: { x: 20, y: 300, width: 120, height: 20 } },
            { page: pageRef, rect: { x: 20, y: 330, width: 120, height: 20 } },
          ],
        });
        const [first, second] = created.field.widgets.map((w) => w.ref!) as [
          AnnotationRef,
          AnnotationRef,
        ];
        const onPage = async (ref: AnnotationRef) =>
          (await doc.forms.list()).widgets.some((w) => annotationKey(w.ref) === annotationKey(ref));

        // A widget in a field: it leaves the page and the field; the field keeps the other.
        const deleted = await doc.forms.deleteWidget(first);
        expect(annotationKey(deleted.widget)).toBe(annotationKey(first));
        expect(deleted.page).toEqual(pageRef);
        expect(deleted.field?.widgets.map((w) => w.ref && annotationKey(w.ref))).toEqual([
          annotationKey(second),
        ]);
        expect(await onPage(first)).toBe(false);
        expect(events.some((event) => event.type === 'forms.widgetDeleted')).toBe(true);

        // A widget in no field goes too.
        await doc.forms.removeWidget(created.field.ref, second);
        const inert = await doc.forms.deleteWidget(second);
        expect(inert.field).toBeNull();
        expect(await onPage(second)).toBe(false);
        expect((await doc.forms.get(created.field.ref)).widgets).toEqual([]);

        // A merged field/widget is the field: delete the field instead.
        const merged = await doc.forms.get(toFieldRef('opt_check'));
        const mergedRefusal = await doc.forms.deleteWidget(merged.widgets[0]!.ref!).then(
          () => null,
          (error: unknown) => error as { code?: unknown; message?: unknown },
        );
        expect(mergedRefusal).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(mergedRefusal?.message)).toMatch(/doc\.forms\.delete/);

        // An annotation isn't a widget.
        const square = (
          await page.annotations.create({
            subtype: 'square',
            box: { x: 300, y: 300, width: 40, height: 40 },
          })
        ).annotation.ref;
        const notWidget = await doc.forms.deleteWidget(square).then(
          () => null,
          (error: unknown) => error as { code?: unknown; message?: unknown },
        );
        expect(notWidget).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(notWidget?.message)).toMatch(/annotations\.delete/);
      } finally {
        stop();
        await doc.close();
      }
    });

    test('widgets and annotations each keep their own stacking order', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pageRef = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      const page = doc.page(pageRef);
      const events: DocumentEvent[] = [];
      const stop = doc.events.subscribe((event) => events.push(event));
      try {
        const widgetOrder = async () =>
          (await doc.forms.list()).widgets
            .filter((w) => w.page.objectNumber === pageRef.objectNumber)
            .map((w) => w.ref);
        const annotationOrder = async () =>
          (await page.annotations.list()).annotations.map((a) => a.ref);
        const keys = (refs: readonly AnnotationRef[]) => refs.map(annotationKey);
        const square = (
          await page.annotations.create({
            subtype: 'square',
            box: { x: 300, y: 300, width: 40, height: 40 },
          })
        ).annotation.ref;
        const widgets = await widgetOrder();
        const annotations = await annotationOrder();
        expect(widgets.length >= 2).toBe(true);
        const [bottom, next] = widgets as [AnnotationRef, AnnotationRef];

        // A widget to the top of the widgets: the annotations don't move.
        const toTop = await doc.forms.reorderWidgets([bottom], 'end');
        FormWidgetsReorderResultSchema.parse(toTop);
        expect(toTop.page).toEqual(pageRef);
        expect(keys(toTop.order)).toEqual(keys([...widgets.slice(1), bottom]));
        expect(toTop.meta.changedWidgets.map((w) => w.ref && annotationKey(w.ref))).toEqual(
          keys([bottom]),
        );
        expect(keys(await widgetOrder())).toEqual(keys(toTop.order));
        expect(keys(await annotationOrder())).toEqual(keys(annotations));
        const reordered = events.find((event) => event.type === 'forms.widgetsReordered');
        expect(reordered?.type === 'forms.widgetsReordered' && keys(reordered.order)).toEqual(
          keys(toTop.order),
        );

        // And back under its neighbour.
        const back = await doc.forms.reorderWidgets([bottom], { before: next });
        expect(keys(back.order)).toEqual(keys(widgets));

        // An annotation to the bottom of the annotations: the widgets don't move.
        const toBottom = await page.annotations.reorder([square], 'start');
        expect(keys(toBottom.order)).toEqual(
          keys([square, ...annotations.filter((a) => annotationKey(a) !== annotationKey(square))]),
        );
        expect(keys(await widgetOrder())).toEqual(keys(widgets));

        // Each verb orders its own family only, as rows and as neighbours.
        const refusal = (attempt: Promise<unknown>) =>
          attempt.then(
            () => null,
            (error: unknown) => error as { code?: unknown; message?: unknown },
          );
        const widgetAsAnnotation = await refusal(page.annotations.reorder([bottom], 'start'));
        expect(widgetAsAnnotation).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(widgetAsAnnotation?.message)).toMatch(/doc\.forms\.reorderWidgets/);
        await expect(page.annotations.reorder([square], { after: bottom })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        const annotationAsWidget = await refusal(doc.forms.reorderWidgets([square], 'end'));
        expect(annotationAsWidget).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(annotationAsWidget?.message)).toMatch(/annotations\.reorder/);
        await expect(doc.forms.reorderWidgets([bottom], { before: square })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        expect(keys(await widgetOrder())).toEqual(keys(widgets));
      } finally {
        stop();
        await doc.close();
      }
    });

    test('createField composes styled widgets atomically', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const pageObjectNumber = opts.fixtures.toggleFields.pageObjectNumber;
      try {
        const created = await doc.forms.create({
          family: 'radio',
          name: 'authored_radio',
          noToggleToOff: true,
          widgets: [
            {
              page: toPageRef(pageObjectNumber),
              rect: { x: 20, y: 60, width: 20, height: 20 },
              exportValue: 'yes',
              color: '#000000',
              strokeWidth: 1,
            },
            {
              page: toPageRef(pageObjectNumber),
              rect: { x: 60, y: 60, width: 20, height: 20 },
              exportValue: 'no',
            },
          ],
        });
        if (created.field.family !== 'radio') throw new Error('expected radio');
        expect(created.field.noToggleToOff).toBe(true);
        expect(created.field.widgets.map((w) => w.exportValue)).toEqual(['yes', 'no']);
        // Each widget lands where it was placed, measured from the page's top-left,
        // and the form reads back the same rects the create answered.
        const rects = [
          { x: 20, y: 60, width: 20, height: 20 },
          { x: 60, y: 60, width: 20, height: 20 },
        ];
        expect(created.widgets.map((w) => w.rect)).toEqual(rects);
        const placed = (await doc.forms.list()).widgets;
        const rowOf = (ref: AnnotationRef | null) =>
          placed.find((w) => ref && annotationKey(w.ref) === annotationKey(ref));
        expect(created.field.widgets.map((w) => rowOf(w.ref)?.rect)).toEqual(rects);
        expect(rowOf(created.field.widgets[0]!.ref)?.color).toEqual('#000000');

        // A second button joins the group where its placement says.
        const third = await doc.forms.addWidget(created.field.ref, {
          page: toPageRef(pageObjectNumber),
          rect: { x: 100, y: 60, width: 20, height: 20 },
          exportValue: 'maybe',
        });
        if (third.field.family !== 'radio') throw new Error('expected radio');
        expect(third.field.widgets.map((w) => w.exportValue)).toEqual(['yes', 'no', 'maybe']);
        // A button needs an export value; a refused add creates nothing.
        const countBefore = (await doc.forms.list()).widgets.length;
        await expect(
          doc.forms.addWidget(created.field.ref, {
            page: toPageRef(pageObjectNumber),
            rect: { x: 140, y: 60, width: 20, height: 20 },
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const countAfter = (await doc.forms.list()).widgets.length;
        expect(countAfter).toBe(countBefore);
        expect((await doc.forms.get(created.field.ref)).widgets.length).toBe(3);

        // The newborn group fills through the normal value path.
        const filled = await doc.forms.setValue(created.field.ref, { value: 'yes' });
        if (filled.field.family !== 'radio') throw new Error('expected radio');
        expect(filled.field.value).toBe('yes');

        // update: no family needed (the ref says it); rename + conflict validation.
        await doc.forms.update(created.field.ref, { name: 'renamed_radio' });
        await expect(
          doc.forms.update(created.field.ref, { name: 'unison_radio' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        // A member another family has, or a family that isn't the field's, is refused.
        await expect(
          doc.forms.update(created.field.ref, { multiline: true }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        await expect(
          doc.forms.update(created.field.ref, { family: 'text', name: 'x' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // delete cascades: field gone and its widgets gone; meta names both.
        const before = (await doc.forms.list()).widgets;
        const removed = await doc.forms.delete(created.field.ref);
        expect(Object.keys(removed)).toEqual(['meta']);
        expect(removed.meta.changedFields).toEqual([created.field.ref]);
        expect(removed.meta.changedWidgets.length).toBe(3);
        const after = (await doc.forms.list()).widgets;
        expect(after.length).toBe(before.length - 3);
        await expect(doc.forms.get({ kind: 'fqn', name: 'renamed_radio' })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      } finally {
        await doc.close();
      }
    });

    test('a push button has a caption and an action, and holds no value', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const page = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      try {
        const { field } = await doc.forms.create({
          family: 'pushbutton',
          name: 'clear',
          widgets: [
            {
              page,
              rect: { x: 20, y: 120, width: 120, height: 28 },
              caption: 'Clear form',
              interiorColor: '#f6f8fa',
              actions: { activate: { type: 'reset-form', fields: null, exclude: false } },
            },
          ],
        });
        expect(field.family).toBe('pushbutton');
        const widget = field.widgets[0]!.ref!;
        const rowOf = async (ref: AnnotationRef) =>
          (await doc.forms.list()).widgets.find((w) => annotationKey(w.ref) === annotationKey(ref))!;
        let row = await rowOf(widget);
        expect(row).toMatchObject({
          fieldFamily: 'pushbutton',
          caption: 'Clear form',
          interiorColor: '#f6f8fa',
          hasAppearance: true,
        });
        expect(row.actions?.activate?.root?.type).toBe('reset-form');

        // A push button holds no value: the value writes refuse it.
        await expect(
          doc.forms.setValue(field.ref, { value: 'x' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        // Its field takes the settings every field has, and no family's own.
        await doc.forms.update(field.ref, { alternateName: 'Clears every field' });
        await expect(doc.forms.update(field.ref, { multiline: true })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // Its drawing is the engine's to keep: a move, new actions or the row
        // sent back keep it; a new caption draws it again.
        const moved = await doc.forms.updateWidget(widget, {
          rect: { x: 30, y: 130, width: 120, height: 28 },
        });
        const restyled = await doc.forms.updateWidget(widget, {
          actions: { focus: { type: 'reset-form', fields: null, exclude: false } },
        });
        const sentBack = await doc.forms.updateWidget(widget, { ...(await rowOf(widget)) });
        expect(
          [moved, restyled, sentBack].map((result) => result.appearance.action),
        ).toEqual(['preserved', 'preserved', 'preserved']);

        // The caption changes with the widget, and undo puts it back.
        const renamed = await doc.forms.updateWidget(widget, { caption: 'Start over' });
        expect(renamed.appearance.action).toBe('regenerated');
        expect((await rowOf(widget)).caption).toBe('Start over');
        await doc.apply({ undoOf: renamed.meta.opId });
        expect((await rowOf(widget)).caption).toBe('Clear form');
        await doc.forms.updateWidget(widget, { caption: null });
        row = await rowOf(widget);
        expect([row.caption, row.hasAppearance]).toEqual([null, true]);

        // Another widget has no caption: its row reads none, sent back it is
        // kept, and a caption is refused, on its placement too.
        const checkbox = (await doc.forms.list()).widgets.find(
          (w) => w.fieldFamily === 'checkbox',
        )!;
        expect(checkbox.caption).toBeNull();
        await doc.forms.updateWidget(checkbox.ref, { ...checkbox });
        await expect(
          doc.forms.updateWidget(checkbox.ref, { caption: 'Yes' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        await expect(
          doc.forms.create({
            family: 'text',
            name: 'captioned',
            widgets: [{ page, rect: { x: 20, y: 160, width: 120, height: 20 }, caption: 'x' }],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      } finally {
        await doc.close();
      }
    });

    test('create is one change: a rejected draft creates nothing', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const page = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      const names = async () => (await doc.forms.list()).fields.map((field) => field.name);
      const widgetCount = async () =>
        (await doc.forms.list()).widgets.filter((w) => w.page.objectNumber === page.objectNumber)
          .length;
      try {
        const namesBefore = await names();
        const widgetsBefore = await widgetCount();
        const placed = { page, rect: { x: 20, y: 100, width: 100, height: 20 } };

        // Checked before anything is written.
        await expect(
          doc.forms.create({
            family: 'text',
            name: 'rejected_text',
            maxLength: -5,
            widgets: [placed],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        await expect(
          doc.forms.create({
            family: 'text',
            name: 'rejected_text',
            widgets: [{ ...placed, page: toPageRef(999_999) }],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
        // Refused after the field exists: the whole create is undone.
        await expect(
          doc.forms.create({
            family: 'combobox',
            name: 'rejected_choice',
            options: [{ label: 'A', value: 'a' }],
            defaultValue: 'not-an-option',
            widgets: [placed],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        expect(await names()).toEqual(namesBefore);
        expect(await widgetCount()).toBe(widgetsBefore);

        // The names are still free.
        const created = await doc.forms.create({
          family: 'text',
          name: 'rejected_text',
          widgets: [placed],
        });
        expect(created.field.name).toBe('rejected_text');
        await doc.forms.delete(created.field.ref);
      } finally {
        await doc.close();
      }
    });

    test('flags, list box defaults and signature fields are written like any other member', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const page = toPageRef(opts.fixtures.toggleFields.pageObjectNumber);
      try {
        const list = await doc.forms.create({
          family: 'listbox',
          name: 'defaults_list',
          multiSelect: true,
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
            { label: 'C', value: 'c' },
          ],
          defaultValue: ['a', 'c'],
          required: true,
          widgets: [{ page, rect: { x: 20, y: 140, width: 100, height: 60 } }],
        });
        if (list.field.family !== 'listbox') throw new Error('expected listbox');
        expect(list.field.defaultValue).toEqual(['a', 'c']);
        expect(list.field).toMatchObject({ readOnly: false, required: true, noExport: false });

        // A default must be option values.
        await expect(
          doc.forms.update(list.field.ref, { defaultValue: ['z'] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // Reset selects the default.
        await doc.forms.update(list.field.ref, { defaultValue: ['b'] });
        await doc.forms.setValue(list.field.ref, { selectedValues: ['a'] });
        const reset = await doc.forms.reset(list.field.ref);
        const [restored] = reset.fields;
        if (restored?.family !== 'listbox') throw new Error('expected listbox');
        expect(restored.selectedValues).toEqual(['b']);

        // A flag left out keeps its value.
        await doc.forms.update(list.field.ref, { readOnly: true });
        expect(await doc.forms.get(list.field.ref)).toMatchObject({
          readOnly: true,
          required: true,
        });
        await doc.forms.update(list.field.ref, { required: false });
        expect(await doc.forms.get(list.field.ref)).toMatchObject({
          readOnly: true,
          required: false,
        });
        // Flags are members of their own, not one object.
        await expect(
          doc.forms.update(list.field.ref, { flags: { required: true } } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // A signature field takes the settings every field shares.
        const signature = await doc.forms.create({
          family: 'signature',
          name: 'sign_here',
          widgets: [{ page, rect: { x: 20, y: 220, width: 150, height: 40 } }],
        });
        await doc.forms.update(signature.field.ref, {
          name: 'signed_here',
          alternateName: 'Sign here',
          required: true,
        });
        const renamed = await doc.forms.get(signature.field.ref);
        expect(renamed.family).toBe('signature');
        expect(renamed.name).toBe('signed_here');
        expect(renamed.alternateName).toBe('Sign here');
        expect(renamed.required).toBe(true);
        await expect(
          doc.forms.update(signature.field.ref, { multiline: true }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        await doc.forms.delete(list.field.ref);
        await doc.forms.delete(signature.field.ref);
      } finally {
        await doc.close();
      }
    });

    test('delete removes a merged field/widget from the tree and its page in one mutation', async () => {
      // maxlen_text, opt_check and billing.name are each one dictionary that
      // is both the field and its only widget: maxlen_text is listed in
      // /AcroForm /Fields, billing.name in its parent's /Kids.
      const doc = opts.fixtures.deleteTarget
        ? await open(opts.fixtures.deleteTarget)
        : await open(opts.fixtures.toggleFields, '-delete-target');
      const placed = async () =>
        (await doc.forms.list()).widgets.flatMap((w) =>
          w.ref.kind === 'objectNumber' ? [w.ref.objectNumber] : [],
        );
      try {
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => events.push(event));
        for (const name of ['maxlen_text', 'billing.name']) {
          const field = await doc.forms.get(toFieldRef(name));
          if (field.ref.kind !== 'objectNumber') throw new Error('expected an object-number ref');
          const merged = field.ref.objectNumber;
          expect(field.widgets.map((w) => w.objectNumber)).toEqual([merged]);
          expect(await placed()).toContain(merged);

          const removed = await doc.forms.delete(field.ref);
          expect(removed.meta.changedFields).toEqual([field.ref]);
          expect(removed.meta.changedWidgets.map((w) => w.objectNumber)).toEqual([merged]);
          expect((await placed()).includes(merged)).toBe(false);
          await expect(doc.forms.get(toFieldRef(name))).rejects.toMatchObject({
            code: EngineErrorCode.NotFound,
          });
        }
        unsubscribe();
        expect(events.map((event) => event.type)).toEqual(['forms.deleted', 'forms.deleted']);

        const names = (await doc.forms.list()).fields.map((f) => f.name);
        expect(names.includes('maxlen_text') || names.includes('billing.name')).toBe(false);
        expect(names).toContain('opt_check');
      } finally {
        await doc.close();
      }
    });

    test('a merged field/widget cannot be removed from its field or deleted as an annotation', async () => {
      const doc = await open(opts.fixtures.toggleFields);
      const page = doc.page(toPageRef(opts.fixtures.toggleFields.pageObjectNumber));
      try {
        const field = await doc.forms.get(toFieldRef('opt_check'));
        const widgetRef = field.widgets[0]?.ref;
        if (field.ref.kind !== 'objectNumber' || widgetRef?.kind !== 'objectNumber') {
          throw new Error('expected object-number refs');
        }
        expect(widgetRef.objectNumber).toBe(field.ref.objectNumber);

        // Removing the field's own dictionary from itself is refused.
        const detach = await doc.forms.removeWidget(field.ref, widgetRef).then(
          () => null,
          (error: unknown) => error as { code?: unknown; message?: unknown },
        );
        expect(detach).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(detach?.message)).toMatch(/merged field\/widget/);

        // The annotation plane refuses too, and names the only verb that works.
        const remove = await page.annotations.delete(widgetRef).then(
          () => null,
          (error: unknown) => error as { code?: unknown; message?: unknown },
        );
        expect(remove).toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(String(remove?.message)).toMatch(/doc\.forms\.delete/);
        expect(String(remove?.message).includes('removeWidget')).toBe(false);

        // Both refusals left the field and its placement untouched.
        const after = await doc.forms.get(field.ref);
        expect(after.widgets.map((w) => w.objectNumber)).toEqual([widgetRef.objectNumber]);
        const { widgets } = await doc.forms.list();
        expect(
          widgets.some(
            (w) => w.ref.kind === 'objectNumber' && w.ref.objectNumber === widgetRef.objectNumber,
          ),
        ).toBe(true);
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
