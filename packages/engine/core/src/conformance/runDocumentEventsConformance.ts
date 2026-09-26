import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { HighlightDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { DocumentEvent } from '../events/DocumentEvent';
import { toPageRef } from '../identity/PageRef';

const QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
  },
];

/**
 * Document event stream conformance suite. Verifies the invariants the
 * collaboration design rests on — do not loosen these without re-reading
 * `DocumentEvent`:
 *
 *   1. Exactly once: every confirmed mutation produces exactly one event,
 *      in mutation order, regardless of engine (local worker or cloud HTTP).
 *   2. Ground truth: a failed mutation publishes nothing; events fire only
 *      after confirmation.
 *   3. Results ride verbatim: each event embeds the result the caller
 *      received, deep-equal field for field.
 *   4. Provenance: own mutations are `origin.kind: 'local'` with a stable
 *      per-engine-instance `sessionId`.
 *   5. Unsubscribe stops delivery; `on(type)` hears only its type.
 *   6. Published before settlement: the event for a session's own mutation
 *      reaches subscribers before the mutation's promise settles, so a
 *      caller that awaits the mutation already sees state derived from it.
 *
 * Both local (worker host + WASM) and cloud (HTTP + @cloudpdf/server)
 * implementations must pass identically.
 */
export function runDocumentEventsConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`document events conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('every confirmed mutation publishes exactly one event, results verbatim', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));

        const list = await doc.pages.list();
        if (list.pages.length < 3) return;
        const pageObjectNumber = list.pages[0].ref.pageObjectNumber;
        const page = doc.page(toPageRef(pageObjectNumber));

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'events conformance',
          quadPoints: QUAD,
        };
        const created = await page.annotations.create(draft);
        const updated = await page.annotations.update(created.annotation.ref, {
          subtype: 'highlight',
          contents: 'updated',
        });
        const rotated = await doc.pages.rotate([toPageRef(pageObjectNumber)], 90);
        const victim = list.pages[2].ref.pageObjectNumber;
        const deleted = await doc.pages.delete([toPageRef(victim)]);
        const meta = await doc.metadata.update({ title: 'events conformance' });

        expect(events.map((event) => event.type)).toEqual([
          'annotations.created',
          'annotations.updated',
          'pages.rotated',
          'pages.deleted',
          'metadata.updated',
        ]);

        // The embedded results are the returned results, field for field.
        const [evCreated, evUpdated, evRotated, evDeleted, evMeta] = events;
        if (evCreated.type === 'annotations.created') {
          expect(evCreated.page).toEqual(toPageRef(pageObjectNumber));
          expect(evCreated.annotation).toEqual(created.annotation);
          expect(evCreated.meta).toEqual(created.meta);
        }
        if (evUpdated.type === 'annotations.updated') {
          expect(evUpdated.annotation).toEqual(updated.annotation);
        }
        if (evRotated.type === 'pages.rotated') {
          expect(evRotated.pages).toEqual([toPageRef(pageObjectNumber)]);
          expect(evRotated.rotation).toBe(90);
          expect(evRotated.layout).toEqual(rotated.layout);
          expect(evRotated.cache).toEqual(rotated.cache);
        }
        if (evDeleted.type === 'pages.deleted') {
          expect(evDeleted.pages).toEqual([toPageRef(victim)]);
          expect(evDeleted.layout).toEqual(deleted.layout);
        }
        if (evMeta.type === 'metadata.updated') {
          expect(evMeta.metadata).toEqual(meta.metadata);
        }

        // Provenance: own mutations, one engine instance. Every event in
        // this suite is a mutation event — transport notices
        // (`stream.desynced`) never fire from local mutations, so a
        // missing origin here is a real failure, asserted explicitly.
        const first = events[0];
        expect(first !== undefined && 'origin' in first).toBe(true);
        if (first === undefined || !('origin' in first)) return;
        for (const event of events) {
          expect('origin' in event).toBe(true);
          if (!('origin' in event)) continue;
          expect(event.origin.kind).toBe('local');
          expect(typeof event.origin.sessionId).toBe('string');
          expect(event.origin.sessionId.length > 0).toBe(true);
          expect(event.origin.sessionId).toBe(first.origin.sessionId);
          expect(typeof event.origin.ts).toBe('number');
        }
      } finally {
        await doc.close();
      }
    });

    test('pages.inserted rides verbatim', async () => {
      const doc = await openFixture(engine, opts);
      try {
        // insertBlank needs no source bytes, so it is the fixture-free way
        // to exercise the event.
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));

        const inserted = await doc.pages.insertBlank({ size: { width: 396, height: 612 } }, 0);

        expect(events.map((event) => event.type)).toEqual(['pages.inserted']);
        const [evInserted] = events;
        if (evInserted.type === 'pages.inserted') {
          expect(evInserted.insertedPages).toEqual(inserted.insertedPages);
          expect(evInserted.layout).toEqual(inserted.layout);
          expect(evInserted.cache).toEqual(inserted.cache);
          expect(evInserted.toIndex).toBe(0);
          expect(evInserted.origin.kind).toBe('local');
        }
      } finally {
        await doc.close();
      }
    });

    test('a FAILED mutation publishes nothing (events are ground truth)', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));
        const list = await doc.pages.list();
        let caught: unknown;
        try {
          // Deleting every page is rejected — see PageDeleteInput.
          await doc.pages.delete(list.pages.map((p) => p.ref));
        } catch (err) {
          caught = err;
        }
        expect(caught !== undefined).toBe(true);
        expect(events.length).toBe(0);
      } finally {
        await doc.close();
      }
    });

    test('own mutations are published before their promise settles', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));
        const seenAtSettlement: number[] = [];
        await doc.metadata
          .update({ title: 'published before settlement' })
          .then(() => seenAtSettlement.push(events.length));
        const list = await doc.pages.list();
        await doc
          .page(list.pages[0].ref)
          .annotations.create({ subtype: 'highlight', contents: 'ordering', quadPoints: QUAD })
          .then(() => seenAtSettlement.push(events.length));
        expect(seenAtSettlement).toEqual([1, 2]);
      } finally {
        await doc.close();
      }
    });

    test('on(type) hears only that type, typed by it; its unsubscriber stops it', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const rotated: number[] = [];
        const stop = doc.events.on('pages.rotated', (event) => rotated.push(event.rotation));
        const list = await doc.pages.list();
        await doc.metadata.update({ title: 'on(type)' });
        await doc.pages.rotate([list.pages[0].ref], 90);
        expect(rotated).toEqual([90]);
        stop();
        await doc.pages.rotate([list.pages[0].ref], 180);
        expect(rotated).toEqual([90]);
      } finally {
        await doc.close();
      }
    });

    test('unsubscribe stops delivery', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const events: DocumentEvent[] = [];
        const unsubscribe = doc.events.subscribe((event) => events.push(event));
        unsubscribe();
        const list = await doc.pages.list();
        await doc.pages.rotate([list.pages[0].ref], 180);
        expect(events.length).toBe(0);
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
