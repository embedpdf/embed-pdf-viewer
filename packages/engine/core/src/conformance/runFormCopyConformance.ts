import { isPermissionRefusal } from './refusals';
import type { AnnotationResourceConformanceOptions } from './runAnnotationResourceConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { FormField } from '../forms/field';
import { annotationKey } from '../identity/annotationKey';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef, type PageRef } from '../identity/PageRef';
import { DEFAULT_BUNDLE_LIMITS } from '../transfer/bundleLimits';

/**
 * `doc.forms.copy` on both engines: a copy is a new field, named after its
 * source, with its source's settings, scripts, value and widgets, each moved.
 * A radio group's copy keeps its buttons and their values. A copy is a
 * change: one `forms.created` per field as one transaction, undone and redone
 * with `doc.apply({ undoOf })`, and refused before anything is written, past
 * the bundle's item limit too.
 */
export function runFormCopyConformance(
  runner: ConformanceTestRunner,
  options: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form copy conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /** A fresh copy of the fixture, its first page, and a blank page of another size after it. */
    const withDocument = async (
      run: (doc: DocumentHandle, page: PageRef, other: PageRef) => Promise<void>,
    ): Promise<void> => {
      const doc = await options.open(engine, 'authoring');
      try {
        const { pages } = await doc.pages.list();
        const page = toPageRef(pages[0]!.ref.objectNumber);
        const { insertedPages } = await doc.pages.insertBlank(
          { size: { width: 300, height: 500 } },
          { after: page },
        );
        await run(doc, page, insertedPages[0]!);
      } finally {
        await doc.close();
      }
    };

    const rect = (x: number, y = 100) => ({ x, y, width: 120, height: 20 });
    const OFFSET = { x: 12, y: 18 };
    /** The rows of a field's widgets, in the field's order. */
    const rowsOf = async (doc: DocumentHandle, field: FormField): Promise<WidgetAnnotation[]> => {
      const { widgets } = await doc.forms.list();
      const byKey = new Map(widgets.map((row) => [annotationKey(row.ref), row]));
      return field.widgets.map((widget) => byKey.get(annotationKey(widget.ref!))!);
    };
    const namesOf = async (doc: DocumentHandle): Promise<string[]> =>
      (await doc.forms.list()).fields.map((field) => field.name);
    const numberOf = (ref: FormFieldRef): number | null =>
      ref.kind === 'objectNumber' ? ref.objectNumber : null;

    test('a copy is a new field, named after its source, with its settings, value and look, moved', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'email',
          required: true,
          maxLength: 40,
          alternateName: 'Your email address',
          widgets: [{ page, rect: rect(40), color: '#1d4ed8', strokeWidth: 2, fontSize: 11 }],
        });
        await doc.forms.setValue(field.ref, { value: 'ada@example.com' });
        const [source] = await rowsOf(doc, field);

        const result = await doc.forms.copy([field.ref], { offset: OFFSET });

        expect(result.dropped).toEqual([]);
        expect(result.fields.length).toBe(1);
        const copy = result.fields[0]!;
        expect(result.refMap).toEqual([{ from: field.ref, to: copy.ref }]);
        expect(copy).toMatchObject({
          kind: 'text',
          name: 'email_2',
          required: true,
          maxLength: 40,
          alternateName: 'Your email address',
          value: 'ada@example.com',
        });
        expect(copy.widgets.length).toBe(1);
        // Its row is the answer's, and the form's.
        const [row] = await rowsOf(doc, copy);
        expect(result.widgets).toEqual([row]);
        expect(row).toMatchObject({
          page,
          rect: { ...source!.rect, x: source!.rect.x + OFFSET.x, y: source!.rect.y + OFFSET.y },
          color: source!.color,
          strokeWidth: source!.strokeWidth,
          fontSize: source!.fontSize,
          borderStyle: source!.borderStyle,
        });
        expect(await doc.forms.get(copy.ref)).toEqual(copy);
        expect(await namesOf(doc)).toEqual(['email', 'email_2']);
      });
    });

    test('names count up from the source’s, and a copy stays in its group', async () => {
      await withDocument(async (doc, page) => {
        const widgets = [{ page, rect: rect(40) }];
        const first = (await doc.forms.create({ kind: 'text', name: 'text_1', widgets })).field;
        const grouped = (await doc.forms.create({ kind: 'text', name: 'billing.name', widgets }))
          .field;

        const once = await doc.forms.copy([first.ref]);
        expect(once.fields.map((field) => field.name)).toEqual(['text_2']);
        // The source again: `text_2` is taken now. And a copy of the copy counts on from it.
        const again = await doc.forms.copy([first.ref, once.fields[0]!.ref]);
        expect(again.fields.map((field) => field.name)).toEqual(['text_3', 'text_4']);
        // One named twice is copied twice.
        const twice = await doc.forms.copy([grouped.ref, grouped.ref]);
        expect(twice.fields.map((field) => field.name)).toEqual([
          'billing.name_2',
          'billing.name_3',
        ]);
        expect(twice.refMap.map((pair) => pair.from)).toEqual([grouped.ref, grouped.ref]);
      });
    });

    test('values: false gives a copy no value, and it keeps its default', async () => {
      await withDocument(async (doc, page) => {
        const widgets = [{ page, rect: rect(40) }];
        const plain = (await doc.forms.create({ kind: 'text', name: 'plain', widgets })).field;
        const preset = (
          await doc.forms.create({ kind: 'text', name: 'preset', defaultValue: 'n/a', widgets })
        ).field;
        await doc.forms.setValue(plain.ref, { value: 'filled' });
        await doc.forms.setValue(preset.ref, { value: 'filled' });

        const result = await doc.forms.copy([plain.ref, preset.ref], { values: false });
        expect(
          result.fields.map((field) => field.kind === 'text' && [field.value, field.defaultValue]),
        ).toEqual([
          ['', ''],
          ['', 'n/a'],
        ]);
      });
    });

    test('a radio group’s copy keeps its buttons and their values', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'radio',
          name: 'plan',
          widgets: [
            { page, rect: { x: 40, y: 100, width: 16, height: 16 }, exportValue: 'monthly' },
            { page, rect: { x: 40, y: 130, width: 16, height: 16 }, exportValue: 'yearly' },
          ],
        });
        await doc.forms.setValue(field.ref, { value: 'yearly' });

        const result = await doc.forms.copy([field.ref], { offset: OFFSET });
        const copy = result.fields[0]!;
        expect(copy).toMatchObject({ kind: 'radio', name: 'plan_2', value: 'yearly' });
        expect(
          copy.kind === 'radio' &&
            copy.widgets.map((widget) => [widget.exportValue, widget.checked]),
        ).toEqual([
          ['monthly', false],
          ['yearly', true],
        ]);
        // The source keeps its own answer.
        expect(await doc.forms.get(field.ref)).toMatchObject({ value: 'yearly' });
      });
    });

    test('widgets names the widgets to copy, and a widget keeps its flags', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'reference',
          widgets: [
            { page, rect: rect(40, 100) },
            { page, rect: rect(40, 140) },
          ],
        });
        const other = (
          await doc.forms.create({
            kind: 'text',
            name: 'other',
            widgets: [{ page, rect: rect(40, 200) }],
          })
        ).field;
        const [, second] = await rowsOf(doc, field);
        await doc.forms.updateWidget(second!.ref, { locked: true, print: false });
        const before = await namesOf(doc);

        const result = await doc.forms.copy([field.ref], {
          widgets: [second!.ref],
          offset: OFFSET,
        });
        const [row, ...rest] = await rowsOf(doc, result.fields[0]!);
        expect(rest).toEqual([]);
        expect(row).toMatchObject({
          rect: { ...second!.rect, x: second!.rect.x + OFFSET.x, y: second!.rect.y + OFFSET.y },
          locked: true,
          print: false,
        });

        // A widget of a field that isn't copied refuses the call, with nothing written.
        const [foreign] = await rowsOf(doc, other);
        await expect(
          doc.forms.copy([field.ref], { widgets: [foreign!.ref] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(await namesOf(doc)).toEqual([...before, 'reference_2']);
      });
    });

    test('onto another page: the same spot from that page’s top-left', async () => {
      await withDocument(async (doc, page, other) => {
        const { field } = await doc.forms.create({
          kind: 'checkbox',
          name: 'agree',
          widgets: [{ page, rect: { x: 40, y: 100, width: 16, height: 16 } }],
        });
        const [source] = await rowsOf(doc, field);

        const result = await doc.forms.copy([field.ref], { page: other });
        const [row] = await rowsOf(doc, result.fields[0]!);
        expect(row).toMatchObject({ page: other, rect: source!.rect });
        expect(result.fields[0]).toMatchObject({ kind: 'checkbox', name: 'agree_2' });
      });
    });

    test('a copy keeps its script, and joins the calculation order after its source', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'total',
          actions: { calculate: { type: 'javascript', script: 'event.value = 1;' } },
          widgets: [{ page, rect: rect(40) }],
        });

        const result = await doc.forms.copy([field.ref], { offset: OFFSET });
        const copy = result.fields[0]!;
        expect(result.dropped).toEqual([]);
        expect(copy.actions?.calculate).toEqual(field.actions?.calculate);
        expect(result.calculationOrder).toEqual([field.ref, copy.ref]);
      });
    });

    test('takes the object numbers it is given', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'numbered',
          widgets: [{ page, rect: rect(40) }],
        });
        await doc.objectNumbers.reserve(2);
        const numbers = [doc.objectNumbers.take()!, doc.objectNumbers.take()!];

        const result = await doc.forms.copy([field.ref], { objectNumbers: numbers });
        const copy = result.fields[0]!;
        expect([numberOf(copy.ref), copy.widgets[0]!.objectNumber]).toEqual(numbers);

        // One number for a field and its widget names too few.
        await doc.objectNumbers.reserve(1);
        await expect(
          doc.forms.copy([field.ref], { objectNumbers: [doc.objectNumbers.take()!] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      });
    });

    test('emits one forms.created per field, as one transaction', async () => {
      await withDocument(async (doc, page) => {
        const widgets = [{ page, rect: rect(40) }];
        const refs = [
          (await doc.forms.create({ kind: 'text', name: 'one', widgets })).field.ref,
          (await doc.forms.create({ kind: 'text', name: 'two', widgets })).field.ref,
        ];
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));

        const result = await doc.forms.copy(refs, { offset: OFFSET, opId: 'copy-1' });
        expect(result.meta).toMatchObject({ opId: 'copy-1', undoable: true });
        expect(events.map((event) => event.type)).toEqual(['forms.created', 'forms.created']);
        events.forEach((event, index) => {
          expect('origin' in event && event.origin.transaction).toEqual({
            id: 'copy-1',
            index,
            count: 2,
          });
          expect(event.type === 'forms.created' && event.field).toEqual(result.fields[index]);
        });
      });
    });

    test('is undone and redone, under the same names', async () => {
      await withDocument(async (doc, page) => {
        const widgets = [{ page, rect: rect(40) }];
        const refs = [
          (await doc.forms.create({ kind: 'text', name: 'one', widgets })).field.ref,
          (await doc.forms.create({ kind: 'checkbox', name: 'two', widgets })).field.ref,
        ];
        const before = await doc.forms.list();
        const copied = await doc.forms.copy(refs, { offset: OFFSET });
        const after = await doc.forms.list();
        expect(after.fields.map((field) => field.name)).toEqual(['one', 'two', 'one_2', 'two_2']);

        const undo = await doc.apply({ undoOf: copied.meta.opId });
        expect(await doc.forms.list()).toEqual(before);
        await doc.apply({ undoOf: undo.meta.opId });
        expect(await doc.forms.list()).toEqual(after);
      });
    });

    test('refuses before anything is written', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'kept',
          widgets: [{ page, rect: rect(40) }],
        });
        const before = await doc.forms.list();
        await expect(
          doc.forms.copy([field.ref, { kind: 'fqn', name: 'missing' }]),
        ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
        await expect(doc.forms.copy([field.ref], { page: toPageRef(9999) })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
        expect(await doc.forms.list()).toEqual(before);
      });
    });

    test('a copy of more fields than a bundle holds items is refused, and writes nothing', async () => {
      await withDocument(async (doc, page) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'many',
          widgets: [{ page, rect: rect(40) }],
        });
        const before = await doc.forms.list();
        const max = DEFAULT_BUNDLE_LIMITS.items;
        const fields = Array.from({ length: max + 1 }, () => field.ref);
        await expect(doc.forms.copy(fields)).rejects.toMatchObject({
          code: EngineErrorCode.PayloadTooLarge,
          details: { limit: 'items', max, value: max + 1 },
        });
        expect(await doc.forms.list()).toEqual(before);
      });
    });

    test('needs doc.forms.modify', async () => {
      if (!options.openScoped) return;
      const filler = await options.openScoped(engine, 'authoring', [
        'doc.open',
        'doc.render',
        'doc.forms.fill',
      ]);
      try {
        const refused = await filler.forms.copy([{ kind: 'fqn', name: 'any' }]).then(
          () => null,
          (error: unknown) => error,
        );
        expect(isPermissionRefusal(refused)).toBe(true);
      } finally {
        await filler.close();
      }
    });
  });
}
