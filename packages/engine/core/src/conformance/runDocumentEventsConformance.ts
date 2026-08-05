import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { HighlightDraft } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { DocumentEvent } from '../events/DocumentEvent';

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
 * collaboration design rests on — do NOT loosen these without re-reading
 * `DocumentEvent`:
 *
 *   1. EXACTLY ONCE: every confirmed mutation produces exactly one event,
 *      in mutation order, regardless of engine (local worker or cloud HTTP).
 *   2. GROUND TRUTH: a failed mutation publishes nothing; events fire only
 *      after confirmation.
 *   3. RESULTS RIDE VERBATIM: each event embeds the result the caller
 *      received, deep-equal field for field.
 *   4. PROVENANCE: own mutations are `origin.kind: 'local'` with a stable
 *      per-engine-instance `sessionId`.
 *   5. Unsubscribe stops delivery.
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
        const pon = list.pages[0].pageObjectNumber;
        const page = doc.page(pon);

        const draft: HighlightDraft = {
          subtype: 'highlight',
          contents: 'events conformance',
          quadPoints: QUAD,
        };
        const created = await page.annotations.create(draft);
        const updated = await page.annotations.update(created.created.ref, {
          subtype: 'highlight',
          contents: 'updated',
        });
        const rotated = await doc.pages.rotate([pon], 90);
        const victim = list.pages[2].pageObjectNumber;
        const deleted = await doc.pages.delete([victim]);
        const meta = await doc.metadata.update({ title: 'events conformance' });

        expect(events.map((event) => event.type)).toEqual([
          'annotation.created',
          'annotation.updated',
          'pages.rotated',
          'pages.deleted',
          'metadata.updated',
        ]);

        // The embedded results are the returned results, field for field.
        const [evCreated, evUpdated, evRotated, evDeleted, evMeta] = events;
        if (evCreated.type === 'annotation.created') {
          expect(evCreated.pageObjectNumber).toBe(pon);
          expect(evCreated.created).toEqual(created.created);
          expect(evCreated.meta).toEqual(created.meta);
        }
        if (evUpdated.type === 'annotation.updated') {
          expect(evUpdated.updated).toEqual(updated.updated);
        }
        if (evRotated.type === 'pages.rotated') {
          expect(evRotated.pageObjectNumbers).toEqual([pon]);
          expect(evRotated.rotation).toBe(90);
          expect(evRotated.layout).toEqual(rotated.layout);
          expect(evRotated.cache).toEqual(rotated.cache);
        }
        if (evDeleted.type === 'pages.deleted') {
          expect(evDeleted.pageObjectNumbers).toEqual([victim]);
          expect(evDeleted.layout).toEqual(deleted.layout);
        }
        if (evMeta.type === 'metadata.updated') {
          expect(evMeta.metadata).toEqual(meta.metadata);
        }

        // Provenance: own mutations, one engine instance.
        for (const event of events) {
          expect(event.origin.kind).toBe('local');
          expect(typeof event.origin.sessionId).toBe('string');
          expect(event.origin.sessionId.length > 0).toBe(true);
          expect(event.origin.sessionId).toBe(events[0].origin.sessionId);
          expect(typeof event.origin.ts).toBe('number');
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
          await doc.pages.delete(list.pages.map((p) => p.pageObjectNumber));
        } catch (err) {
          caught = err;
        }
        expect(caught !== undefined).toBe(true);
        expect(events.length).toBe(0);
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
        await doc.pages.rotate([list.pages[0].pageObjectNumber], 180);
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
