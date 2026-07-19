import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';

/** `%PDF` — every extracted document must lead with the PDF header. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/**
 * Page extract conformance suite. `pages.extract?` is OPTIONAL on the
 * contract (the `downloadLayer?` pattern) — the suite runs only when the
 * implementation provides it, so a cloud engine that has not shipped the
 * server endpoint yet skips cleanly instead of failing.
 *
 * Invariants:
 *   1. `pages.extract([pon])` returns standalone PDF bytes (magic header).
 *   2. The SOURCE document is untouched: identical layout before/after,
 *      and page revisions do not bump (extract is a read).
 *   3. Caller order is preserved and page geometry survives the copy
 *      (asserted by re-opening the extracted bytes — bytes-open engines
 *      only, since a cloud engine cannot re-open loose bytes).
 *   4. Empty / duplicate PONs reject `InvalidArg`; unknown PONs reject
 *      `NotFound` (or `InvalidArg`); abort propagates as `AbortError`.
 */
export function runPageExtractConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page extract conformance: ${opts.label}`, () => {
    let engine: Engine;
    let supported = false;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await openFixture(engine, opts);
      supported = probe.pages.extract !== undefined;
      await probe.close();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('pages.extract() returns standalone PDF bytes and leaves the source untouched', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const target = before.pages[before.pages.length - 1];

        const bytes = await doc.pages.extract!([target.pageObjectNumber]);
        expect(bytes.length > PDF_MAGIC.length).toBe(true);
        expect(Array.from(bytes.slice(0, PDF_MAGIC.length))).toEqual(PDF_MAGIC);

        // Extract is a READ: the source layout is exactly what it was.
        const after = await doc.pages.list();
        expect(after.pages.map((p) => p.pageObjectNumber)).toEqual(
          before.pages.map((p) => p.pageObjectNumber),
        );
        expect(after.pageCount).toBe(before.pageCount);
      } finally {
        await doc.close();
      }
    });

    test('extracted bytes re-open as a document with the requested pages, in caller order', async () => {
      if (!supported || opts.openKind !== 'bytes') return;
      const doc = await openFixture(engine, opts);
      let extracted: DocumentHandle | null = null;
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;
        // Reversed order on purpose: output order is CALLER order.
        const p0 = list.pages[0];
        const p1 = list.pages[1];
        const bytes = await doc.pages.extract!([p1.pageObjectNumber, p0.pageObjectNumber]);

        extracted = await engine.open({ kind: 'bytes', id: `${opts.fixture.id}-extracted`, bytes });
        const out = await extracted.pages.list();
        expect(out.pageCount).toBe(2);
        expect(out.pages[0].size).toEqual(p1.size);
        expect(out.pages[1].size).toEqual(p0.size);
      } finally {
        if (extracted) await extracted.close();
        await doc.close();
      }
    });

    test('pages.extract() rejects empty input with InvalidArg', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          await doc.pages.extract!([]);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.extract() rejects duplicate PONs with InvalidArg', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          await doc.pages.extract!([pon, pon]);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.extract() rejects unknown PON with NotFound or InvalidArg', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        let bogus = 0;
        for (const p of list.pages) bogus = Math.max(bogus, p.pageObjectNumber);
        bogus += 9999;

        let caught: unknown;
        try {
          await doc.pages.extract!([bogus]);
        } catch (err) {
          caught = err;
        }
        expect(
          EngineError.is(caught, EngineErrorCode.NotFound) ||
            EngineError.is(caught, EngineErrorCode.InvalidArg),
        ).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort on pages.extract() rejects with AbortError', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const p = doc.pages.extract!([list.pages[0].pageObjectNumber]);
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
