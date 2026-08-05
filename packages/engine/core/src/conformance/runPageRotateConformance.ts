import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { AnnotationPatch, HighlightDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { AbortError } from '../promise/AbortError';
import { PageRotateResultSchema } from '../wire/schemas';

const QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
  },
];

/**
 * Page rotate conformance suite. Verifies the architectural invariants —
 * do NOT loosen these without re-reading `PageRotateResult`:
 *
 *   1. Rotation is ABSOLUTE and idempotent: `rotate(pons, 90)` twice is
 *      `rotate(pons, 90)` once. The wire never speaks "turn by".
 *   2. Rotation is presentation metadata over NORMALIZED content: the
 *      layout's `width`/`height` stay un-rotated, order and identity are
 *      untouched, and per-page `RevisionToken`s survive (an index-based
 *      annotation ref captured before the rotate works after it).
 *   3. The result returns the full new `layout`; a subsequent `list()`
 *      agrees with it.
 *   4. Invalid inputs (bad rotation value, duplicate PONs, unknown PONs)
 *      reject with `InvalidArg` / `NotFound`.
 *   5. Abort propagates as `AbortError`.
 *
 * Both local (worker host + WASM) and cloud (HTTP + @cloudpdf/server)
 * implementations must pass identically.
 */
export function runPageRotateConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page rotate conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('pages.rotate() sets the absolute rotation and returns the full layout', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const before = await doc.pages.list();
        const target = before.pages[0];

        const result = await doc.pages.rotate([target.pageObjectNumber], 90);
        expect(PageRotateResultSchema.safeParse(result).success).toBe(true);

        const after = result.layout;
        const rotated = after.pages.find((p) => p.pageObjectNumber === target.pageObjectNumber);
        expect(rotated?.rotation).toBe(90);

        // Presentation metadata only: un-rotated dims, order, and the PON
        // set are all untouched.
        expect(rotated?.size.width).toBe(target.size.width);
        expect(rotated?.size.height).toBe(target.size.height);
        expect(after.pages.map((p) => p.pageObjectNumber)).toEqual(
          before.pages.map((p) => p.pageObjectNumber),
        );

        // A subsequent list() agrees (the result is not a one-off view).
        const relisted = await doc.pages.list();
        expect(
          relisted.pages.find((p) => p.pageObjectNumber === target.pageObjectNumber)?.rotation,
        ).toBe(90);
      } finally {
        await doc.close();
      }
    });

    test('absolute rotation is idempotent: setting the same value twice is a no-op', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        const first = await doc.pages.rotate([pon], 180);
        const second = await doc.pages.rotate([pon], 180);
        expect(second.layout.pages.map((p) => [p.pageObjectNumber, p.rotation])).toEqual(
          first.layout.pages.map((p) => [p.pageObjectNumber, p.rotation]),
        );
      } finally {
        await doc.close();
      }
    });

    test('one rotation applies to EVERY listed page (the multi-select gesture)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        if (list.pages.length < 2) return;
        const pons = list.pages.slice(0, 2).map((p) => p.pageObjectNumber);
        const result = await doc.pages.rotate(pons, 270);
        for (const pon of pons) {
          expect(result.layout.pages.find((p) => p.pageObjectNumber === pon)?.rotation).toBe(270);
        }
      } finally {
        await doc.close();
      }
    });

    test('weak index-based annotation refs survive a rotate (no revision bump)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const hostPon = list.pages[0].pageObjectNumber;
        const hostPage = doc.page(hostPon);

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'rotate survives this',
          quadPoints: QUAD,
        };
        const created = await hostPage.annotations.create(draft);
        const afterCreate = await hostPage.annotations.list();
        const targetIndex = afterCreate.annotations.findIndex(
          (a) =>
            a.ref.kind === 'objectNumber' &&
            created.created.ref.kind === 'objectNumber' &&
            a.ref.annotObjectNumber === created.created.ref.annotObjectNumber,
        );
        expect(targetIndex >= 0).toBe(true);

        const indexRef: AnnotationRef = {
          kind: 'index',
          pageObjectNumber: hostPon,
          index: targetIndex,
          revision: afterCreate.pageState.revision,
        };

        // Rotate the HOST page itself — the strongest version of the
        // invariant: even the rotated page's revision stays put.
        await doc.pages.rotate([hostPon], 90);

        const patch: AnnotationPatch = { subtype: 'highlight', contents: 'still alive' };
        const update = await hostPage.annotations.update(indexRef, patch);
        expect(update.updated.contents).toBe('still alive');
      } finally {
        await doc.close();
      }
    });

    test('pages.rotate() rejects an invalid rotation value with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          // 45 is not a legal /Rotate value; the type forbids it, the wire
          // must too.
          await doc.pages.rotate([pon], 45 as never);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.rotate() rejects duplicate PONs with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        let caught: unknown;
        try {
          await doc.pages.rotate([pon, pon], 90);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.rotate() rejects unknown PON with NotFound or InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        let bogus = 0;
        for (const p of list.pages) bogus = Math.max(bogus, p.pageObjectNumber);
        bogus += 9999;

        let caught: unknown;
        try {
          await doc.pages.rotate([bogus], 90);
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

    test('abort on pages.rotate() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        const p = doc.pages.rotate([pon], 90);
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
