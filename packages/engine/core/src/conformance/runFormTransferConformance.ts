import type { AttributionSession } from './runAnnotationAttributionConformance';
import { isPermissionRefusal } from './refusals';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { pdfOf } from './pdfOf';
import type { Identity } from '../auth/scope';
import type { FieldScriptWrite } from '../dto/PdfAction';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { FormFieldDTO } from '../forms/field';
import type { PageBox } from '../geometry/pageSpace';
import { encodeFieldRefKey, type FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import type { Change } from '../mutation/Change';
import type { FormBundle } from '../transfer/FormBundle';

/**
 * `doc.forms.export`, `doc.forms.import` and `doc.forms.importValues` on
 * both engines. A design import copies whole fields, with their widgets,
 * values, scripts, actions and calculation order, so the copy exports as
 * its source, apart from refs, object numbers and the attribution its mode
 * writes. A values import fills fields of the same name and reports what it
 * leaves out. Both are one change each: undone and redone with
 * `doc.apply({ undoOf })`, answered again on a retry, refused before
 * anything is written.
 *
 * It runs on {@link TWO_PAGES_PDF}: two empty pages (3 and 4) and no form.
 */

export interface FormTransferConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh document of `bytes` as `session`. */
  openAs: (
    engine: Engine,
    session: AttributionSession,
    bytes: Uint8Array,
  ) => Promise<DocumentHandle>;
}

/** Two empty 300 × 300 pages (3 and 4), and no form. */
export const TWO_PAGES_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 5 0 R /Resources << >> >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 5 0 R /Resources << >> >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);

/** One empty 300 × 300 page (3), and no form. */
const ONE_PAGE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << >> >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);

const BASE = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read'] as const;
const EVERYTHING = [
  ...BASE,
  'doc.forms.fill',
  'doc.forms.modify',
  'doc.forms.script',
  'doc.forms.import',
] as const;
/** A design import without `doc.forms.script`, stamped. */
const DESIGN = [...BASE, 'doc.forms.fill', 'doc.forms.modify'] as const;
/** A values import, stamped. */
const FILL = [...BASE, 'doc.forms.fill'] as const;

const ALICE: Identity = { userId: 'alice', displayName: 'Alice Author' };
const BOB: Identity = { userId: 'bob', displayName: 'Bob Builder' };

const FIRST = toPageRef(3);
const SECOND = toPageRef(4);
const fqn = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const script = (source: string): FieldScriptWrite => ({ type: 'javascript', script: source });
const wide = (y: number): PageBox => ({ x: 20, y, width: 160, height: 24 });
const small = (x: number, y: number): PageBox => ({ x, y, width: 16, height: 16 });

/** The field names, in the source's form order. */
const SOURCE_FIELDS = [
  'customer.name',
  'agree',
  'plan',
  'country',
  'tags',
  'go',
  'sign',
  'subtotal',
  'total',
];

/** What a copy gets afresh, and so leaves out of a comparison. */
const IDENTITY_KEYS = new Set(['ref', 'objectNumber', 'nm', 'field']);
/** What the import's mode writes, checked on its own. */
const ATTRIBUTION_KEYS = new Set([
  'createdBy',
  'createdAt',
  'filledBy',
  'filledByName',
  'filledAt',
  'importedBy',
]);

