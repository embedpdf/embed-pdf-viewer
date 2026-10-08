import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { PageBox } from '../geometry/pageSpace';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import {
  isSkippedItem,
  type ChangeItem,
  type ChangeItemType,
  type ChangeOp,
  type ChangeResult,
  type SkippedChangeItem,
} from '../mutation/Change';

/**
 * Two pages and a form. The first page holds, from the file: a blue square
 * by Ann (object 5); Ann's note (6) with its popup (7) and Bea's reply to it
 * (8); and a merged text field and widget `name` with the value `Ann` (9).
 * The second page is empty. Both share an empty content stream (10).
 */
export const CHANGE_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [9 0 R] /DA (/Helv 0 Tf 0 g) ' +
    '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 10 0 R /Resources << >> ' +
    '/Annots [5 0 R 6 0 R 7 0 R 8 0 R 9 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 10 0 R /Resources << >> >>',
  '<< /Type /Annot /Subtype /Square /Rect [20 200 80 260] /C [0 0 1] /T (Ann) /P 3 0 R >>',
  '<< /Type /Annot /Subtype /Text /Rect [120 220 140 240] /Contents (Note) /T (Ann) ' +
    '/Popup 7 0 R /P 3 0 R >>',
  '<< /Type /Annot /Subtype /Popup /Rect [150 180 250 240] /Parent 6 0 R /P 3 0 R >>',
  '<< /Type /Annot /Subtype /Text /Rect [120 220 140 240] /Contents (Reply) /T (Bea) ' +
    '/IRT 6 0 R /P 3 0 R >>',
  '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Ann) /Rect [20 20 180 44] /P 3 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);

/** A one-page PDF to draw into a signature field. */
const SIGNATURE_ARTWORK_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 40] /Contents 4 0 R >>',
  '<< /Length 20 >>\nstream\n0 0 1 rg 0 0 120 40 re f\nendstream',
]);

const PAGE = toPageRef(3);
const EMPTY_PAGE = toPageRef(4);
const at = (objectNumber: number, page = PAGE): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  objectNumber,
});
const FILE_SQUARE = at(5);
const FILE_NOTE = at(6);
const FILE_POPUP = at(7);
const FILE_REPLY = at(8);
const FILE_WIDGET = at(9);
const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };

const BLUE = '#0000ff';
const box = (x: number, y = 120): PageBox => ({ x, y, width: 40, height: 30 });

export interface ChangeConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link CHANGE_FIXTURE_PDF}, fresh for each call, with write access. */
  open: (engine: Engine) => Promise<DocumentHandle>;
  /**
   * Open the document `doc` is on as another user, with write access. A local
   * session has one user, so without it the test of who may undo is skipped.
   */
  openAsAnotherUser?: (engine: Engine, doc: DocumentHandle) => Promise<DocumentHandle>;
}

/** Object numbers the round trips may name, taken from the document's pool. */
type Numbers = readonly number[];

/**
 * One op type's round trip: the state `setup` builds (nothing without it),
 * then a change of `ops`, its undo, and the undo's undo.
 */
interface RoundTrip {
  readonly setup?: (numbers: Numbers) => ChangeOp[];
  readonly ops: (numbers: Numbers) => ChangeOp[];
}

/**
 * A round trip for every op type. Keyed by the type, so a new op without one
 * doesn't compile: every op must have an exact reverse.
 */
