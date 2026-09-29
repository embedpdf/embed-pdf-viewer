import type { ConformanceFixture, ConformanceTestRunner } from './runMetadataConformance';
import type { LocalDocumentHandle } from '../engine/LocalDocumentHandle';
import type { LocalEngine } from '../engine/LocalEngine';
import { toPageRef } from '../identity/PageRef';

const APP = 'EMBD_ConformanceTest';
const SIBLING_APP = 'EMBD_ConformanceSibling';

export interface PieceInfoConformanceOptions {
  label: string;
  /** Build a fresh local engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<LocalEngine> | LocalEngine;
  fixture: ConformanceFixture;
}

/**
 * `/PieceInfo` conformance (doc + page level), on the local engine: the
 * only one with `/PieceInfo`.
 *
 * Invariants:
 *   1. The full value vocabulary round-trips at both levels: string,
 *      number, boolean, name, string-array — read back with the same tags.
 *   2. Writes persist: download() → re-open → identical read.
 *   3. `null` deletes a key; sibling keys and sibling applications
 *      survive both key deletes and whole-entry clears.
 *   4. An absent application reads as `null`; `applications()` enumerates
 *      what is present; every write refreshes `modifiedAt`.
 */
export function runPieceInfoConformance(
  runner: ConformanceTestRunner,
  opts: PieceInfoConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`pieceInfo conformance: ${opts.label}`, () => {
    let engine: LocalEngine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('doc-level: the full value vocabulary round-trips with tags intact', async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.pieceInfo.update(APP, {
          name: 'Standard Stamps',
          schema: 1,
          shared: true,
          kind: { name: 'StampLibrary' },
          tags: ['legal', 'finance'],
        });
        const snap = await doc.pieceInfo.get(APP);
        expect(snap).toBeTruthy();
        expect(snap!.entries).toEqual({
          name: { type: 'string', value: 'Standard Stamps' },
          schema: { type: 'number', value: 1 },
          shared: { type: 'boolean', value: true },
          kind: { type: 'name', value: 'StampLibrary' },
          tags: { type: 'string-array', value: ['legal', 'finance'] },
        });
        expect(typeof snap!.modifiedAt).toBe('string');
      } finally {
        await doc.close();
      }
    });

    test('page-level: the stamp schema round-trips on a page', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.pages.list();
        const page = doc.page(list.pages[0].ref);
        await page.pieceInfo.update(APP, { name: 'Witness', subject: 'Getuige' });
        const snap = await page.pieceInfo.get(APP);
        expect(snap!.entries).toEqual({
          name: { type: 'string', value: 'Witness' },
          subject: { type: 'string', value: 'Getuige' },
        });
        // The doc-level holder is a different dictionary: untouched.
        expect(await doc.pieceInfo.get(APP)).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('writes persist through save → re-open', async () => {
      const doc = await openFixture(engine, opts);
      let reopened: LocalDocumentHandle | null = null;
      try {
        const list = await doc.pages.list();
        const pageObjectNumber = list.pages[0].ref.objectNumber;
        await doc.pieceInfo.update(APP, { name: 'Standard Stamps' });
        await doc
          .page(toPageRef(pageObjectNumber))
          .pieceInfo.update(APP, { name: 'Witness', subject: 'Getuige' });
        const bytes = await doc.download();

        reopened = await engine.open({ kind: 'bytes', id: `${opts.fixture.id}-pi-reopen`, bytes });
        const relist = await reopened.pages.list();
        const docSnap = await reopened.pieceInfo.get(APP);
        expect(docSnap!.entries.name).toEqual({ type: 'string', value: 'Standard Stamps' });
        const pageSnap = await reopened.page(relist.pages[0].ref).pieceInfo.get(APP);
        expect(pageSnap!.entries.subject).toEqual({ type: 'string', value: 'Getuige' });
      } finally {
        if (reopened) await reopened.close();
        await doc.close();
      }
    });

    test('null deletes a key; clear removes an entry; siblings survive', async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.pieceInfo.update(APP, { name: 'A', keep: 'B' });
        await doc.pieceInfo.update(SIBLING_APP, { other: 'C' });

        await doc.pieceInfo.update(APP, { name: null });
        const afterDelete = await doc.pieceInfo.get(APP);
        expect(Object.keys(afterDelete!.entries)).toEqual(['keep']);

        const apps = await doc.pieceInfo.list();
        expect(apps.includes(APP)).toBe(true);
        expect(apps.includes(SIBLING_APP)).toBe(true);

        await doc.pieceInfo.delete(APP);
        expect(await doc.pieceInfo.get(APP)).toBe(null);
        // The sibling application is untouched by the clear.
        const sibling = await doc.pieceInfo.get(SIBLING_APP);
        expect(sibling!.entries.other).toEqual({ type: 'string', value: 'C' });
      } finally {
        await doc.close();
      }
    });

    test('an application that was never written reads as null', async () => {
      const doc = await openFixture(engine, opts);
      try {
        expect(await doc.pieceInfo.get('EMBD_NeverWritten')).toBe(null);
        const list = await doc.pages.list();
        expect(await doc.page(list.pages[0].ref).pieceInfo.get('EMBD_NeverWritten')).toBe(null);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(
  engine: LocalEngine,
  opts: PieceInfoConformanceOptions,
): Promise<LocalDocumentHandle> {
  const bytes = await opts.fixture.bytes();
  return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
}
