import type { HighlightDraft, RedactDraft } from '../annotation/kinds';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { toPageRef } from '../identity/PageRef';
import { RedactionApplyResultSchema } from '../wire/schemas';
import { pdfOf } from './pdfOf';
import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';

/**
 * One 300-point page with neither /Contents nor /Resources, as some
 * generators write a blank page.
 */
export const BARE_PAGE_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
]);

export interface RedactionApplyConformanceOptions extends ConformanceOptions {
  /** Open {@link BARE_PAGE_FIXTURE_PDF}, fresh for each call, with write access. */
  openBarePage: (engine: Engine) => Promise<DocumentHandle>;
}

/**
 * Transport-neutral coverage for the destructive redaction-apply rail.
 * Runs against a fixture page with no pre-existing annotations so the
 * collateral counts are exact. Content-removal fidelity itself is pinned by
 * the native embeddertests; this suite pins the transport contract: scopes,
 * statuses, counts, affected pages, events, and preflight rejection.
 */
export function runRedactionApplyConformance(
  runner: ConformanceTestRunner,
  opts: RedactionApplyConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  // Geometry: the highlight sits fully inside the redact rect, so applying
  // the redaction removes it as collateral (positive-area intersection).
  const REDACT_RECT = { x: 50, y: 50, width: 120, height: 100 };
  /** A highlight inside the redacted area. */
  const COLLATERAL_QUAD: HighlightDraft['quadPoints'] = [
    {
      upperLeft: { x: 70, y: 80 },
      upperRight: { x: 150, y: 80 },
      lowerLeft: { x: 70, y: 120 },
      lowerRight: { x: 150, y: 120 },
    },
  ];

  describe(`redaction apply conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('annotations scope applies the marked redaction and counts collateral', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.redaction) return;
        const layoutBefore = await doc.pages.list();
        const pageObjectNumber = layoutBefore.pages[0].ref.objectNumber;
        const page = doc.page(toPageRef(pageObjectNumber));

        const collateral = await page.annotations.create({
          subtype: 'highlight',
          quadPoints: COLLATERAL_QUAD,
        } satisfies HighlightDraft);
        expect(collateral.annotation.subtype).toBe('highlight');

        const marked = await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: '#000000',
          overlayText: 'REDACTED',
          fontColor: '#ffffff',
        } satisfies RedactDraft);
        expect(marked.annotation.subtype).toBe('redact');
        // The mark's own popup, away from the region: it goes with the mark.
        await page.annotations.create({
          subtype: 'popup',
          rect: { x: 300, y: 300, width: 100, height: 60 },
          parent: marked.annotation.ref,
        });

        const before = await page.annotations.list();
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'redaction.applied') events.push(event);
        });

        const result = await doc.redaction.apply({ annotations: [marked.annotation.ref] });
        expect(RedactionApplyResultSchema.safeParse(result).success).toBe(true);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].page.objectNumber).toBe(pageObjectNumber);
        expect(result.results[0].status).toBe('applied');
        // The highlight and the mark's popup count: the consumed redact never does.
        expect(result.results[0].removedAnnotationCount).toBe(2);
        expect(result.removedAnnotationCount).toBe(2);
        expect(result.meta.affectedPages).toEqual([page.ref]);
        expect(events).toHaveLength(1);
        unsubscribe();

        // The redaction, its popup and its collateral are gone; layout is
        // not a casualty.
        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(before.annotations.length - 3);
        expect(await doc.pages.list()).toEqual(layoutBefore);
        // The label is part of the page now.
        expect((await page.text.get()).text).toContain('REDACTED');
      } finally {
        await doc.close();
      }
    });

    test('a label fitted to its region (fontSize 0) is burned in', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.redaction) return;
        const layout = await doc.pages.list();
        const page = doc.page(toPageRef(layout.pages[0].ref.objectNumber));
        // Marked first and labelled after, as a redaction UI does.
        const marked = await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: '#000000',
        } satisfies RedactDraft);
        await page.annotations.update(marked.annotation.ref, {
          subtype: 'redact',
          overlayText: 'CLASSIFIED',
          fontSize: 0,
          fontColor: '#ffffff',
        });

        await doc.redaction.apply({ annotations: [marked.annotation.ref] });
        expect((await page.text.get()).text).toContain('CLASSIFIED');
      } finally {
        await doc.close();
      }
    });

    test('pages scope applies everything once and validates its input', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.redaction) return;
        const layout = await doc.pages.list();
        const pageObjectNumber = layout.pages[0].ref.objectNumber;
        const page = doc.page(toPageRef(pageObjectNumber));

        await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: '#000000',
        } satisfies RedactDraft);

        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'redaction.applied') events.push(event);
        });

        const applied = await doc.redaction.apply({ pages: [toPageRef(pageObjectNumber)] });
        expect(applied.results.map((item) => item.status)).toEqual(['applied']);
        expect(applied.removedAnnotationCount).toBe(0);
        expect(events).toHaveLength(1);

        // A page with no redactions left is unchanged: no artifact, no event.
        const noOp = await doc.redaction.apply({ pages: [toPageRef(pageObjectNumber)] });
        expect(noOp.results.map((item) => item.status)).toEqual(['unchanged']);
        expect(noOp.meta).toMatchObject({ affectedPages: [], cacheDelta: null, undoable: false });
        expect(events).toHaveLength(1);
        unsubscribe();

        await expect(
          doc.redaction.apply({
            pages: [toPageRef(pageObjectNumber), toPageRef(pageObjectNumber)],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // Preflight rejects a ref that is not a redact annotation before
        // anything is written.
        const notRedact = await page.annotations.create({
          subtype: 'highlight',
          quadPoints: COLLATERAL_QUAD,
        } satisfies HighlightDraft);
        await expect(
          doc.redaction.apply({ annotations: [notRedact.annotation.ref] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      } finally {
        await doc.close();
      }
    });

    test('applies on a page without /Contents or /Resources', async () => {
      const doc = await opts.openBarePage(engine);
      try {
        if (!doc.redaction) return;
        const layout = await doc.pages.list();
        const page = doc.page(toPageRef(layout.pages[0].ref.objectNumber));
        await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: '#000000',
          overlayText: 'REDACTED',
          fontColor: '#ffffff',
        } satisfies RedactDraft);

        // The overlay becomes the page's first content, its form named in
        // /Resources the page gets on the way.
        const applied = await doc.redaction.apply({ pages: [page.ref] });
        expect(applied.results.map((item) => item.status)).toEqual(['applied']);
        expect(applied.meta.affectedPages).toEqual([page.ref]);
        expect((await page.annotations.list()).annotations).toHaveLength(0);
        expect((await page.text.get()).text).toContain('REDACTED');
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
