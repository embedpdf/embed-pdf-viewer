import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  annotationKey,
  toPageRef,
  type DocumentEvent,
  type DocumentHandle,
} from '@embedpdf/engine-core/runtime';
import {
  runAnnotationCopyConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const localFixtures = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
);
const fixtures = {
  authoring: resolve(localFixtures, 'hello_world.pdf'),
  'acrobat-stamps': resolve(localFixtures, 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(localFixtures, 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(localFixtures, 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(localFixtures, 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-annotation-copy-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-annotation-copy-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runAnnotationCopyConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () =>
    cloudEngine({ baseUrl: fixture().baseUrl, token: tenantToken(fixture(), TENANT_ID) }),
  // Each test opens its own copy: the tests write to their documents.
  open: async (engine, name) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name], 1);
    return engine.open({ kind: 'id', id });
  },
  openScoped: async (engine, name, scope) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name], 1);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, id, scope) });
  },
});

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A fetch through which the client says it speaks `version`. */
function clientSaying(version: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('EmbedPDF-Version', version);
    return fetch(input, { ...init, headers });
  };
}

describe('annotation copy on the cloud engine', () => {
  const rect = (x: number) => ({ x, y: 20, width: 40, height: 30 });

  /** One document, opened by `count` sessions; the last one's fetch is `lastFetch`. */
  const sessions = async (count: number, lastFetch?: typeof fetch): Promise<DocumentHandle[]> => {
    const id = `copy-shared-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures.authoring, 1);
    return Promise.all(
      Array.from({ length: count }, (_, at) =>
        cloudEngine({
          baseUrl: fixture().baseUrl,
          token: tenantToken(fixture(), TENANT_ID),
          ...(lastFetch && at === count - 1 ? { fetch: lastFetch } : {}),
        }).open({ kind: 'id', id }),
      ),
    );
  };

  test('a retry under the same opId copies once and answers the same', async () => {
    const [doc] = await sessions(1);
    try {
      const { pages } = await doc!.pages.list();
      const page = doc!.page(toPageRef(pages[0]!.ref.objectNumber));
      const { annotation } = await page.annotations.create({ subtype: 'square', box: rect(20) });
      const first = await doc!.annotations.copy([annotation.ref], { opId: 'copy-once' });
      const again = await doc!.annotations.copy([annotation.ref], { opId: 'copy-once' });
      expect(again.annotations).toEqual(first.annotations);
      expect((await page.annotations.list()).annotations).toHaveLength(2);
    } finally {
      await doc!.close();
    }
  });

  test('another session hears one annotations.created per copy, as one transaction', async () => {
    const [writer, other] = await sessions(2);
    try {
      const { pages } = await writer!.pages.list();
      const page = writer!.page(toPageRef(pages[0]!.ref.objectNumber));
      const refs = [
        (await page.annotations.create({ subtype: 'square', box: rect(20) })).annotation.ref,
        (await page.annotations.create({ subtype: 'circle', box: rect(80) })).annotation.ref,
      ];
      const events: DocumentEvent[] = [];
      other!.events.subscribe((event) => events.push(event));
      const result = await writer!.annotations.copy(refs, {
        offset: { x: 10, y: 10 },
        opId: 'copy-heard',
      });
      // The stream starts where the session's manifest was read, so it brings
      // the two creates too: the copy's events are the ones its `opId` names.
      const ofCopy = () =>
        events.filter(
          (event) => 'origin' in event && event.origin.transaction?.id === 'copy-heard',
        );
      await waitFor(() => ofCopy().length >= 2, "the other session's events");
      expect(ofCopy().map((event) => event.type)).toEqual([
        'annotations.created',
        'annotations.created',
      ]);
      ofCopy().forEach((event, index) => {
        expect(event).toMatchObject({
          origin: { kind: 'remote', transaction: { id: 'copy-heard', index, count: 2 } },
        });
        expect(event.type === 'annotations.created' && annotationKey(event.annotation.ref)).toBe(
          annotationKey(result.annotations[index]!.ref),
        );
      });
    } finally {
      await writer!.close();
      await other!.close();
    }
  });

  test('a client older than the copy is told to read again, and lists the copies', async () => {
    // A copy arrived in 3.2. The packages may still carry an earlier version,
    // and a client of the server's own version reads every kind, so the older
    // client says 3.0.
    const [writer, older] = await sessions(2, clientSaying('3.0'));
    try {
      const { pages } = await writer!.pages.list();
      const pageRef = toPageRef(pages[0]!.ref.objectNumber);
      const page = writer!.page(pageRef);
      const { annotation } = await page.annotations.create({ subtype: 'square', box: rect(20) });
      await older!.annotations.list();
      const events: DocumentEvent[] = [];
      older!.events.subscribe((event) => events.push(event));

      const result = await writer!.annotations.copy([annotation.ref], { offset: { x: 10, y: 10 } });
      const desyncs = () => events.filter((event) => event.type === 'stream.desynced');
      await waitFor(() => desyncs().length >= 1, 'the desync');
      expect(desyncs()).toEqual([
        { type: 'stream.desynced', reason: 'unknown-change', at: expect.any(String) },
      ]);
      // No event without a type: the copy never reached it as a row.
      expect(events.every((event) => typeof event.type === 'string')).toBe(true);
      const seen = (await older!.annotations.list()).annotations.map((each) =>
        annotationKey(each.ref),
      );
      expect(seen).toContain(annotationKey(result.annotations[0]!.ref));
    } finally {
      await writer!.close();
      await older!.close();
    }
  });
});
