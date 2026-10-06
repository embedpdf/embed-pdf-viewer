import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import { PageRotateResultSchema } from '../wire/schemas';

/**
 * Page rotate conformance suite. Verifies the architectural invariants —
 * do not loosen these without re-reading `PageRotateResult`:
 *
 *   1. Rotation is absolute and idempotent: `rotate(pons, 90)` twice is
 *      `rotate(pons, 90)` once. The wire never speaks "turn by".
 *   2. Rotation is presentation metadata over normalized content: the
 *      layout's `width`/`height` stay un-rotated, order and identity are
 *      untouched, and annotation names survive (a `baseIndex` ref captured
 *      before the rotate works after it).
 *   3. The result returns the full new `layout`; a subsequent `list()`
 *      agrees with it.
 *   4. Invalid inputs (bad rotation value, duplicate page object numbers, unknown page object numbers)
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

        const result = await doc.pages.rotate([target.ref], 90);
        expect(PageRotateResultSchema.safeParse(result).success).toBe(true);

        const after = result.layout;
        const rotated = after.pages.find((p) => p.ref.objectNumber === target.ref.objectNumber);
        expect(rotated?.rotation).toBe(90);

        // Presentation metadata only: un-rotated dims, order, and the page object number
        // set are all untouched.
        expect(rotated?.size.width).toBe(target.size.width);
        expect(rotated?.size.height).toBe(target.size.height);
        expect(after.pages.map((p) => p.ref.objectNumber)).toEqual(
          before.pages.map((p) => p.ref.objectNumber),
        );

        // A subsequent list() agrees (the result is not a one-off view).
        const relisted = await doc.pages.list();
        expect(
          relisted.pages.find((p) => p.ref.objectNumber === target.ref.objectNumber)?.rotation,
        ).toBe(90);
      } finally {
        await doc.close();
      }
    });

    test('absolute rotation is idempotent: setting the same value twice is a no-op', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pageObjectNumber = list.pages[0].ref.objectNumber;
        const first = await doc.pages.rotate([toPageRef(pageObjectNumber)], 180);
        const second = await doc.pages.rotate([toPageRef(pageObjectNumber)], 180);
        expect(second.layout.pages.map((p) => [p.ref.objectNumber, p.rotation])).toEqual(
          first.layout.pages.map((p) => [p.ref.objectNumber, p.rotation]),
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
        const pageObjectNumbers = list.pages.slice(0, 2).map((p) => p.ref.objectNumber);
        const result = await doc.pages.rotate(pageObjectNumbers.map(toPageRef), 270);
        for (const pageObjectNumber of pageObjectNumbers) {
          expect(
            result.layout.pages.find((p) => p.ref.objectNumber === pageObjectNumber)?.rotation,
          ).toBe(270);
        }
      } finally {
        await doc.close();
      }
    });

    test('an annotation born inline keeps its baseIndex name when its page is rotated', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const inline = (await doc.annotations.list()).annotations.find(
          (a) => a.ref.kind === 'baseIndex',
        );
        if (!inline) return;

        await doc.pages.rotate([inline.page], 90);

        const update = await doc.page(inline.page).annotations.update(inline.ref, {
          contents: 'still alive',
        });
        expect(update.annotation.contents).toBe('still alive');
        expect(annotationKey(update.annotation.ref)).toBe(annotationKey(inline.ref));
      } finally {
        await doc.close();
      }
    });

    test('pages.rotate() rejects an invalid rotation value with InvalidArg', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const pageObjectNumber = list.pages[0].ref.objectNumber;
        let caught: unknown;
        try {
          // 45 is not a legal /Rotate value; the type forbids it, the wire
          // must too.
          await doc.pages.rotate([toPageRef(pageObjectNumber)], 45 as never);
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
        const pageObjectNumber = list.pages[0].ref.objectNumber;
        let caught: unknown;
        try {
          await doc.pages.rotate([toPageRef(pageObjectNumber), toPageRef(pageObjectNumber)], 90);
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
        for (const p of list.pages) bogus = Math.max(bogus, p.ref.objectNumber);
        bogus += 9999;

        let caught: unknown;
        try {
          await doc.pages.rotate([toPageRef(bogus)], 90);
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
        const pageObjectNumber = list.pages[0].ref.objectNumber;
        const p = doc.pages.rotate([toPageRef(pageObjectNumber)], 90);
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