const ROUND_TRIPS: { readonly [T in ChangeOp['type']]: RoundTrip } = {
  'annotations.create': {
    ops: ([square]) => [
      {
        type: 'annotations.create',
        page: EMPTY_PAGE,
        data: { subtype: 'square', box: box(20), color: '#e11d48' },
        objectNumber: square,
      },
    ],
  },
  'annotations.update': {
    ops: () => [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
  },
  'annotations.delete': {
    // The note goes with its popup and its reply.
    ops: () => [{ type: 'annotations.delete', ref: FILE_NOTE }],
  },
  'annotations.reorder': {
    ops: () => [
      {
        type: 'annotations.reorder',
        page: PAGE,
        refs: [FILE_SQUARE],
        position: { after: FILE_REPLY },
      },
    ],
  },
  'forms.setValue': {
    ops: () => [{ type: 'forms.setValue', field: NAME, value: { value: 'Bea' } }],
  },
  'forms.setDisplay': {
    ops: () => [{ type: 'forms.setDisplay', field: NAME, display: 'hidden' }],
  },
  'forms.setAppearanceText': {
    ops: () => [{ type: 'forms.setAppearanceText', field: NAME, text: 'ANN' }],
  },
  'forms.reset': {
    ops: () => [{ type: 'forms.reset', fields: [NAME] }],
  },
  'forms.create': {
    ops: () => [
      {
        type: 'forms.create',
        draft: {
          family: 'text',
          name: 'email',
          widgets: [{ page: EMPTY_PAGE, rect: { x: 20, y: 20, width: 140, height: 24 } }],
        },
      },
    ],
  },
  'forms.update': {
    ops: () => [{ type: 'forms.update', field: NAME, patch: { required: true, name: 'fullName' } }],
  },
  'forms.delete': {
    ops: () => [{ type: 'forms.delete', field: NAME }],
  },
  'forms.addWidget': {
    // The field is merged with its widget, so the new widget splits it.
    ops: () => [
      {
        type: 'forms.addWidget',
        field: NAME,
        placement: { page: EMPTY_PAGE, rect: { x: 20, y: 60, width: 160, height: 24 } },
      },
    ],
  },
  'forms.removeWidget': {
    setup: ([widget]) => [
      {
        type: 'forms.addWidget',
        field: NAME,
        placement: { page: EMPTY_PAGE, rect: { x: 20, y: 60, width: 160, height: 24 } },
        objectNumber: widget,
      },
    ],
    ops: ([widget]) => [
      { type: 'forms.removeWidget', field: NAME, widget: at(widget!, EMPTY_PAGE) },
    ],
  },
  'forms.deleteWidget': {
    // One of a field's two widgets goes; the undo brings it back into the field.
    setup: ([field, left, right]) => [
      {
        type: 'forms.create',
        draft: {
          family: 'text',
          name: 'email',
          widgets: [
            { page: PAGE, rect: { x: 20, y: 60, width: 140, height: 24 } },
            { page: PAGE, rect: { x: 20, y: 100, width: 140, height: 24 } },
          ],
        },
        objectNumber: field,
        widgetObjectNumbers: [left!, right!],
      },
    ],
    ops: ([, , right]) => [{ type: 'forms.deleteWidget', widget: at(right!) }],
  },
  'forms.reorderWidgets': {
    // The file's widget goes on top of two new ones.
    setup: ([field, left, right]) => [
      {
        type: 'forms.create',
        draft: {
          family: 'text',
          name: 'email',
          widgets: [
            { page: PAGE, rect: { x: 20, y: 60, width: 140, height: 24 } },
            { page: PAGE, rect: { x: 20, y: 100, width: 140, height: 24 } },
          ],
        },
        objectNumber: field,
        widgetObjectNumbers: [left!, right!],
      },
    ],
    ops: ([, , right]) => [
      {
        type: 'forms.reorderWidgets',
        page: PAGE,
        widgets: [FILE_WIDGET],
        position: { after: at(right!) },
      },
    ],
  },
  'forms.updateWidget': {
    ops: () => [
      {
        type: 'forms.updateWidget',
        widget: FILE_WIDGET,
        patch: { rect: { x: 20, y: 250, width: 200, height: 30 }, color: '#e11d48' },
      },
    ],
  },
  'forms.setSignatureAppearance': {
    setup: () => [
      {
        type: 'forms.create',
        draft: {
          family: 'signature',
          name: 'signature',
          widgets: [{ page: EMPTY_PAGE, rect: { x: 20, y: 100, width: 120, height: 40 } }],
        },
      },
    ],
    ops: () => [
      {
        type: 'forms.setSignatureAppearance',
        field: { kind: 'fqn', name: 'signature' },
        appearance: { pdf: SIGNATURE_ARTWORK_PDF },
      },
    ],
  },
  'metadata.update': {
    ops: () => [{ type: 'metadata.update', patch: { title: 'Changed', subject: 'Undo' } }],
  },
  'metadata.updateCustom': {
    ops: () => [{ type: 'metadata.updateCustom', patch: { project: 'apply' } }],
  },
};

/**
 * `doc.apply`, one user action as one change:
 *
 * - The ops apply in order, all or none, as one write: one `opId`, one burst
 *   of events sharing it. Later ops name what earlier ones create, by the
 *   numbers the creates were given.
 * - `{ undoOf }` reverses a change as the engine recorded it, op by op in
 *   reverse order, where the document still shows what the change set; what
 *   it leaves alone is reported as `skipped`. Every op type round-trips:
 *   undo gives exactly the state before, the undo's undo the state after.
 * - A deleted annotation comes back as the same objects, with the layer's
 *   edits, its popup and its replies.
 * - `expect` refuses a change whose assumption doesn't hold.
 * - Every answer is kept under its `opId`, refusals included: asking again
 *   answers the same, and a different change under it is refused.
 * - A redaction apply ends undo for the changes before it.
 */
export function runChangeConformance(
  runner: ConformanceTestRunner,
  opts: ChangeConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`change conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDocument = async (body: (doc: DocumentHandle) => Promise<void>) => {
      const doc = await opts.open(engine);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const take = async (doc: DocumentHandle, count: number): Promise<number[]> => {
      await doc.objectNumbers.reserve(count);
      return Array.from({ length: count }, () => doc.objectNumbers.take()!);
    };

    /** Everything a change can write, as the document reads it. */
    const factsOf = async (doc: DocumentHandle) => {
      const [onPage, onEmptyPage, form, metadata, custom] = await Promise.all([
        doc.page(PAGE).annotations.list(),
        doc.page(EMPTY_PAGE).annotations.list(),
        doc.forms.list(),
        doc.metadata.get(),
        doc.metadata.custom.get(),
      ]);
      return {
        annotations: [onPage.annotations, onEmptyPage.annotations],
        fields: form.fields,
        widgets: form.widgets,
        metadata: { title: metadata.title, subject: metadata.subject },
        custom,
      };
    };

    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

    const colorOf = async (doc: DocumentHandle, ref: AnnotationRef) => {
      const { annotations } = await doc.page(PAGE).annotations.list();
      const found = annotations.find(
        (annotation) =>
          annotation.ref.kind === 'objectNumber' &&
          ref.kind === 'objectNumber' &&
          annotation.ref.objectNumber === ref.objectNumber,
      );
      return found && 'color' in found ? found.color : undefined;
    };

    const recordEvents = (doc: DocumentHandle) => {
      const events: DocumentEvent[] = [];
      const stop = doc.events.subscribe((event) => events.push(event));
      return { events, stop };
    };

    const txOf = (event: DocumentEvent) => ('origin' in event ? event.origin.tx : undefined);

    /** The item of `type` a result holds, applied or left alone. */
    const itemOfType = <T extends ChangeItemType>(
      result: ChangeResult,
      type: T,
    ): Extract<ChangeItem, { type: T }> | SkippedChangeItem => {
      const item = result.items.find((candidate) =>
        isSkippedItem(candidate) ? candidate.op === type : candidate.type === type,
      );
      if (!item) throw new Error(`no ${type} item`);
      return item as Extract<ChangeItem, { type: T }> | SkippedChangeItem;
    };

    /** The applied item of `type` a result holds. */
    const appliedOfType = <T extends ChangeItemType>(
      result: ChangeResult,
      type: T,
    ): Extract<ChangeItem, { type: T }> => {
      const item = itemOfType(result, type);
      if (isSkippedItem(item)) throw new Error(`${type} was left alone`);
      return item as Extract<ChangeItem, { type: T }>;
    };

    for (const [type, trip] of Object.entries(ROUND_TRIPS) as [ChangeOp['type'], RoundTrip][]) {
      test(`${type}: undo gives the state before, the undo's undo the state after`, async () => {
        await withDocument(async (doc) => {
          const numbers = await take(doc, 4);
          if (trip.setup) await doc.apply({ ops: trip.setup(numbers) });
          const before = await factsOf(doc);

          const applied = await doc.apply({ ops: trip.ops(numbers) });
          expect(applied.meta.undoable).toBe(true);
          expect(applied.items.map((item) => item.type)).toEqual([type]);
          const after = await factsOf(doc);
          expect(same(after, before)).toBe(false);

          const undo = await doc.apply({ undoOf: applied.meta.opId });
          expect(undo.meta.undoable).toBe(true);
          expect(undo.items.some((item) => isSkippedItem(item) || 'skipped' in item)).toBe(false);
          expect(await factsOf(doc)).toEqual(before);

          await doc.apply({ undoOf: undo.meta.opId });
          expect(await factsOf(doc)).toEqual(after);
        });
      });
    }

    test('ops apply in order as one write; a later op names an earlier create', async () => {
      await withDocument(async (doc) => {
        const [square] = await take(doc, 1);
        const recorded = recordEvents(doc);
        const result = await doc.apply(
          {
            ops: [
              {
                type: 'annotations.create',
                page: EMPTY_PAGE,
                data: { subtype: 'square', box: box(20) },
                objectNumber: square,
              },
              {
                type: 'annotations.update',
                ref: at(square!, EMPTY_PAGE),
                patch: { color: '#e11d48' },
              },
              { type: 'forms.setValue', field: NAME, value: { value: 'Bea' } },
            ],
          },
          { opId: 'change-conformance-order' },
        );
        recorded.stop();

        expect(result.meta.opId).toBe('change-conformance-order');
        expect(result.meta.undoable).toBe(true);
        expect(result.items.map((item) => item.type)).toEqual([
          'annotations.create',
          'annotations.update',
          'forms.setValue',
        ]);
        const update = appliedOfType(result, 'annotations.update');
        expect(update.annotation.ref).toEqual(at(square!, EMPTY_PAGE));
        expect('color' in update.annotation && update.annotation.color).toBe('#e11d48');

        // One burst: each op's events in op order, all carrying the change's opId.
        expect(recorded.events.map((event) => event.type)).toEqual([
          'annotations.created',
          'annotations.updated',
          'forms.valueSet',
        ]);
        expect(recorded.events.map(txOf)).toEqual([
          { id: 'change-conformance-order', index: 0, count: 3 },
          { id: 'change-conformance-order', index: 1, count: 3 },
          { id: 'change-conformance-order', index: 2, count: 3 },
        ]);
      });
    });

    test('a reply can answer a note created earlier in the same change', async () => {
      await withDocument(async (doc) => {
        const [note, reply] = await take(doc, 2);
        const result = await doc.apply({
          ops: [
            {
              type: 'annotations.create',
              page: EMPTY_PAGE,
              data: { subtype: 'text', rect: box(20), contents: 'Question' },
              objectNumber: note,
            },
            {
              type: 'annotations.create',
              page: EMPTY_PAGE,
              data: {
                subtype: 'text',
                rect: box(20),
                contents: 'Answer',
                reply: { to: at(note!, EMPTY_PAGE) },
              },
              objectNumber: reply,
            },
          ],
        });
        const created = result.items.filter((item) => item.type === 'annotations.create');
        const answer = created[1];
        if (!answer || isSkippedItem(answer) || answer.type !== 'annotations.create') {
          throw new Error('expected a create');
        }
        expect(answer.annotation.reply?.to).toEqual(at(note!, EMPTY_PAGE));
      });
    });

    test('a failing op leaves nothing: no write, no events', async () => {
      await withDocument(async (doc) => {
        const [square] = await take(doc, 1);
        const before = await factsOf(doc);
        const recorded = recordEvents(doc);
        await expect(
          doc.apply({
            ops: [
              {
                type: 'annotations.create',
                page: PAGE,
                data: { subtype: 'square', box: box(20) },
                objectNumber: square,
              },
              { type: 'annotations.update', ref: at(4000), patch: { color: '#e11d48' } },
            ],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
        recorded.stop();
        expect(recorded.events).toHaveLength(0);
        expect(await factsOf(doc)).toEqual(before);
      });
    });

    test('an empty change writes nothing and is not undoable', async () => {
      await withDocument(async (doc) => {
        const recorded = recordEvents(doc);
        const result = await doc.apply({ ops: [] });
        recorded.stop();
        expect(result.items).toEqual([]);
        expect(result.meta.undoable).toBe(false);
        expect(recorded.events).toHaveLength(0);
      });
    });

    test('two writes to one field undo in reverse order, back to the first value', async () => {
      await withDocument(async (doc) => {
        const [square] = await take(doc, 1);
        const before = await factsOf(doc);
        const result = await doc.apply({
          ops: [
            { type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#00ff00' } },
            { type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#ffff00' } },
            {
              type: 'annotations.create',
              page: PAGE,
              data: { subtype: 'square', box: box(140) },
              objectNumber: square,
            },
            { type: 'annotations.update', ref: at(square!), patch: { color: '#e11d48' } },
          ],
        });
        await doc.apply({ undoOf: result.meta.opId });
        // The square's create is undone after its update, so the guarded
        // delete sees it as it was created.
        expect(await factsOf(doc)).toEqual(before);
      });
    });

    test("undo leaves a colleague's later change alone and reports it", async () => {
      await withDocument(async (doc) => {
        const mine = await doc.apply({
          ops: [
            {
              type: 'annotations.update',
              ref: FILE_SQUARE,
              patch: { color: '#e11d48', contents: 'Mine' },
            },
          ],
        });
        await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#00ff00' } }],
        });
        const undo = await doc.apply({ undoOf: mine.meta.opId });
        const update = appliedOfType(undo, 'annotations.update');
        expect(update.skipped).toEqual(['color']);
        expect(await colorOf(doc, FILE_SQUARE)).toBe('#00ff00');
        const { annotations } = await doc.page(PAGE).annotations.list();
        const square = annotations.find(
          (annotation) =>
            annotation.ref.kind === 'objectNumber' && annotation.ref.objectNumber === 5,
        )!;
        expect(square.contents).toBe(null);
      });
    });

    test('undo goes by value: a field set back to what the change set is undone', async () => {
      await withDocument(async (doc) => {
        const mine = await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: BLUE } }],
        });
        await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        const undo = await doc.apply({ undoOf: mine.meta.opId });
        expect(appliedOfType(undo, 'annotations.update').skipped).toBe(undefined);
        expect(await colorOf(doc, FILE_SQUARE)).toBe(BLUE);
      });
    });

    test("undo of a field's properties puts back each one still holding what it set", async () => {
      await withDocument(async (doc) => {
        const mine = await doc.apply({
          ops: [{ type: 'forms.update', field: NAME, patch: { required: true, noExport: true } }],
        });
        // A colleague fills the field in, which writes its dictionary, and
        // changes one of the same properties.
        await doc.apply({
          ops: [{ type: 'forms.setValue', field: NAME, value: { value: 'Bea' } }],
        });
        await doc.apply({
          ops: [{ type: 'forms.update', field: NAME, patch: { noExport: false } }],
        });

        const undo = await doc.apply({ undoOf: mine.meta.opId });
        expect(appliedOfType(undo, 'forms.update').skipped).toEqual(['noExport']);
        const undone = await doc.forms.get(NAME);
        expect(undone.required).toBe(false);
        expect(undone.noExport).toBe(false);
        expect(undone.family === 'text' && undone.value).toBe('Bea');

        // The undo's undo makes it required again, and leaves the rest.
        await doc.apply({ undoOf: undo.meta.opId });
        const redone = await doc.forms.get(NAME);
        expect(redone.required).toBe(true);
        expect(redone.noExport).toBe(false);
        expect(redone.family === 'text' && redone.value).toBe('Bea');
      });
    });

    test('expect refuses the whole change with ChangeConflict', async () => {
      await withDocument(async (doc) => {
        const before = await factsOf(doc);
        await expect(
          doc.apply({
            ops: [
              { type: 'forms.setValue', field: NAME, value: { value: 'Bea' } },
              {
                type: 'annotations.update',
                ref: FILE_SQUARE,
                patch: { color: '#e11d48' },
                expect: { color: '#ff0000' },
              },
            ],
          }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.ChangeConflict,
          details: { opIndex: 1, fields: ['color'] },
        });
        expect(await factsOf(doc)).toEqual(before);
      });
    });

    test('the undo of a create is skipped when someone replied to it', async () => {
      await withDocument(async (doc) => {
        const [note, reply] = await take(doc, 2);
        const mine = await doc.apply({
          ops: [
            {
              type: 'annotations.create',
              page: EMPTY_PAGE,
              data: { subtype: 'text', rect: box(20), contents: 'Question' },
              objectNumber: note,
            },
          ],
        });
        await doc.apply({
          ops: [
            {
              type: 'annotations.create',
              page: EMPTY_PAGE,
              data: {
                subtype: 'text',
                rect: box(20),
                contents: 'Answer',
                reply: { to: at(note!, EMPTY_PAGE) },
              },
              objectNumber: reply,
            },
          ],
        });
        const undo = await doc.apply({ undoOf: mine.meta.opId });
        expect(isSkippedItem(itemOfType(undo, 'annotations.delete'))).toBe(true);
        const { annotations } = await doc.page(EMPTY_PAGE).annotations.list();
        expect(annotations).toHaveLength(2);
      });
    });

    test('a restore brings back the same objects with their owner, popup and reply', async () => {
      await withDocument(async (doc) => {
        const deleted = await doc.apply({ ops: [{ type: 'annotations.delete', ref: FILE_NOTE }] });
        const recorded = recordEvents(doc);
        const undo = await doc.apply({ undoOf: deleted.meta.opId });
        recorded.stop();

        const restore = appliedOfType(undo, 'annotations.restore');
        expect(restore.annotations.map((annotation) => annotation.ref)).toEqual([
          FILE_NOTE,
          FILE_POPUP,
          FILE_REPLY,
        ]);
        const [note, , reply] = restore.annotations;
        expect(note!.author).toBe('Ann');
        expect(note!.popup).toEqual(FILE_POPUP);
        expect(reply!.author).toBe('Bea');
        expect(reply!.reply?.to).toEqual(FILE_NOTE);
        // Back in their places in the stacking order, between the square and the widget.
        const { annotations } = await doc.page(PAGE).annotations.list();
        expect(annotations.map((annotation) => annotation.ref)).toEqual([
          FILE_SQUARE,
          FILE_NOTE,
          FILE_POPUP,
          FILE_REPLY,
        ]);

        expect(recorded.events.map((event) => event.type)).toEqual(['annotations.restored']);
        expect(txOf(recorded.events[0]!)).toEqual({ id: undo.meta.opId, index: 0, count: 1 });
      });
    });

    test('an edited annotation from the file comes back with its edits', async () => {
      await withDocument(async (doc) => {
        await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        const deleted = await doc.apply({
          ops: [{ type: 'annotations.delete', ref: FILE_SQUARE }],
        });
        await doc.apply({ undoOf: deleted.meta.opId });
        expect(await colorOf(doc, FILE_SQUARE)).toBe('#e11d48');
      });
    });

    test('undoing a change twice is harmless', async () => {
      await withDocument(async (doc) => {
        const before = await factsOf(doc);
        const mine = await doc.apply({
          ops: [{ type: 'forms.setValue', field: NAME, value: { value: 'Bea' } }],
        });
        await doc.apply({ undoOf: mine.meta.opId });
        const again = await doc.apply({ undoOf: mine.meta.opId });
        expect(again.items.every(isSkippedItem)).toBe(true);
        expect(await factsOf(doc)).toEqual(before);
      });
    });

    test('only the user who made a change may undo it', async () => {
      if (!opts.openAsAnotherUser) return;
      await withDocument(async (doc) => {
        const mine = await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        const other = await opts.openAsAnotherUser!(engine, doc);
        try {
          await expect(other.apply({ undoOf: mine.meta.opId })).rejects.toMatchObject({
            code: EngineErrorCode.Forbidden,
          });
        } finally {
          await other.close();
        }
        expect(await colorOf(doc, FILE_SQUARE)).toBe('#e11d48');
      });
    });

    test('a redaction apply ends undo for the changes before it', async () => {
      await withDocument(async (doc) => {
        const before = await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        await doc.page(EMPTY_PAGE).annotations.create({ subtype: 'redact', rect: box(20) });
        const redaction = await doc.redaction.apply({ pages: [EMPTY_PAGE] });
        expect(redaction.meta.undoable).toBe(false);

        await expect(doc.apply({ undoOf: before.meta.opId })).rejects.toMatchObject({
          code: EngineErrorCode.UndoUnavailable,
          details: { reason: 'final-change' },
        });
        // Plain edits stay possible, and undoable.
        const after = await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: BLUE } }],
        });
        expect(after.meta.undoable).toBe(true);
      });
    });

    test('a refused change asked again answers its refusal, even when it would now apply', async () => {
      await withDocument(async (doc) => {
        const refused = {
          ops: [
            {
              type: 'annotations.update',
              ref: FILE_SQUARE,
              patch: { color: '#00ff00' },
              expect: { color: '#e11d48' },
            },
          ],
        } satisfies { ops: ChangeOp[] };
        const options = { opId: 'change-conformance-refused' };
        await expect(doc.apply(refused, options)).rejects.toMatchObject({
          code: EngineErrorCode.ChangeConflict,
        });
        await doc.apply({
          ops: [{ type: 'annotations.update', ref: FILE_SQUARE, patch: { color: '#e11d48' } }],
        });
        await expect(doc.apply(refused, options)).rejects.toMatchObject({
          code: EngineErrorCode.ChangeConflict,
        });
        expect(await colorOf(doc, FILE_SQUARE)).toBe('#e11d48');
      });
    });

    test('asking again answers the first result and publishes nothing new', async () => {
      await withDocument(async (doc) => {
        const change = {
          ops: [{ type: 'forms.setValue', field: NAME, value: { value: 'Bea' } }],
        } satisfies { ops: ChangeOp[] };
        const options = { opId: 'change-conformance-retry' };
        const recorded = recordEvents(doc);
        const first = await doc.apply(change, options);
        const second = await doc.apply(change, options);
        recorded.stop();
        expect(second).toEqual(first);
        expect(recorded.events).toHaveLength(1);
      });
    });

    test('a different change under a used opId is IdempotencyKeyReused', async () => {
      await withDocument(async (doc) => {
        const options = { opId: 'change-conformance-reused' };
        await doc.apply(
          { ops: [{ type: 'forms.setValue', field: NAME, value: { value: 'Bea' } }] },
          options,
        );
        await expect(
          doc.apply(
            { ops: [{ type: 'forms.setValue', field: NAME, value: { value: 'Cy' } }] },
            options,
          ),
        ).rejects.toMatchObject({ code: EngineErrorCode.IdempotencyKeyReused });
      });
    });

    test('a single verb is a one-op change: its opId undoes it', async () => {
      await withDocument(async (doc) => {
        const before = await factsOf(doc);
        const updated = await doc.page(PAGE).annotations.update(FILE_SQUARE, { color: '#e11d48' });
        expect(updated.meta.undoable).toBe(true);
        await doc.apply({ undoOf: updated.meta.opId });
        expect(await factsOf(doc)).toEqual(before);
      });
    });
  });
}
