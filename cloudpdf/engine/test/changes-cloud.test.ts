import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  isSkippedItem,
  toAttachmentRef,
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
 * events, an undo naming what it undid; an undo still applies once the layer
 * was saved and opened again; and gate C2, a burst of actions each undone, at
 * +500 ms a request.
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

/** `notes.txt`, embedded with `bytes`. */
const NOTES_REF = toAttachmentRef('notes.txt');
const embedNotes = (bytes: Uint8Array): ChangeOp => ({
  type: 'attachments.create',
  file: { name: 'notes.txt', mimeType: 'text/plain' },
  resources: { file: bytes },
});

/** A fetch that records each answer's URL and status. */
function watchingFetch() {
  const answers: { url: string; status: number }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    answers.push({ url, status: response.status });
    return response;
  };
  return { fetchFn, answers };
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

  test('changes sent together meet the pages as the ones before them left them', async () => {
    const recording = recordingFetch();
    const doc = await openFresh(recording.fetchFn);
    try {
      const { page, square } = await landmarks(doc);
      // A change on the page, then the page's delete, in one request.
      const [updated, deleted] = await Promise.all([
        doc.apply(
          { ops: [{ type: 'annotations.update', ref: square.ref, patch: { color: '#e11d48' } }] },
          { opId: 'update-1' },
        ),
        doc.apply({ ops: [{ type: 'pages.delete', pages: [page] }] }, { opId: 'delete-1' }),
      ]);
      expect(recording.requests).toEqual([['update-1', 'delete-1']]);
      expect(updated.items.map((item) => item.type)).toEqual(['annotations.update']);
      expect(deleted.items.map((item) => item.type)).toEqual(['pages.delete']);

      // The page's return, then a change on it, in one request.
      const [restored, recolored] = await Promise.all([
        doc.apply({ undoOf: 'delete-1' }, { opId: 'undo-1' }),
        doc.apply(
          { ops: [{ type: 'annotations.update', ref: square.ref, patch: { color: '#0000ff' } }] },
          { opId: 'update-2' },
        ),
      ]);
      expect(recording.requests[1]).toEqual(['undo-1', 'update-2']);
      expect(restored.items.map((item) => item.type)).toEqual(['pages.restore']);
      expect(recolored.items.map((item) => item.type)).toEqual(['annotations.update']);
    } finally {
      await doc.close();
    }
  });

  test('another session reads an outline change without asking for the old one', async () => {
    const docA = await openFresh();
    const answers: { url: string; status: number }[] = [];
    const watching: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      answers.push({ url, status: response.status });
      return response;
    };
    const docB = await openAgain(docA.id, watching);
    try {
      expect((await docB.outline.get()).items).toEqual([]);
      const eventsB: DocumentEvent[] = [];
      docB.events.subscribe((event) => eventsB.push(event));
      // Give B's lazy stream a beat to connect before A writes.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await docA.apply({
        ops: [{ type: 'outline.create', parent: null, data: { title: 'From A' } }],
      });
      await waitFor(() => eventsB.some((event) => event.type === 'outline.created'), 'the event');
      answers.length = 0;
      const { items } = await docB.outline.get();
      expect(items.map((item) => item.title)).toEqual(['From A']);
      // B's manifest took the event's pins: no stale read that a CDN could have answered.
      expect(answers.filter(({ url }) => url.includes('/outline'))).toHaveLength(1);
      expect(answers.every(({ status }) => status === 200)).toBe(true);
    } finally {
      await docB.close();
      await docA.close();
    }
  });

  test('another session sees a file added, removed and brought back, and reads it fresh', async () => {
    const docA = await openFresh();
    const { fetchFn, answers } = watchingFetch();
    const docB = await openAgain(docA.id, fetchFn);
    try {
      expect((await docB.attachments.list()).attachments).toEqual([]);
      const eventsB: DocumentEvent[] = [];
      docB.events.subscribe((event) => eventsB.push(event));
      // Give B's lazy stream a beat to connect before A writes.
      await new Promise((resolve) => setTimeout(resolve, 300));

      const notes = new TextEncoder().encode('Notes from A.');
      await docA.apply({ ops: [embedNotes(notes)] });
      await docA.apply(
        { ops: [{ type: 'attachments.delete', ref: NOTES_REF }] },
        { opId: 'delete-notes' },
      );
      await docA.apply({ undoOf: 'delete-notes' }, { opId: 'undo-delete-notes' });
      await waitFor(() => eventsB.length >= 3, "B's remote events");
      expect(eventsB.map((event) => event.type)).toEqual([
        'attachments.created',
        'attachments.deleted',
        'attachments.restored',
      ]);
      expect(eventsB[2]).toMatchObject({
        origin: { kind: 'remote', undoOf: 'delete-notes' },
        attachment: { ref: NOTES_REF, name: 'notes.txt', mimeType: 'text/plain' },
      });

      answers.length = 0;
      const { attachments } = await docB.attachments.list();
      expect(attachments.map((attachment) => attachment.name)).toEqual(['notes.txt']);
      expect(await docB.attachments.download(NOTES_REF)).toEqual(notes);
      // B's manifest took the events' pins: no stale read that a CDN could have answered.
      expect(answers.filter(({ url }) => url.includes('/attachments@'))).toHaveLength(1);
      expect(answers.every(({ status }) => status === 200)).toBe(true);
    } finally {
      await docB.close();
      await docA.close();
    }
  });

  test('a removed file comes back with its undo after the layer was saved and opened again', async () => {
    const docA = await openFresh();
    const notes = new TextEncoder().encode('Notes kept by the capture.');
    await docA.apply({ ops: [embedNotes(notes)] });
    await docA.apply(
      { ops: [{ type: 'attachments.delete', ref: NOTES_REF }] },
      { opId: 'delete-notes' },
    );
    await docA.close();
    // The server opens the layer again from its saved artifact, which has
    // dropped the file nothing reached any more.
    fixture().bundle.documentService!.invalidateLayerSession(docA.id, 'default');

    const again = await openAgain(docA.id);
    try {
      const undo = await again.apply({ undoOf: 'delete-notes' });
      expect(undo.items.map((item) => (isSkippedItem(item) ? 'skipped' : item.type))).toEqual([
        'attachments.restore',
      ]);
      expect(await again.attachments.download(NOTES_REF)).toEqual(notes);
    } finally {
      await again.close();
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
        [{ type: 'annotations.reorder', page, refs: [square.ref], position: 'start' }],
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
