import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  isSkippedItem,
  type ChangeOp,
  type DocumentEvent,
  type DocumentHandle,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * What only the cloud engine does with changes: changes called together go
 * out as one request, one request at a time; another session sees a change's
 * events, an undo naming what it undid; and gate C2, a burst of actions each
 * undone, at +500 ms a request.
 */

const TENANT_ID = 'cloud-changes-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-changes-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

/** A fetch that waits `delayMs` before each request, and records the requests of changes. */
function recordingFetch(delayMs = 0) {
  const requests: string[][] = [];
  let inFlight = 0;
  let most = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const changes = init?.method === 'POST' && url.endsWith('/changes');
    if (changes) {
      inFlight++;
      most = Math.max(most, inFlight);
      const body = JSON.parse(String(init.body)) as { changes: { opId: string }[] };
      requests.push(body.changes.map((change) => change.opId));
    }
    try {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return await fetch(input, init);
    } finally {
      if (changes) inFlight--;
    }
  };
  return { fetchFn, requests, most: () => most };
}

async function openFresh(fetchFn?: typeof fetch): Promise<DocumentHandle> {
  const docId = `changes-cloud-${++docs}`;
  await seedDocument(fixture(), TENANT_ID, docId, CHANGE_FIXTURE_PDF);
  return openAgain(docId, fetchFn);
}

function openAgain(docId: string, fetchFn?: typeof fetch): Promise<DocumentHandle> {
  const engine = cloudEngine({
    baseUrl: fixture().baseUrl,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
  return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, docId) });
}

/** The fixture's pages, and the square and note on its first page. */
async function landmarks(doc: DocumentHandle) {
  const { pages } = await doc.pages.list();
  const [page, empty] = pages.map((entry) => entry.ref) as [PageRef, PageRef];
  const { annotations } = await doc.page(page).annotations.list();
  const square = annotations.find((annotation) => annotation.subtype === 'square')!;
  const note = annotations.find((annotation) => annotation.subtype === 'text')!;
  return { page, empty, square, note };
}

/** What the layer holds, exactly: every page's annotations, the fields, the metadata. */
async function factsOf(doc: DocumentHandle): Promise<string> {
  const { pages } = await doc.pages.list();
  const annotations = await Promise.all(
    pages.map(async ({ ref }) => (await doc.page(ref).annotations.list()).annotations),
  );
  const [{ fields }, metadata] = await Promise.all([doc.forms.list(), doc.metadata.get()]);
  return JSON.stringify({ annotations, fields, title: metadata.title });
}

const waitFor = async (predicate: () => boolean, what: string, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe('changes on the cloud engine', () => {
  test('a delete and its undo, called together, go out as one request, in order', async () => {
    const recording = recordingFetch();
    const doc = await openFresh(recording.fetchFn);
    try {
      const { note } = await landmarks(doc);
      const before = await factsOf(doc);
      const [deleted, undone] = await Promise.all([
        doc.apply({ ops: [{ type: 'annotations.delete', ref: note.ref }] }, { opId: 'delete-1' }),
        doc.apply({ undoOf: 'delete-1' }, { opId: 'undo-1' }),
      ]);
      expect(recording.requests).toEqual([['delete-1', 'undo-1']]);
      expect(deleted.items.map((item) => item.type)).toEqual(['annotations.delete']);
      expect(undone.items.map((item) => item.type)).toContain('annotations.restore');
      expect(await factsOf(doc)).toEqual(before);
    } finally {
      await doc.close();
    }
  });

  test('another session sees a change’s events, and an undo’s name what it undid', async () => {
    const docA = await openFresh();
    const docB = await openAgain(docA.id);
    try {
      const { square } = await landmarks(docA);
      const eventsA: DocumentEvent[] = [];
      const eventsB: DocumentEvent[] = [];
      docA.events.subscribe((event) => eventsA.push(event));
      docB.events.subscribe((event) => eventsB.push(event));
      // Give B's lazy stream a beat to connect before A writes.
      await new Promise((resolve) => setTimeout(resolve, 300));

      const recolor: ChangeOp = {
        type: 'annotations.update',
        ref: square.ref,
        patch: { color: '#e11d48' },
      };
      await docA.apply({ ops: [recolor] }, { opId: 'recolor-1' });
      await docA.apply({ undoOf: 'recolor-1' }, { opId: 'undo-recolor-1' });

      await waitFor(() => eventsB.length >= 2, "B's remote events");
      const [change, undo] = eventsB;
      expect(change).toMatchObject({
        type: 'annotations.updated',
        origin: { kind: 'remote', tx: { id: 'recolor-1', index: 0, count: 1 } },
      });
      expect(change!.type === 'annotations.updated' && change.annotation).toMatchObject({
        color: '#e11d48',
      });
      expect(undo).toMatchObject({
        type: 'annotations.updated',
        origin: { kind: 'remote', undoOf: 'recolor-1', tx: { id: 'undo-recolor-1' } },
      });
      // A sees its own two, local, and no echo.
      expect(eventsA.map((event) => 'origin' in event && event.origin.kind)).toEqual([
        'local',
        'local',
      ]);
      expect(eventsA[1]).toMatchObject({ origin: { undoOf: 'recolor-1' } });
    } finally {
      await docA.close();
      await docB.close();
    }
  });

  test('gate C2: at +500 ms, ten actions in a burst, each undone, one request at a time, back to the start', async () => {
    const recording = recordingFetch(500);
    const doc = await openFresh(recording.fetchFn);
    try {
      const { page, empty, square, note } = await landmarks(doc);
      const before = await factsOf(doc);
      const name = { kind: 'fqn', name: 'name' } as const;
      const box = (x: number) => ({ x, y: 120, width: 40, height: 30 });
      // Odd actions are undone while still pending, so they leave nothing for
      // the next. Even ones are undone once applied, after the burst: each is
      // the last action to touch what it touches.
      const actions: ChangeOp[][] = [
        [{ type: 'annotations.create', page: empty, data: { subtype: 'square', box: box(20) } }],
        [{ type: 'annotations.update', ref: square.ref, patch: { color: '#e11d48' } }],
        [{ type: 'metadata.update', patch: { title: 'Burst' } }],
        [{ type: 'forms.setDisplay', field: name, display: 'hidden' }],
        [{ type: 'annotations.create', page: empty, data: { subtype: 'circle', box: box(80) } }],
        [{ type: 'annotations.update', ref: square.ref, patch: { color: '#16a34a' } }],
        [{ type: 'forms.setValue', field: name, value: { value: 'Bea' } }],
        [{ type: 'annotations.move', page, refs: [square.ref], toIndex: 0 }],
        [{ type: 'annotations.delete', ref: note.ref }],
        [{ type: 'metadata.update', patch: { subject: 'Burst' } }],
      ];
      const settled = actions.map((ops, i) => {
        const opId = `burst-${i}`;
        const action = doc.apply({ ops }, { opId });
        const undo =
          i % 2 === 1
            ? doc.apply({ undoOf: opId })
            : action.then(() => doc.apply({ undoOf: opId }));
        return Promise.all([action, undo]);
      });
      const results = await Promise.all(settled);

      expect(recording.most()).toBe(1);
      expect(recording.requests.flat()).toHaveLength(20);
      expect(recording.requests.length).toBeLessThan(20);
      for (const [action, undo] of results) {
        expect(action.meta.undoable).toBe(true);
        expect(undo.items.some((item) => isSkippedItem(item) || 'skipped' in item)).toBe(false);
      }
      expect(await factsOf(doc)).toEqual(before);
    } finally {
      await doc.close();
    }
  }, 60_000);
});
