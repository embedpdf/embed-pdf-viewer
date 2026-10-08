import { CHANGE_FIXTURE_PDF } from './runChangeConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { annotationKey } from '../identity/annotationKey';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';

/**
 * The two read families, through three tokens: one that may do everything,
 * one that may only fill the form, one that may only comment. Each token
 * reads, sees and writes its own family, and is refused the other one, on
 * every surface: the lists, the appearance images, the page pictures, the
 * writes, and (on an engine where sessions share a document) the events of
 * another session's writes. A widget is the form's: the annotation verbs
 * refuse one as the wrong family (`InvalidArg`), whatever the token.
 *
 * It runs on {@link CHANGE_FIXTURE_PDF}: a square (5), a note (6) with its
 * popup (7) and a reply (8), and the text field `name`, merged with its
 * widget (9), all on the first page.
 */

export const PERMISSION_TOKENS = {
  everything: ['*'],
  fill: ['doc.open', 'doc.render', 'doc.forms.fill'],
  comment: ['doc.open', 'doc.render', 'doc.annotate.modify'],
} as const satisfies Record<string, readonly string[]>;

export type PermissionToken = keyof typeof PERMISSION_TOKENS;

export interface PermissionConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of {@link CHANGE_FIXTURE_PDF} with `scope`. */
  open: (engine: Engine, scope: readonly string[]) => Promise<DocumentHandle>;
  /**
   * Open the document `doc` is on as another session, with `scope`: another
   * user's engine. A local document is its own session's, so without it the
   * events test is skipped.
   */
  openSameDocument?: (doc: DocumentHandle, scope: readonly string[]) => Promise<DocumentHandle>;
}

const PAGE = toPageRef(3);
const SQUARE: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 5 };
const WIDGET: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 9 };
const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };
const box = (x: number) => ({ x, y: 120, width: 40, height: 30 });

