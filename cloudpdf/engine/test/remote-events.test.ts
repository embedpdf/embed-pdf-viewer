import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentEvent, HighlightDraft } from '@embedpdf/engine-core/runtime';
import { createCloudEngine } from '../src/index';
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

const QUAD: HighlightDraft['quadPoints'] = [
  {
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 },
    p3: { x: 50, y: 80 },
    p4: { x: 150, y: 80 },
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
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

describe('remote events: two engines, one document (the collaboration loop)', () => {
  test("A mutates → B receives kind:'remote' with A's payload; A gets NO echo", async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const engineB = createCloudEngine({
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
      const pon = list.pages[0].pageObjectNumber;
      const rotated = await docA.pages.rotate([pon], 90);

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
        expect(remote.pageObjectNumbers).toEqual([pon]);
        expect(remote.layout).toEqual(rotated.layout);
        expect(remote.cache).toEqual(rotated.cache);
      }
      // Provenance: the remote event names A's engine instance.
      expect(remote.origin.sessionId).toBe(eventsA[0].origin.sessionId);

      // A's stream stays echo-free after B's event arrived everywhere.
      await new Promise((r) => setTimeout(r, 400));
      expect(eventsA).toHaveLength(1);

      // And B's manifest absorbed the pins: a follow-up read on B sees the
      // rotation without a manual refresh.
      const listB = await docB.pages.list();
      expect(listB.pages.find((p) => p.pageObjectNumber === pon)?.rotation).toBe(90);
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });

  test('B mutates back: the channel is symmetric', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engineA = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
    const engineB = createCloudEngine({
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
      const pon = list.pages[0].pageObjectNumber;
      const created = await docB
        .page(pon)
        .annotations.create({ subtype: 'highlight', contents: 'from B', quadPoints: QUAD });

      await waitFor(() => eventsA.length >= 1, "A's remote annotation event");
      const remote = eventsA[0];
      expect(remote.origin.kind).toBe('remote');
      expect(remote.type).toBe('annotation.created');
      if (remote.type === 'annotation.created') {
        expect(remote.created).toEqual(created.created);
        // The remote meta carries the SAME cloud-stable revision tokens A
        // would get from its own reads — the finalize-in-txn work, visible.
        expect(remote.meta).toEqual(created.meta);
      }
    } finally {
      await docA.close();
      await docB.close();
      await engineA.destroy();
      await engineB.destroy();
    }
  });
});
