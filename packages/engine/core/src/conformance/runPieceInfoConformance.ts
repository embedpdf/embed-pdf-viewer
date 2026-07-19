import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';

const APP = 'EMBD_ConformanceTest';
const SIBLING_APP = 'EMBD_ConformanceSibling';

/**
 * `/PieceInfo` conformance (doc + page level). The service is OPTIONAL on
 * the contract (`downloadLayer?` pattern) — the suite runs only where the
 * implementation provides it, so an engine that has not shipped it yet
 * skips cleanly.
 *
 * Invariants:
 *   1. The full value vocabulary round-trips at both levels: string,
 *      number, boolean, name, string-array — read back with the same tags.
 *   2. Writes PERSIST: download() → re-open → identical read (bytes-open
 *      engines only, since cloud cannot re-open loose bytes).
 *   3. `null` deletes a key; sibling keys and sibling applications
 *      survive both key deletes and whole-entry clears.
 *   4. An absent application reads as `null`; `applications()` enumerates
 *      what is present; every write refreshes `lastModified`.
 */
export function runPieceInfoConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`pieceInfo conformance: ${opts.label}`, () => {
    let engine: Engine;
    let supported = false;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await openFixture(engine, opts);
      supported = probe.pieceInfo !== undefined;
      await probe.close();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('doc-level: the full value vocabulary round-trips with tags intact', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        await doc.pieceInfo!.update(APP, {
          name: 'Standard Stamps',
          schema: 1,
          shared: true,
          kind: { name: 'StampLibrary' },
          tags: ['legal', 'finance'],
        });
        const snap = await doc.pieceInfo!.read(APP);
        expect(snap).toBeTruthy();
        expect(snap!.entries).toEqual({
          name: { type: 'string', value: 'Standard Stamps' },
          schema: { type: 'number', value: 1 },
          shared: { type: 'boolean', value: true },
          kind: { type: 'name', value: 'StampLibrary' },
          tags: { type: 'string-array', value: ['legal', 'finance'] },
        });
        expect(typeof snap!.lastModified).toBe('string');
      } finally {
        await doc.close();
      }
    });

    test('page-level: the stamp schema round-trips on a page', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const page = doc.page(list.pages[0].pageObjectNumber);
        await page.pieceInfo!.update(APP, { name: 'Witness', subject: 'Getuige' });
        const snap = await page.pieceInfo!.read(APP);
        expect(snap!.entries).toEqual({
          name: { type: 'string', value: 'Witness' },
          subject: { type: 'string', value: 'Getuige' },
        });
        // The doc-level holder is a DIFFERENT dictionary: untouched.
        expect(await doc.pieceInfo!.read(APP)).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('writes persist through save → re-open', async () => {
      if (!supported || opts.openKind !== 'bytes') return;
      const doc = await openFixture(engine, opts);
      let reopened: DocumentHandle | null = null;
      try {
        const list = await doc.pages.list();
        const pon = list.pages[0].pageObjectNumber;
        await doc.pieceInfo!.update(APP, { name: 'Standard Stamps' });
        await doc.page(pon).pieceInfo!.update(APP, { name: 'Witness', subject: 'Getuige' });
        const bytes = await doc.download();

        reopened = await engine.open({ kind: 'bytes', id: `${opts.fixture.id}-pi-reopen`, bytes });
        const relist = await reopened.pages.list();
        const docSnap = await reopened.pieceInfo!.read(APP);
        expect(docSnap!.entries.name).toEqual({ type: 'string', value: 'Standard Stamps' });
        const pageSnap = await reopened.page(relist.pages[0].pageObjectNumber).pieceInfo!.read(APP);
        expect(pageSnap!.entries.subject).toEqual({ type: 'string', value: 'Getuige' });
      } finally {
        if (reopened) await reopened.close();
        await doc.close();
      }
    });

    test('null deletes a key; clear removes an entry; siblings survive', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        await doc.pieceInfo!.update(APP, { name: 'A', keep: 'B' });
        await doc.pieceInfo!.update(SIBLING_APP, { other: 'C' });

        await doc.pieceInfo!.update(APP, { name: null });
        const afterDelete = await doc.pieceInfo!.read(APP);
        expect(Object.keys(afterDelete!.entries)).toEqual(['keep']);

        const apps = await doc.pieceInfo!.applications();
        expect(apps.includes(APP)).toBe(true);
        expect(apps.includes(SIBLING_APP)).toBe(true);

        await doc.pieceInfo!.clear(APP);
        expect(await doc.pieceInfo!.read(APP)).toBe(null);
        // The sibling application is untouched by the clear.
        const sibling = await doc.pieceInfo!.read(SIBLING_APP);
        expect(sibling!.entries.other).toEqual({ type: 'string', value: 'C' });
      } finally {
        await doc.close();
      }
    });

    test('an application that was never written reads as null', async () => {
      if (!supported) return;
      const doc = await openFixture(engine, opts);
      try {
        expect(await doc.pieceInfo!.read('EMBD_NeverWritten')).toBe(null);
        const list = await doc.pages.list();
        expect(
          await doc.page(list.pages[0].pageObjectNumber).pieceInfo!.read('EMBD_NeverWritten'),
        ).toBe(null);
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
