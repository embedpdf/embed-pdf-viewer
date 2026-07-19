import type {
  ConformanceTestRunner,
  ConformanceFixture,
  ConformanceOptions,
} from './runMetadataConformance';
import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';
import { PageTextSnapshotSchema } from '../wire/schemas';

/**
 * Per-fixture expectations for the text-extraction harness. Concrete
 * suites supply the page identity + a substring the harness asserts
 * exists in the extracted text. The harness deliberately avoids
 * locking the exact string so different fixtures (or PDFium upgrades
 * that change whitespace handling) don't require harness edits.
 */
export interface PageTextConformanceFixture extends ConformanceFixture {
  /** PDF indirect object number of the page used by the text tests. */
  pageObjectNumber: number;
  /**
   * Substring guaranteed to appear in the extracted text. The harness
   * uses `.includes(needle)`; suites should pick something distinctive
   * but not whitespace-sensitive.
   */
  expectedSubstring: string;
  /** Minimum char count the harness expects (sanity floor). */
  minCharCount: number;
}

export interface PageTextConformanceOptions extends Omit<ConformanceOptions, 'fixture'> {
  fixture: PageTextConformanceFixture;
}

export function runPageTextConformance(
  runner: ConformanceTestRunner,
  opts: PageTextConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page text conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('read() returns a PageTextSnapshot with non-empty text', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(opts.fixture.pageObjectNumber);
        const snap = await page.text.read();
        expect(PageTextSnapshotSchema.safeParse(snap).success).toBe(true);
        expect(snap.charCount >= opts.fixture.minCharCount).toBe(true);
        expect(snap.text.length > 0).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('extracted text contains the expected substring', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(opts.fixture.pageObjectNumber);
        const snap = await page.text.read();
        expect(snap.text.includes(opts.fixture.expectedSubstring)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('read() on an unknown pageObjectNumber throws NotFound', async () => {
      const doc = await openFixture(engine, opts);
      try {
        let caught: unknown;
        try {
          const ghost = doc.page(999_999_999);
          await ghost.text.read();
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeTruthy();
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('abort() on read rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page(opts.fixture.pageObjectNumber);
        const p = page.text.read();
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('read after close throws DocNotOpen', async () => {
      const doc = await openFixture(engine, opts);
      const page = doc.page(opts.fixture.pageObjectNumber);
      await doc.close();
      let caught: unknown;
      try {
        await page.text.read();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });
  });
}

async function openFixture(engine: Engine, opts: PageTextConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}

export type { PageTextSnapshot };
