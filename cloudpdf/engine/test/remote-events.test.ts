import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  toPageRef,
  type DocumentEvent,
  type HighlightDraft,
  type RedactDraft,
} from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-remote-events-tenant';
const DOC_ID = 'sample-pdf-remote-events-cloud';
// A redaction destroys content, so it gets a document of its own.
const REDACTION_DOC_ID = 'sample-pdf-remote-redaction-cloud';

const QUAD: HighlightDraft['quadPoints'] = [
  {
    upperLeft: { x: 50, y: 100 },
    upperRight: { x: 150, y: 100 },
    lowerLeft: { x: 50, y: 80 },
    lowerRight: { x: 150, y: 80 },
  },
];

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-remote-events-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 8);
  await seedDocumentFromBytes(fx, TENANT_ID, REDACTION_DOC_ID, fixturePath, 8);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

describe('remote events: two engines, one document (the collaboration loop)', () => {
  test("A mutates → B receives kind:'remote' with A's payload; A gets NO echo", async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const engineB = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const docA = await engineA.open({ kind: 'id', id: DOC_ID });
    const docB = await engineB.open({ kind: 'id', id: DOC_ID });
    try {
      const eventsA: DocumentEvent[] = [];
      const eventsB: DocumentEvent[] = [];
      docA.events.subscribe((event) => eventsA.push(event));
      docB.events.subscribe((event) => eventsB.push(event));
      // Give B's lazy SSE stream a beat to connect before A mutates.
      await new Promise((r) => setTimeout(r, 300));

      const list = await docA.pages.list();
      const pageObjectNumber = list.pages[0].ref.objectNumber;
      const rotated = await docA.pages.rotate([toPageRef(pageObjectNumber)], 90);

      // A: exactly one event, its own, local.
      await waitFor(() => eventsA.length >= 1, "A's local event");
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].origin.kind).toBe('local');

      // B: exactly one event, remote, carrying A's result verbatim.
      await waitFor(() => eventsB.length >= 1, "B's remote event");
      expect(eventsB).toHaveLength(1);
      const remote = eventsB[0];
      expect(remote.type).toBe('pages.rotated');
      expect(remote.origin.kind).toBe('remote');
      expect(typeof remote.origin.serverId).toBe('number');
      if (remote.type === 'pages.rotated') {
        expect(remote.rotation).toBe(90);
        expect(remote.pages).toEqual([toPageRef(pageObjectNumber)]);
        expect(remote.layout).toEqual(rotated.layout);
        expect(remote.meta).toEqual(rotated.meta);
      }
      // Provenance: the remote event names A's engine instance.
      expect(remote.origin.sessionId).toBe(eventsA[0].origin.sessionId);

      // A's stream stays echo-free after B's event arrived everywhere.
      await new Promise((r) => setTimeout(r, 400));
      expect(eventsA).toHaveLength(1);

      // And B's manifest absorbed the pins: a follow-up read on B sees the
      // rotation without a manual refresh.
      const listB = await docB.pages.list();
      expect(listB.pages.find((p) => p.ref.objectNumber === pageObjectNumber)?.rotation).toBe(90);
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });

  test('B mutates back: the channel is symmetric', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const engineB = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const docA = await engineA.open({ kind: 'id', id: DOC_ID });
    const docB = await engineB.open({ kind: 'id', id: DOC_ID });
    try {
      const eventsA: DocumentEvent[] = [];
      docA.events.subscribe((event) => eventsA.push(event));
      await new Promise((r) => setTimeout(r, 300));

      const list = await docB.pages.list();
      const pageObjectNumber = list.pages[0].ref.objectNumber;
      const created = await docB
        .page(toPageRef(pageObjectNumber))
        .annotations.create({ subtype: 'highlight', contents: 'from B', quadPoints: QUAD });

      await waitFor(() => eventsA.length >= 1, "A's remote annotation event");
      const remote = eventsA[0];
      expect(remote.origin.kind).toBe('remote');
      expect(remote.type).toBe('annotations.created');
      if (remote.type === 'annotations.created') {
        expect(remote.annotation).toEqual(created.annotation);
        // The remote meta is the finalized result B received — the
        // finalize-in-txn work, visible.
        expect(remote.meta).toEqual(created.meta);
      }
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });

  test("custom keys: B hears A's write as metadata.customUpdated and its next read sees it", async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const engineB = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const docA = await engineA.open({ kind: 'id', id: DOC_ID });
    const docB = await engineB.open({ kind: 'id', id: DOC_ID });
    try {
      // B reads first, so its cached manifest points at the old leaf.
      const before = await docB.metadata.custom.get();
      expect(before['RemoteKey']).toBeUndefined();
      const eventsB: DocumentEvent[] = [];
      docB.events.subscribe((event) => eventsB.push(event));
      await new Promise((r) => setTimeout(r, 300));

      const written = await docA.metadata.custom.update({ RemoteKey: 'from A' });

      await waitFor(() => eventsB.length >= 1, "B's remote custom-metadata event");
      const remote = eventsB[0];
      expect(remote.origin.kind).toBe('remote');
      expect(remote.type).toBe('metadata.customUpdated');
      if (remote.type === 'metadata.customUpdated') {
        expect(remote.custom).toEqual(written.custom);
        expect(remote.meta).toEqual(written.meta);
      }
      // The event's pins moved B to the new leaf: no manual refresh.
      expect((await docB.metadata.custom.get())['RemoteKey']).toBe('from A');
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });

  test("redaction: B hears A's apply as redaction.applied and its next read is the redacted page", async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, REDACTION_DOC_ID),
    });
    const engineB = cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, REDACTION_DOC_ID),
    });
    const docA = await engineA.open({ kind: 'id', id: REDACTION_DOC_ID });
    const docB = await engineB.open({ kind: 'id', id: REDACTION_DOC_ID });
    try {
      const { pages } = await docA.pages.list();
      const { ref, size } = pages[0];
      // B reads the page first, so its cached manifest points at the text before.
      const before = await docB.page(ref).text.get();
      expect(before.text).not.toContain('REDACTED');
      const redactionsB: DocumentEvent[] = [];
      docB.events.subscribe((event) => {
        if (event.type === 'redaction.applied') redactionsB.push(event);
      });
      await new Promise((r) => setTimeout(r, 300));

      const marked = await docA.page(ref).annotations.create({
        subtype: 'redact',
        rect: { x: 0, y: 0, width: size.width, height: size.height },
        interiorColor: '#000000',
        overlayText: 'REDACTED',
        fontColor: '#ffffff',
      } satisfies RedactDraft);
      const applied = await docA.redaction!.apply({ annotations: [marked.annotation.ref] });
      expect(applied.results[0]?.status).toBe('applied');

      await waitFor(() => redactionsB.length >= 1, "B's remote redaction event");
      expect(redactionsB).toHaveLength(1);
      const remote = redactionsB[0];
      expect(remote.origin.kind).toBe('remote');
      if (remote.type === 'redaction.applied') {
        expect(remote.results).toEqual(applied.results);
        expect(remote.removedAnnotationCount).toBe(applied.removedAnnotationCount);
        expect(remote.meta).toEqual(applied.meta);
      }
      // The event's pins moved B past the redaction: what it reads now is the redacted page.
      const after = await docB.page(ref).text.get();
      expect(after.text).toContain('REDACTED');
      expect(after).toEqual(await docA.page(ref).text.get());
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });
});
