import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';
import { PageListSnapshotSchema, PageNameResultSchema } from '../wire/schemas';

/**
 * Named-pages conformance: the catalog's `/Names /Pages` registry as LAYOUT
 * data. Locks the invariants both engines must share — do not loosen
 * without re-reading `NamedPageEntry` and `PageNameResult`:
 *
 *   1. `pages.list().namedPages` is present (possibly empty) and every
 *      registration resolves to a page in `pages`, a template, or is
 *      reported dangling — never silently dropped.
 *   2. `pages.setName()` creates or replaces by decoded key (idempotent),
 *      `replace` renames in one job, and the result IS the new layout.
 *   3. `pages.removeName()` drops the registration and nothing else.
 *   4. Deleting a page removes every registration pointing at it — inside
 *      the delete, with no plugin in the loop.
 *   5. Non-ASCII keys round-trip unchanged (Acrobat writes UTF-16 + BOM).
 *
 * Skips cleanly when the engine does not implement the optional members.
 */
export function runNamedPagesConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`named pages conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('pages.list() carries namedPages and every entry resolves', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const layout = await doc.pages.list();
        PageListSnapshotSchema.parse(layout);
        expect(Array.isArray(layout.namedPages)).toBe(true);
        const pons = new Set(layout.pages.map((page) => page.pageObjectNumber));
        for (const entry of layout.namedPages ?? []) {
          expect(entry.name.length > 0).toBe(true);
          if (entry.target.kind === 'page') {
            expect(pons.has(entry.target.pageObjectNumber)).toBe(true);
          }
        }
      } finally {
        await doc.close();
      }
    });

    test('pages.setName() registers, replaces by key, and renames via `replace`', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName) return;
        const before = await doc.pages.list();
        const [first, second] = before.pages;
        const baseline = (before.namedPages ?? []).length;

        // Create.
        const created = await doc.pages.setName({
          name: 'Approved=Goedgekeurd',
          pageObjectNumber: first.pageObjectNumber,
        });
        PageNameResultSchema.parse(created);
        expect(created.layout.pages.length).toBe(before.pages.length);
        expect(find(created, 'Approved=Goedgekeurd')).toEqual({
          kind: 'page',
          pageObjectNumber: first.pageObjectNumber,
        });
        expect((created.layout.namedPages ?? []).length).toBe(baseline + 1);
        if (created.cache) {
          expect(created.cache.docVersion > created.cache.previousDocVersion).toBe(true);
          expect(created.cache.layoutVersion > 0).toBe(true);
        }

        // The result IS the new layout.
        const listed = await doc.pages.list();
        expect(listed.namedPages).toEqual(created.layout.namedPages);

        // Replace by key: still one entry, now pointing at the second page.
        const replaced = await doc.pages.setName({
          name: 'Approved=Goedgekeurd',
          pageObjectNumber: second.pageObjectNumber,
        });
        expect(find(replaced, 'Approved=Goedgekeurd')).toEqual({
          kind: 'page',
          pageObjectNumber: second.pageObjectNumber,
        });
        expect((replaced.layout.namedPages ?? []).length).toBe(baseline + 1);

        // Rename in one job.
        const renamed = await doc.pages.setName({
          name: 'Approved=Approved',
          pageObjectNumber: second.pageObjectNumber,
          replace: 'Approved=Goedgekeurd',
        });
        expect(find(renamed, 'Approved=Goedgekeurd')).toBe(undefined);
        expect(find(renamed, 'Approved=Approved')).toEqual({
          kind: 'page',
          pageObjectNumber: second.pageObjectNumber,
        });
        expect((renamed.layout.namedPages ?? []).length).toBe(baseline + 1);
      } finally {
        await doc.close();
      }
    });

    test('non-ASCII keys round-trip through set → list', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName) return;
        const before = await doc.pages.list();
        const key = 'Stämpel=Stämpel 日本';
        const result = await doc.pages.setName({
          name: key,
          pageObjectNumber: before.pages[0].pageObjectNumber,
        });
        expect(find(result, key)).toEqual({
          kind: 'page',
          pageObjectNumber: before.pages[0].pageObjectNumber,
        });
        const listed = await doc.pages.list();
        expect((listed.namedPages ?? []).some((entry) => entry.name === key)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('pages.removeName() drops the registration and keeps the page', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName || !doc.pages.removeName) return;
        const before = await doc.pages.list();
        await doc.pages.setName({
          name: 'Draft=Concept',
          pageObjectNumber: before.pages[0].pageObjectNumber,
        });
        const removed = await doc.pages.removeName({ name: 'Draft=Concept' });
        PageNameResultSchema.parse(removed);
        expect(find(removed, 'Draft=Concept')).toBe(undefined);
        expect(removed.layout.pages.length).toBe(before.pages.length);

        await expect(doc.pages.removeName({ name: 'Draft=Concept' })).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
      } finally {
        await doc.close();
      }
    });

    test('pages.setName() rejects an empty name and an unknown page', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName) return;
        const before = await doc.pages.list();
        await expect(
          doc.pages.setName({ name: '', pageObjectNumber: before.pages[0].pageObjectNumber }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        let unknownPage: unknown = null;
        try {
          await doc.pages.setName({ name: 'Ghost=Ghost', pageObjectNumber: 987654321 });
        } catch (error) {
          unknownPage = error;
        }
        expect(
          EngineError.is(unknownPage, EngineErrorCode.NotFound) ||
            EngineError.is(unknownPage, EngineErrorCode.InvalidArg),
        ).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('deleting a page removes every registration pointing at it', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName) return;
        const before = await doc.pages.list();
        if (before.pages.length < 2) return;
        const victim = before.pages[1].pageObjectNumber;
        const survivor = before.pages[0].pageObjectNumber;
        await doc.pages.setName({ name: 'Victim=One', pageObjectNumber: victim });
        await doc.pages.setName({ name: 'Victim=Two', pageObjectNumber: victim });
        await doc.pages.setName({ name: 'Survivor', pageObjectNumber: survivor });

        const deleted = await doc.pages.delete([victim]);
        const names = (deleted.layout.namedPages ?? []).map((entry) => entry.name);
        expect(names.includes('Victim=One')).toBe(false);
        expect(names.includes('Victim=Two')).toBe(false);
        expect(names).toContain('Survivor');
        // Nothing dangling was left behind by the delete.
        expect(
          (deleted.layout.namedPages ?? []).some((entry) => entry.target.kind === 'dangling'),
        ).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('abort on pages.setName() rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        if (!doc.pages.setName) return;
        const before = await doc.pages.list();
        const promise = doc.pages.setName({
          name: 'Aborted=Aborted',
          pageObjectNumber: before.pages[0].pageObjectNumber,
        });
        promise.abort();
        await expect(promise).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });
  });
}

function find(
  result: { layout: { namedPages?: { name: string; target: unknown }[] } },
  name: string,
) {
  return (result.layout.namedPages ?? []).find((entry) => entry.name === name)?.target;
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