export function runFormTransferConformance(
  runner: ConformanceTestRunner,
  opts: FormTransferConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form transfer conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const open = (
      identity: Identity,
      scope: readonly string[] = EVERYTHING,
      bytes: Uint8Array = TWO_PAGES_PDF,
    ) => opts.openAs(engine, { scope, identity }, bytes.slice());

    /** Run `body` with the documents it opens, closing them after. */
    const using = async (
      body: (opened: (doc: Promise<DocumentHandle>) => Promise<DocumentHandle>) => Promise<void>,
    ) => {
      const docs: DocumentHandle[] = [];
      try {
        await body(async (doc) => {
          const handle = await doc;
          docs.push(handle);
          return handle;
        });
      } finally {
        for (const doc of docs) await doc.close();
      }
    };

    /**
     * Alice's form, a field of every family on both pages: values, a
     * script, a link, a radio group across the pages, and two calculated
     * fields, the second calculated first.
     */
    const build = async (doc: DocumentHandle) => {
      const { forms } = doc;
      await forms.create({
        family: 'text',
        name: 'customer.name',
        maxLength: 40,
        actions: { validate: script('validated();') },
        widgets: [{ page: FIRST, rect: wide(240) }],
      });
      await forms.setValue(fqn('customer.name'), { value: 'Ada' });
      await forms.create({
        family: 'checkbox',
        name: 'agree',
        widgets: [{ page: FIRST, rect: small(20, 200), exportValue: 'Yes' }],
      });
      await forms.setValue(fqn('agree'), { checked: true });
      await forms.create({
        family: 'radio',
        name: 'plan',
        widgets: [
          { page: FIRST, rect: small(20, 160), exportValue: 'basic' },
          { page: SECOND, rect: small(20, 160), exportValue: 'pro' },
        ],
      });
      await forms.setValue(fqn('plan'), { value: 'pro' });
      await forms.create({
        family: 'combobox',
        name: 'country',
        options: [
          { label: 'Netherlands', value: 'NL' },
          { label: 'Belgium', value: 'BE' },
        ],
        widgets: [{ page: SECOND, rect: wide(240) }],
      });
      await forms.setValue(fqn('country'), { value: 'BE' });
      await forms.create({
        family: 'listbox',
        name: 'tags',
        multiSelect: true,
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
        ],
        widgets: [{ page: SECOND, rect: { x: 20, y: 120, width: 80, height: 60 } }],
      });
      await forms.setValue(fqn('tags'), { selectedValues: ['a', 'c'] });
      await forms.create({
        family: 'pushbutton',
        name: 'go',
        widgets: [
          {
            page: SECOND,
            rect: { x: 200, y: 240, width: 60, height: 24 },
            caption: 'Go',
            actions: { activate: { type: 'uri', uri: 'https://example.com' } },
          },
        ],
      });
      await forms.create({
        family: 'signature',
        name: 'sign',
        widgets: [{ page: SECOND, rect: { x: 200, y: 20, width: 80, height: 40 } }],
      });
      await forms.create({
        family: 'text',
        name: 'subtotal',
        actions: { calculate: script('event.value = 1;') },
        widgets: [{ page: FIRST, rect: wide(100) }],
      });
      await forms.create({
        family: 'text',
        name: 'total',
        actions: { calculate: script('event.value = 2;') },
        widgets: [{ page: FIRST, rect: wide(60) }],
      });
      await forms.reorderCalculations([fqn('total')], 'start');
    };

    /** Alice's form, exported. */
    const sourceBundle = async (
      opened: (doc: Promise<DocumentHandle>) => Promise<DocumentHandle>,
    ) => {
      const source = await opened(open(ALICE));
      await build(source);
      return source.forms.export();
    };

    const fieldOf = async (doc: DocumentHandle, name: string): Promise<FormFieldDTO> => {
      const field = (await doc.forms.list()).fields.find((f) => f.name === name);
      if (!field) throw new Error(`no field '${name}'`);
      return field;
    };

    const namesOf = async (doc: DocumentHandle) =>
      (await doc.forms.list()).fields.map((field) => field.name);

    /** The calculation order, by field name. */
    const orderOf = async (doc: DocumentHandle): Promise<string[]> => {
      const { fields, calculationOrder } = await doc.forms.list();
      return calculationOrder.map((ref) => {
        const field =
          ref && fields.find((f) => encodeFieldRefKey(f.ref) === encodeFieldRefKey(ref));
        return field ? field.name : '?';
      });
    };

    const refusalOf = (attempt: Promise<unknown>) =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    test('a design import copies every field: the copy exports as its source', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        expect(bundle.fields.map(({ data }) => data.name)).toEqual(SOURCE_FIELDS);

        const target = await opened(open(ALICE));
        const result = await target.forms.import(bundle);
        expect(result.dropped).toEqual([]);
        expect(result.meta.undoable).toBe(true);
        expect(result.fields.map((field) => field.name)).toEqual(SOURCE_FIELDS);
        expect(result.refMap.map(({ from }) => from)).toEqual(
          bundle.fields.map(({ data }) => data.ref),
        );
        expect(result.refMap.map(({ to }) => to)).toEqual(result.fields.map((field) => field.ref));
        expect(comparable(await target.forms.export())).toEqual(comparable(bundle));
        expect(await orderOf(target)).toEqual(['total', 'subtotal']);
      });
    });

    test('an export takes whole fields: by name, or every field with a widget on a page', async () => {
      await using(async (opened) => {
        const source = await opened(open(ALICE));
        await build(source);
        const named = await source.forms.export({ fields: [fqn('plan'), fqn('agree')] });
        // In the form's order, each with every widget it has, wherever it is.
        expect(named.fields.map(({ data }) => data.name)).toEqual(['agree', 'plan']);
        expect(named.widgets).toHaveLength(3);
        expect(named.pages.map(({ page }) => page)).toEqual([FIRST, SECOND]);

        const onSecond = await source.forms.export({ pages: [SECOND] });
        expect(onSecond.fields.map(({ data }) => data.name)).toEqual([
          'plan',
          'country',
          'tags',
          'go',
          'sign',
        ]);
        await expect(source.forms.export({ fields: [fqn('nothing')] })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      });
    });

    test("restore writes the source's attribution and the importer; stamp makes the fields the session's", async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);

        const restored = await opened(open(BOB));
        await restored.forms.import(bundle);
        const copied = await fieldOf(restored, 'customer.name');
        expect(copied).toMatchObject({
          createdBy: 'alice',
          filledBy: 'alice',
          filledByName: 'Alice Author',
          importedBy: 'bob',
        });
        const source = bundle.fields.find(({ data }) => data.name === 'customer.name')!.data;
        expect(copied.createdAt).toBe(source.createdAt);
        expect(copied.filledAt).toBe(source.filledAt);
        expect(await fieldOf(restored, 'go')).toMatchObject({ createdBy: 'alice', filledBy: null });

        const stamped = await opened(open(BOB));
        await stamped.forms.import(bundle, { attribution: 'stamp' });
        expect(await fieldOf(stamped, 'customer.name')).toMatchObject({
          createdBy: 'bob',
          filledBy: 'bob',
          filledByName: 'Bob Builder',
          importedBy: null,
        });
      });
    });

    test('restoring needs doc.forms.import; stamping needs only what a create needs', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(BOB, [...DESIGN, 'doc.forms.script']));
        expect(isPermissionRefusal(await refusalOf(target.forms.import(bundle)))).toBe(true);
        expect(isPermissionRefusal(await refusalOf(target.forms.importValues(bundle)))).toBe(true);
        expect(await namesOf(target)).toEqual([]);

        const stamped = await target.forms.import(bundle, { attribution: 'stamp' });
        expect(stamped.fields).toHaveLength(SOURCE_FIELDS.length);

        const filler = await opened(open(BOB, FILL));
        expect(
          isPermissionRefusal(
            await refusalOf(filler.forms.import(bundle, { attribution: 'stamp' })),
          ),
        ).toBe(true);
      });
    });

    test('without doc.forms.script, scripts, submits and links are left out; the rest is copied', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(BOB, DESIGN));
        const result = await target.forms.import(bundle, { attribution: 'stamp' });
        expect(result.fields.map((field) => field.name)).toEqual(SOURCE_FIELDS);
        const left = result.dropped.map(({ ref, widget, field, reason }) => ({
          name: bundle.fields.find(
            ({ data }) => encodeFieldRefKey(data.ref) === encodeFieldRefKey(ref!),
          )?.data.name,
          widget: widget !== undefined,
          field,
          reason,
        }));
        expect(left).toEqual([
          {
            name: 'customer.name',
            widget: false,
            field: 'actions.validate',
            reason: 'script-not-allowed',
          },
          { name: 'go', widget: true, field: 'actions.activate', reason: 'script-not-allowed' },
          {
            name: 'subtotal',
            widget: false,
            field: 'actions.calculate',
            reason: 'script-not-allowed',
          },
          {
            name: 'total',
            widget: false,
            field: 'actions.calculate',
            reason: 'script-not-allowed',
          },
        ]);
        expect((await fieldOf(target, 'customer.name')).actions?.validate ?? null).toBeNull();
        // Without their calculate scripts, the copies have no place in the order.
        expect(await orderOf(target)).toEqual([]);
      });
    });

    test('pages map: as they are by default, or as a list says; a page that maps nowhere refuses', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const swapped = await opened(open(ALICE));
        const result = await swapped.forms.import(bundle, {
          pages: [
            { from: FIRST, to: SECOND },
            { from: SECOND, to: FIRST },
          ],
        });
        const plan = result.fields.find((field) => field.name === 'plan')!;
        expect(plan.widgets.map((widget) => widget.page)).toEqual([SECOND, FIRST]);

        const short = await opened(open(ALICE, EVERYTHING, ONE_PAGE_PDF));
        const events: DocumentEvent[] = [];
        short.events.subscribe((event) => events.push(event));
        await expect(short.forms.import(bundle)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        expect(await namesOf(short)).toEqual([]);
        expect(events).toEqual([]);
      });
    });

    test('a field whose name is taken is left out, and so is one that would be its parent or child', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        await target.forms.create({ family: 'text', name: 'agree' });
        await target.forms.create({ family: 'text', name: 'customer' });
        await target.forms.create({ family: 'text', name: 'go.now' });
        const result = await target.forms.import(bundle);
        const conflicts = result.dropped
          .filter(({ reason }) => reason === 'name-conflict')
          .map(({ ref }) => encodeFieldRefKey(ref!));
        const names = new Map(
          bundle.fields.map(({ data }) => [encodeFieldRefKey(data.ref), data.name]),
        );
        expect(conflicts.map((key) => names.get(key))).toEqual(['customer.name', 'agree', 'go']);
        expect(result.fields.map((field) => field.name)).toEqual(
          SOURCE_FIELDS.filter((name) => !['customer.name', 'agree', 'go'].includes(name)),
        );
      });
    });

    test("the calculation order of the copies follows the form's own, as the bundle has it", async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        await target.forms.create({
          family: 'text',
          name: 'own',
          actions: { calculate: script('event.value = 0;') },
        });
        const result = await target.forms.import(bundle);
        expect(await orderOf(target)).toEqual(['own', 'total', 'subtotal']);
        expect(result.calculationOrder).toHaveLength(3);
      });
    });

    test('a signature never travels: a signature field is copied unsigned', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const sign = bundle.fields.find(({ data }) => data.name === 'sign')!.data;
        expect(sign.valueEntry).toEqual({ kind: 'none' });
        // A field the form doesn't export goes without its value or its filler.
        const source = await opened(open(ALICE));
        await build(source);
        await source.forms.update(fqn('customer.name'), { noExport: true });
        const [name] = (await source.forms.export({ fields: [fqn('customer.name')] })).fields;
        expect(name!.data).toMatchObject({
          value: '',
          valueEntry: { kind: 'none' },
          filledBy: null,
          filledAt: null,
        });
      });
    });

    test('a values import fills the fields of the same name, and reports what it leaves out', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(BOB));
        await target.forms.import(bundle, { attribution: 'stamp', values: false });
        expect((await fieldOf(target, 'customer.name')).valueEntry).toEqual({ kind: 'none' });

        const rows = bundle.fields.map(({ data }) => data);
        const row = (name: string) => rows.find((data) => data.name === name)!;
        const values: FormBundle = {
          ...bundle,
          fields: [
            { data: row('customer.name') },
            // No field of that name.
            { data: { ...row('agree'), name: 'missing' } },
            // A text value for the checkbox.
            { data: { ...row('customer.name'), name: 'agree' } },
            // An option the dropdown doesn't have.
            {
              data: { ...row('country'), value: 'FR', valueEntry: { kind: 'scalar', value: 'FR' } },
            },
            { data: row('tags') },
          ] as FormBundle['fields'],
        };
        const result = await target.forms.importValues(values, { attribution: 'restore' });
        expect(result.fields.map((field) => field.name)).toEqual(['customer.name', 'tags']);
        expect(result.dropped.map(({ reason }) => reason)).toEqual([
          'no-field',
          'wrong-family',
          'value-not-allowed',
        ]);
        expect(await fieldOf(target, 'customer.name')).toMatchObject({
          value: 'Ada',
          filledBy: 'alice',
          importedBy: 'bob',
        });
        expect(await fieldOf(target, 'tags')).toMatchObject({ selectedValues: ['a', 'c'] });
        expect(await fieldOf(target, 'country')).toMatchObject({ value: '' });
      });
    });

    test('a design import is undone and redone: fields, widgets and calculation order back exactly', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        await target.forms.create({
          family: 'text',
          name: 'own',
          actions: { calculate: script('event.value = 0;') },
        });
        const before = await target.forms.list();
        const imported = await target.forms.import(bundle);
        const after = await target.forms.list();

        const undo = await target.apply({ undoOf: imported.meta.opId });
        expect(undo.items.map((item) => item.type)).toEqual(
          SOURCE_FIELDS.map(() => 'forms.delete'),
        );
        expect(await target.forms.list()).toEqual(before);

        await target.apply({ undoOf: undo.meta.opId });
        const redone = await target.forms.list();
        expect(redone.fields).toEqual(after.fields);
        expect(redone.calculationOrder).toEqual(after.calculationOrder);
        expect(await orderOf(target)).toEqual(['own', 'total', 'subtotal']);
      });
    });

    test('a values import is undone and redone: values and who filled them back', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(BOB));
        await target.forms.import(bundle, { attribution: 'stamp', values: false });
        await target.forms.setValue(fqn('customer.name'), { value: 'Bob' });

        const filled = await target.forms.importValues(bundle);
        expect(filled.meta.undoable).toBe(true);
        expect(await fieldOf(target, 'customer.name')).toMatchObject({
          value: 'Ada',
          filledBy: 'alice',
        });

        const undo = await target.apply({ undoOf: filled.meta.opId });
        expect(await fieldOf(target, 'customer.name')).toMatchObject({
          value: 'Bob',
          filledBy: 'bob',
        });
        expect((await fieldOf(target, 'agree')).valueEntry).toEqual({ kind: 'none' });

        await target.apply({ undoOf: undo.meta.opId });
        expect(await fieldOf(target, 'customer.name')).toMatchObject({
          value: 'Ada',
          filledBy: 'alice',
          importedBy: 'bob',
        });
        expect(await fieldOf(target, 'agree')).toMatchObject({ checked: true });
      });
    });

    test('an imported field changed since is left alone by the undo; the rest goes', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        const imported = await target.forms.import(bundle);
        await target.forms.update(fqn('country'), { required: true });

        const undo = await target.apply({ undoOf: imported.meta.opId });
        expect(undo.items.filter((item) => item.type === 'skipped')).toHaveLength(1);
        expect(await namesOf(target)).toEqual(['country']);
      });
    });

    test('a retry under the same opId answers again and writes nothing more', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        const first = await target.forms.import(bundle, { opId: 'form-import-retry' });
        const again = await target.forms.import(bundle, { opId: 'form-import-retry' });
        expect(again.refMap).toEqual(first.refMap);
        expect(await namesOf(target)).toEqual(SOURCE_FIELDS);

        const values = await target.forms.importValues(bundle, { opId: 'form-values-retry' });
        const valuesAgain = await target.forms.importValues(bundle, { opId: 'form-values-retry' });
        expect(valuesAgain.fields).toEqual(values.fields);
      });
    });

    test('each import is one transaction: one event per field, sharing its opId', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        const events: DocumentEvent[] = [];
        target.events.subscribe((event) => events.push(event));

        const imported = await target.forms.import(bundle, { opId: 'form-import-1' });
        const created = events.filter((event) => event.type === 'forms.created');
        expect(created).toHaveLength(SOURCE_FIELDS.length);
        created.forEach((event, index) => {
          if (event.type !== 'forms.created') return;
          expect(event.field).toEqual(imported.fields[index]);
          expect(event.origin.tx).toEqual({
            id: 'form-import-1',
            index,
            count: SOURCE_FIELDS.length,
          });
        });

        events.length = 0;
        await target.forms.setValue(fqn('customer.name'), { value: 'Changed' });
        await target.forms.setValue(fqn('agree'), { checked: false });
        events.length = 0;
        const filled = await target.forms.importValues(bundle, { opId: 'form-values-1' });
        const set = events.filter((event) => event.type === 'forms.valueSet');
        expect(set.map((event) => event.type === 'forms.valueSet' && event.field.name)).toEqual(
          filled.fields.map((field) => field.name),
        );
        expect(filled.fields.map((field) => field.name)).toEqual(['customer.name', 'agree']);
      });
    });

    test('refuses before writing: a malformed bundle, and doc.apply takes no import', async () => {
      await using(async (opened) => {
        const bundle = await sourceBundle(opened);
        const target = await opened(open(ALICE));
        const broken = { ...bundle, format: 'embedpdf/annotations' } as unknown as FormBundle;
        await expect(target.forms.import(broken)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        const strayWidget = { ...bundle, fields: bundle.fields.slice(1) };
        const result = await target.forms.import(strayWidget, { attribution: 'stamp' });
        expect(result.dropped.filter(({ reason }) => reason === 'no-field')).toHaveLength(1);

        const change = { ops: [{ type: 'forms.import', bundle, attribution: 'restore' }] };
        const refused = await refusalOf(target.apply(change as unknown as Change));
        expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
      });
    });
  });
}

/**
 * A bundle as two documents can agree on it: without what a copy gets
 * afresh (refs, object numbers, names) or what the import's mode writes
 * (attribution), and the calculation order by field name. Page refs stay:
 * both documents are {@link TWO_PAGES_PDF}.
 */
function comparable(bundle: FormBundle) {
  const nameOf = new Map(bundle.fields.map(({ data }) => [encodeFieldRefKey(data.ref), data.name]));
  const strip = (value: unknown, key?: string): unknown => {
    if (key === 'page') return value;
    if (Array.isArray(value)) return value.map((item) => strip(item));
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([inner]) => !IDENTITY_KEYS.has(inner) && !ATTRIBUTION_KEYS.has(inner))
        .map(([inner, nested]) => [inner, strip(nested, inner)]),
    );
  };
  return {
    pages: bundle.pages,
    fields: bundle.fields.map(({ data }) => strip(data)),
    widgets: bundle.widgets.map(({ data }) => strip(data)),
    calculationOrder: bundle.calculationOrder.map((ref) => nameOf.get(encodeFieldRefKey(ref))),
  };
}
