import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { SquareDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { isLocalPage } from '../engine/LocalPageHandle';
import { annotationKey } from '../identity/annotationKey';
import { EVERY_PERMISSION } from './fixtureScope';

const square = (x: number, y: number): SquareDraft => ({
  subtype: 'square',
  box: { x, y, width: 40, height: 40 },
  color: '#dc1414',
  strokeWidth: 2,
});

/**
 * `page(pon).annotations.order()` (local engines): the page's `/Annots` in
 * array order, both families. Locks:
 *   1. annotations and widgets come back interleaved as written, each with
 *      its family, and each family's rows agree with its own list;
 *   2. a reorder shows in the array order;
 *   3. the read changes nothing.
 * Skips on an engine whose pages aren't local.
 */
export function runAnnotationOrderConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation order conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('lists /Annots in array order with each entry family', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        if (!isLocalPage(page)) return;
        const start = (await page.annotations.order()).entries.length;
        const a = (await page.annotations.create(square(20, 20))).annotation.ref;
        const { widgets } = await doc.forms.create({
          family: 'text',
          name: 'order_text',
          widgets: [{ page: page.ref, rect: { x: 80, y: 20, width: 60, height: 20 } }],
        });
        const b = (await page.annotations.create(square(160, 20))).annotation.ref;

        const order = await page.annotations.order();
        expect(order.page).toEqual(page.ref);
        const added = order.entries.slice(start);
        expect(added.map((entry) => entry && [annotationKey(entry.ref), entry.family])).toEqual([
          [annotationKey(a), 'annotations'],
          [annotationKey(widgets[0]!.ref), 'widgets'],
          [annotationKey(b), 'annotations'],
        ]);
        const listed = (await page.annotations.list()).annotations.map((x) => annotationKey(x.ref));
        expect(
          order.entries.flatMap((entry) =>
            entry?.family === 'annotations' ? [annotationKey(entry.ref)] : [],
          ),
        ).toEqual(listed);

        // Read-only: asking again answers the same.
        expect(await page.annotations.order()).toEqual(order);

        await page.annotations.reorder([b], 'start');
        const after = (await page.annotations.order()).entries
          .slice(start)
          .map((entry) => entry && annotationKey(entry.ref));
        expect(after.indexOf(annotationKey(b)) < after.indexOf(annotationKey(a))).toBe(true);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open(
      { kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() },
      EVERY_PERMISSION,
    );
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
