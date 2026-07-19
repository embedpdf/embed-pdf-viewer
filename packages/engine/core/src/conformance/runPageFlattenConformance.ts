import type { DocumentEvent } from '../events/DocumentEvent';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { PageFlattenResultSchema } from '../wire/schemas';
import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';

/** Transport-neutral coverage for the content + annotation flatten rail. */
export function runPageFlattenConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page flatten conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('flattens eligible appearances once without changing layout', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.flatten) return;
        const layoutBefore = await doc.pages.list();
        const pageObjectNumber = layoutBefore.pages[0].pageObjectNumber;
        const annotationsBefore = await doc.page(pageObjectNumber).annotations.list();
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => {
          if (event.type === 'pages.flattened') events.push(event);
        });

        const result = await doc.pages.flatten([pageObjectNumber], 'display');
        expect(PageFlattenResultSchema.safeParse(result).success).toBe(true);
        expect(result.pageObjectNumbers).toEqual([pageObjectNumber]);
        expect(result.usage).toBe('display');
        expect(result.results.map((item) => item.status)).toEqual(['applied']);
        expect(result.meta === null).toBe(false);
        expect(events).toHaveLength(1);

        const layoutAfter = await doc.pages.list();
        expect(layoutAfter).toEqual(layoutBefore);
        const annotationsAfter = await doc.page(pageObjectNumber).annotations.list();
        expect(annotationsAfter.annotations.length < annotationsBefore.annotations.length).toBe(
          true,
        );
        expect(
          annotationsAfter.pageState.revision.generation >
            annotationsBefore.pageState.revision.generation,
        ).toBe(true);

        const noOp = await doc.pages.flatten([pageObjectNumber], 'display');
        expect(noOp.results.map((item) => item.status)).toEqual(['unchanged']);
        expect(noOp.meta).toBeNull();
        expect(events).toHaveLength(1);
        unsubscribe();

        await expect(doc.pages.flatten([pageObjectNumber, pageObjectNumber])).rejects.toMatchObject(
          {
            code: EngineErrorCode.InvalidArg,
          },
        );
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