export function runPermissionConformance(
  runner: ConformanceTestRunner,
  opts: PermissionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`permission conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const as = async (token: PermissionToken, body: (doc: DocumentHandle) => Promise<void>) => {
      const doc = await opts.open(engine, PERMISSION_TOKENS[token]);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    /** The error's code, or what came back instead: a refusal reads as its code. */
    const outcome = (error: unknown) =>
      EngineError.is(error) ? error.code : error === null ? 'resolved' : String(error);

    const expectRefused = (error: unknown, code: EngineErrorCode) => {
      expect(outcome(error)).toBe(code);
    };

    const keys = (refs: readonly AnnotationRef[]) => refs.map(annotationKey);

    test('lists: each token reads its own family and is refused the other', async () => {
      await as('everything', async (doc) => {
        const { annotations } = await doc.page(PAGE).annotations.list();
        expect(keys(annotations.map((a) => a.ref))).toEqual(
          keys([SQUARE, ...[6, 7, 8].map((n) => ({ ...SQUARE, objectNumber: n }))]),
        );
        const form = await doc.forms.list();
        expect(form.fields.map((field) => field.name)).toEqual(['name']);
        expect(keys(form.widgets.map((row) => row.ref))).toEqual(keys([WIDGET]));
      });
      await as('fill', async (doc) => {
        const form = await doc.forms.list();
        expect(keys(form.widgets.map((row) => row.ref))).toEqual(keys([WIDGET]));
        expectRefused(await refusal(doc.page(PAGE).annotations.list()), EngineErrorCode.Forbidden);
        expectRefused(await refusal(doc.annotations.list()), EngineErrorCode.Forbidden);
      });
      await as('comment', async (doc) => {
        const { annotations } = await doc.page(PAGE).annotations.list();
        expect(annotations).toHaveLength(4);
        expect(annotations.some((a) => a.subtype === 'widget')).toBe(false);
        expectRefused(await refusal(doc.forms.list()), EngineErrorCode.Forbidden);
      });
    });

    test('appearance images: each family takes its own read', async () => {
      await as('everything', async (doc) => {
        const page = doc.page(PAGE);
        const forms = await page.forms.renderAppearances();
        expect(new Set(keys(forms.appearances.map((a) => a.ref)))).toEqual(new Set(keys([WIDGET])));
        const annotations = await page.annotations.renderAppearances();
        expect(
          keys(annotations.appearances.map((a) => a.ref)).includes(annotationKey(WIDGET)),
        ).toBe(false);
      });
      await as('fill', async (doc) => {
        const page = doc.page(PAGE);
        const forms = await page.forms.renderAppearances();
        expect(new Set(keys(forms.appearances.map((a) => a.ref)))).toEqual(new Set(keys([WIDGET])));
        expectRefused(
          await refusal(page.annotations.renderAppearances()),
          EngineErrorCode.Forbidden,
        );
      });
      await as('comment', async (doc) => {
        const page = doc.page(PAGE);
        const annotations = await page.annotations.renderAppearances();
        expect(
          keys(annotations.appearances.map((a) => a.ref)).includes(annotationKey(WIDGET)),
        ).toBe(false);
        expectRefused(await refusal(page.forms.renderAppearances()), EngineErrorCode.Forbidden);
      });
    });

    test('pictures: a left-out layer never asks for more than the token may read', async () => {
      await as('fill', async (doc) => {
        const page = doc.page(PAGE);
        await page.render.image();
        expectRefused(
          await refusal(page.render.image({ includeAnnotations: true })),
          EngineErrorCode.Forbidden,
        );
      });
      await as('comment', async (doc) => {
        const page = doc.page(PAGE);
        await page.render.image();
        await page.render.image({ includeAnnotations: true });
        expectRefused(
          await refusal(page.render.image({ includeFormFields: true })),
          EngineErrorCode.Forbidden,
        );
      });
    });

    test('writes: each token writes its own family; the annotation verbs refuse a widget', async () => {
      await as('fill', async (doc) => {
        const filled = await doc.forms.setValue(NAME, { value: 'Bea' });
        expect(keys(filled.widgets.map((row) => row.ref))).toEqual(keys([WIDGET]));
        expect('annotations' in filled).toBe(false);
        expectRefused(
          await refusal(doc.page(PAGE).annotations.create({ subtype: 'square', box: box(20) })),
          EngineErrorCode.Forbidden,
        );
        expectRefused(
          await refusal(doc.forms.updateWidget(WIDGET, { interiorColor: '#ffd500' })),
          EngineErrorCode.Forbidden,
        );
        expectRefused(
          await refusal(doc.forms.create({ family: 'text', name: 'extra' })),
          EngineErrorCode.Forbidden,
        );
      });

      await as('comment', async (doc) => {
        await doc.page(PAGE).annotations.create({ subtype: 'square', box: box(20) });
        expectRefused(
          await refusal(doc.forms.setValue(NAME, { value: 'Bea' })),
          EngineErrorCode.Forbidden,
        );
        expectRefused(
          await refusal(doc.forms.updateWidget(WIDGET, { interiorColor: '#ffd500' })),
          EngineErrorCode.Forbidden,
        );
      });

      // A widget is the form's: the annotation verbs refuse one as the wrong
      // family, before any right is looked at, whatever the token.
      for (const token of ['everything', 'comment', 'fill'] as const) {
        await as(token, async (doc) => {
          const page = doc.page(PAGE);
          expectRefused(
            await refusal(
              page.annotations.update(WIDGET, { subtype: 'widget', interiorColor: '#fff' }),
            ),
            EngineErrorCode.InvalidArg,
          );
          expectRefused(await refusal(page.annotations.delete(WIDGET)), EngineErrorCode.InvalidArg);
          expectRefused(
            await refusal(page.annotations.reorder([WIDGET], 'start')),
            EngineErrorCode.InvalidArg,
          );
        });
      }
    });

    if (opts.openSameDocument) {
      const openSameDocument = opts.openSameDocument;
      test("events: a token hears its own family of another session's writes, never the other", async () => {
        const writer = await opts.open(engine, PERMISSION_TOKENS.everything);
        const filler = await openSameDocument(writer, PERMISSION_TOKENS.fill);
        const commenter = await openSameDocument(writer, PERMISSION_TOKENS.comment);
        try {
          const heardByFiller: DocumentEvent[] = [];
          const heardByCommenter: DocumentEvent[] = [];
          filler.events.subscribe((event) => heardByFiller.push(event));
          commenter.events.subscribe((event) => heardByCommenter.push(event));
          // Give the lazy streams a beat to connect before the writes.
          await new Promise((resolve) => setTimeout(resolve, 300));

          await writer.page(PAGE).annotations.create({ subtype: 'square', box: box(80) });
          await writer.forms.setValue(NAME, { value: 'Bea' });

          const deadline = Date.now() + 10_000;
          const heard = (events: DocumentEvent[], type: DocumentEvent['type']) =>
            events.some((event) => event.type === type);
          while (
            !(
              heard(heardByFiller, 'forms.valueSet') &&
              heard(heardByCommenter, 'annotations.created')
            )
          ) {
            if (Date.now() > deadline) throw new Error('timed out waiting for the remote events');
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          // A beat more, so a stray event of the other family would have arrived.
          await new Promise((resolve) => setTimeout(resolve, 300));
          const types = (events: DocumentEvent[]) => events.map((event) => event.type);
          expect(types(heardByFiller).some((type) => type.startsWith('annotations.'))).toBe(false);
          expect(types(heardByCommenter).some((type) => type.startsWith('forms.'))).toBe(false);
        } finally {
          await commenter.close();
          await filler.close();
          await writer.close();
        }
      });
    }
  });
}
