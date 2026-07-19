import type { HighlightDraft, RedactDraft } from '../annotation/kinds';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { RedactionApplyResultSchema } from '../wire/schemas';
import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';

/**
 * Transport-neutral coverage for the destructive redaction-apply rail.
 * Runs against a fixture page with NO pre-existing annotations so the
 * collateral counts are exact. Content-removal fidelity itself is pinned by
 * the native embeddertests; this suite pins the transport contract: scopes,
 * statuses, counts, revision bumps, events, and preflight rejection.
 */
export function runRedactionApplyConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  // Geometry: the highlight sits fully inside the redact rect, so applying
  // the redaction removes it as collateral (positive-area intersection).
  const REDACT_RECT = { left: 50, bottom: 50, right: 170, top: 150 };
  const COLLATERAL_QUAD: HighlightDraft['quadPoints'] = [
    {
      p1: { x: 70, y: 120 },
      p2: { x: 150, y: 120 },
      p3: { x: 70, y: 80 },
      p4: { x: 150, y: 80 },
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
        const pageObjectNumber = layoutBefore.pages[0].pageObjectNumber;
        const page = doc.page(pageObjectNumber);

        const collateral = await page.annotations.create({
          subtype: 'highlight',
          quadPoints: COLLATERAL_QUAD,
        } satisfies HighlightDraft);
        expect(collateral.created.subtype).toBe('highlight');

        const marked = await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: { r: 0, g: 0, b: 0 },
          overlayText: 'REDACTED',
          fontColor: { r: 255, g: 255, b: 255 },
        } satisfies RedactDraft);
        expect(marked.created.subtype).toBe('redact');

        const before = await page.annotations.list();
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'redaction.applied') events.push(event);
        });

        const result = await doc.redaction.apply({
          kind: 'annotations',
          refs: [marked.created.ref],
        });
        expect(RedactionApplyResultSchema.safeParse(result).success).toBe(true);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].pageObjectNumber).toBe(pageObjectNumber);
        expect(result.results[0].status).toBe('applied');
        // Exactly the highlight counts: the consumed REDACT never does.
        expect(result.results[0].removedAnnotationCount).toBe(1);
        expect(result.removedAnnotationCount).toBe(1);
        expect(result.meta === null).toBe(false);
        expect(events).toHaveLength(1);
        unsubscribe();

        // Both the redaction and its collateral are gone; layout is not a
        // casualty; the page revision advanced (weak refs invalidated).
        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(before.annotations.length - 2);
        expect(after.pageState.revision.generation > before.pageState.revision.generation).toBe(
          true,
        );
        expect(await doc.pages.list()).toEqual(layoutBefore);
      } finally {
        await doc.close();
      }
    });

    test('pages scope applies everything once and validates its input', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.redaction) return;
        const layout = await doc.pages.list();
        const pageObjectNumber = layout.pages[0].pageObjectNumber;
        const page = doc.page(pageObjectNumber);

        await page.annotations.create({
          subtype: 'redact',
          rect: REDACT_RECT,
          interiorColor: { r: 0, g: 0, b: 0 },
        } satisfies RedactDraft);

        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'redaction.applied') events.push(event);
        });

        const applied = await doc.redaction.apply({
          kind: 'pages',
          pageObjectNumbers: [pageObjectNumber],
        });
        expect(applied.results.map((item) => item.status)).toEqual(['applied']);
        expect(applied.removedAnnotationCount).toBe(0);
        expect(events).toHaveLength(1);

        // A page with no redactions left is unchanged: no artifact, no event.
        const noOp = await doc.redaction.apply({
          kind: 'pages',
          pageObjectNumbers: [pageObjectNumber],
        });
        expect(noOp.results.map((item) => item.status)).toEqual(['unchanged']);
        expect(noOp.meta).toBeNull();
        expect(events).toHaveLength(1);
        unsubscribe();

        await expect(
          doc.redaction.apply({
            kind: 'pages',
            pageObjectNumbers: [pageObjectNumber, pageObjectNumber],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

        // Preflight rejects a ref that is not a REDACT annotation before
        // anything is written.
        const notRedact = await page.annotations.create({
          subtype: 'highlight',
          quadPoints: COLLATERAL_QUAD,
        } satisfies HighlightDraft);
        await expect(
          doc.redaction.apply({ kind: 'annotations', refs: [notRedact.created.ref] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
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
