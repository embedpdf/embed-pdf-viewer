import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { SquareDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

const square = (left: number, bottom: number, size = 40): SquareDraft => ({
  subtype: 'square',
  rect: { left, bottom, right: left + size, top: bottom + size },
  color: { r: 220, g: 20, b: 20 },
  strokeWidth: 2,
});

/**
 * `page(pon).annotations.exportAppearance(refs)`: the chosen annotations'
 * appearances as ONE single-page PDF sized to their union /Rect. Locks:
 *   1. bytes are a PDF; the source page is untouched (no mutation, no
 *      revision bump);
 *   2. re-opened (local engines), the page is exactly the union size and the
 *      requested count of annotations is gone — they are content now;
 *   3. a ref on another page rejects `InvalidArg`; an empty list rejects.
 * Skips cleanly when the engine does not implement the optional member.
 */
export function runAnnotationAppearanceExportConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation appearance export conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('returns a single-page PDF sized to the union rect; source untouched', async () => {
      const doc = await openFixture(engine, opts);
      let exported: DocumentHandle | null = null;
      try {
        const pon = (await doc.pages.list()).pages[0].pageObjectNumber;
        const page = doc.page(pon);
        if (!page.annotations.exportAppearance) return;
        const a = (await page.annotations.create(square(20, 20))).created.ref;
        const b = (await page.annotations.create(square(100, 60, 30))).created.ref;
        const before = await page.annotations.list();

        const bytes = await page.annotations.exportAppearance([a, b]);
        expect(bytes.length > 4).toBe(true);
        expect([...bytes.subarray(0, 4)]).toEqual(PDF_MAGIC);

        const after = await page.annotations.list();
        expect(after.annotations.length).toBe(before.annotations.length);
        expect(after.pageState.revision.generation).toBe(before.pageState.revision.generation);

        if (opts.openKind !== 'bytes') return;
        exported = await engine.open({ kind: 'bytes', id: `${opts.fixture.id}-appearance`, bytes });
        const layout = await exported.pages.list();
        expect(layout.pageCount).toBe(1);
        // Union of [20..60]×[20..60] and [100..130]×[60..90] → 110 × 70.
        expect(Math.round(layout.pages[0].size.width)).toBe(110);
        expect(Math.round(layout.pages[0].size.height)).toBe(70);
        const exportedPage = exported.page(layout.pages[0].pageObjectNumber);
        expect((await exportedPage.annotations.list()).annotations).toHaveLength(0);
      } finally {
        if (exported) await exported.close();
        await doc.close();
      }
    });

    test('a ref on another page and an empty list reject InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const layout = await doc.pages.list();
        const page0 = doc.page(layout.pages[0].pageObjectNumber);
        if (!page0.annotations.exportAppearance) return;
        await expect(page0.annotations.exportAppearance([])).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
        if (layout.pages.length < 2) return;
        const page1 = doc.page(layout.pages[1].pageObjectNumber);
        const own = (await page0.annotations.create(square(20, 100))).created.ref;
        const foreign = (await page1.annotations.create(square(20, 100))).created.ref;
        await expect(page0.annotations.exportAppearance([own, foreign])).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
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
