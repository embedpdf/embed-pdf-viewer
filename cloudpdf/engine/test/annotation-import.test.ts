import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  resourceIdOf,
  toPageRef,
  type AnnotationBundle,
  type AnnotationBundleLimits,
  type DocumentEvent,
  type ResourceId,
} from '@embedpdf/engine-core/runtime';
import {
  runAnnotationImportConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
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
const TENANT_ID = 'cloud-annotation-import-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-annotation-import-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runAnnotationImportConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  // Each test opens its own copies: the tests write to their documents.
  open: async (engine, fixture) => {
    if (!fx) throw new Error('fixture not initialised');
    const id = `${fixture}-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, id, fixtures[fixture], 1);
    return engine.open({ kind: 'id', id });
  },
  rawAppearances: false,
});

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('annotation import on the cloud engine', () => {
  const rect = (left: number) => ({ left, bottom: 20, right: left + 40, top: 50 });

  test('a retry under the same opId applies once and returns the same result', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engine = createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
    const sourceId = `replay-source-${++opened}`;
    const targetId = `replay-target-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, sourceId, fixtures.authoring, 1);
    await seedDocumentFromBytes(fx, TENANT_ID, targetId, fixtures.authoring, 1);
    const source = await engine.open({ kind: 'id', id: sourceId });
    const target = await engine.open({ kind: 'id', id: targetId });
    try {
      const { pages } = await source.pages.list();
      const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
      await source.page(pageRef).annotations.create({ subtype: 'square', rect: rect(20) });
      await source.page(pageRef).annotations.create({ subtype: 'circle', rect: rect(80) });
      const bundle = await source.annotations.export();

      const options = { attribution: 'stamp', opId: 'replay-1' } as const;
      const first = await target.annotations.import(bundle, options);
      const again = await target.annotations.import(bundle, options);
      expect(again).toEqual(first);
      expect((await target.annotations.listRaw(pageRef)).annotations).toHaveLength(2);

      // Another key is another import.
      await target.annotations.import(bundle, { ...options, opId: 'replay-2' });
      expect((await target.annotations.listRaw(pageRef)).annotations).toHaveLength(4);
    } finally {
      await source.close();
      await target.close();
      await engine.destroy();
    }
  });

  test('another session receives one annotation.created per annotation, as one transaction', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `remote-${++opened}`;
    const sourceId = `remote-source-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, docId, fixtures.authoring, 1);
    await seedDocumentFromBytes(fx, TENANT_ID, sourceId, fixtures.authoring, 1);
    const engineA = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, docId),
    });
    const engineB = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, docId),
    });
    const engineSource = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(fx, TENANT_ID),
    });
    const docA = await engineA.open({ kind: 'id', id: docId });
    const docB = await engineB.open({ kind: 'id', id: docId });
    const source = await engineSource.open({ kind: 'id', id: sourceId });
    try {
      const { pages } = await source.pages.list();
      const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
      for (const left of [20, 80, 140]) {
        await source.page(pageRef).annotations.create({ subtype: 'square', rect: rect(left) });
      }
      const bundle = await source.annotations.export();

      const eventsA: DocumentEvent[] = [];
      const eventsB: DocumentEvent[] = [];
      docA.events.subscribe((event) => eventsA.push(event));
      docB.events.subscribe((event) => eventsB.push(event));
      await new Promise((r) => setTimeout(r, 300));

      const result = await docA.annotations.import(bundle, {
        attribution: 'stamp',
        opId: 'remote-import',
      });
      await waitFor(() => eventsB.length >= 3, "B's remote events");
      expect(eventsB.map((event) => event.type)).toEqual([
        'annotation.created',
        'annotation.created',
        'annotation.created',
      ]);
      eventsB.forEach((event, index) => {
        if (event.type !== 'annotation.created') return;
        expect(event.origin.kind).toBe('remote');
        expect(event.origin.tx).toEqual({ id: 'remote-import', index, count: 3 });
        expect(event.created).toEqual(result.created[index]);
      });
      // A published its own, once, with the same transaction.
      expect(eventsA.map((event) => event.origin.tx)).toEqual(
        eventsB.map((event) => event.origin.tx),
      );
      await new Promise((r) => setTimeout(r, 400));
      expect(eventsA).toHaveLength(3);

      // B's manifest absorbed the pins: its next read sees the import.
      expect((await docB.annotations.listRaw(pageRef)).annotations).toHaveLength(3);
    } finally {
      await docA.close();
      await docB.close();
      await source.close();
      await engineA.destroy();
      await engineB.destroy();
      await engineSource.destroy();
    }
  });
});

describe('the server holds the bundle limits while the request streams in', () => {
  const limits: AnnotationBundleLimits = {
    ...DEFAULT_ANNOTATION_BUNDLE_LIMITS,
    manifestBytes: 6000,
    resourceBytes: 3000,
    resources: 2,
    bundleBytes: 6000,
  };
  let small: DbSeededFixture | undefined;

  beforeAll(async () => {
    small = await buildDbSeededFixture({
      secret: 'cloud-annotation-import-limits-secret',
      annotationBundleLimits: limits,
    });
  });

  afterAll(async () => {
    await teardownDbSeededFixture(small);
  });

  test('refuses each limit with PayloadTooLarge naming it, and writes nothing', async () => {
    if (!small) throw new Error('fixture not initialised');
    const engine = createCloudEngine({
      baseUrl: small.baseUrl,
      token: tenantToken(small, TENANT_ID),
    });
    const id = `limits-${++opened}`;
    await seedDocumentFromBytes(small, TENANT_ID, id, fixtures.authoring, 1);
    const doc = await engine.open({ kind: 'id', id });
    try {
      const { pages } = await doc.pages.list();
      const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
      await doc.page(pageRef).annotations.create({
        subtype: 'square',
        rect: { left: 20, bottom: 20, right: 60, top: 50 },
      });
      const square = (await doc.annotations.export()).items[0]!;
      const { annotations: before } = await doc.annotations.listRaw(pageRef);
      // The export's page entry, and a file attachment naming each resource.
      const base = await doc.annotations.export();
      const attachment = (resource: ResourceId) => ({
        data: {
          ...square.data,
          subtype: 'file-attachment',
          file: { name: 'a.bin', mimeType: null, description: null },
        } as unknown as AnnotationBundle['items'][number]['data'],
        resources: { file: resource },
      });
      const withFiles = async (...sizes: number[]): Promise<AnnotationBundle> => {
        const resources: Record<ResourceId, Uint8Array> = {};
        const items = [];
        for (const [index, size] of sizes.entries()) {
          const bytes = new Uint8Array(size).fill(index + 1);
          const resourceId = await resourceIdOf(bytes);
          resources[resourceId] = bytes;
          items.push(attachment(resourceId));
        }
        return { ...base, items, resources };
      };

      const refused = async (bundle: AnnotationBundle, limit: keyof AnnotationBundleLimits) =>
        expect(doc.annotations.import(bundle, { attribution: 'stamp' })).rejects.toMatchObject({
          code: 'PayloadTooLarge',
          details: { limit, max: limits[limit] },
        });
      await refused({ ...base, items: Array.from({ length: 40 }, () => square) }, 'manifestBytes');
      await refused(await withFiles(3001), 'resourceBytes');
      await refused(await withFiles(100, 100, 100), 'resources');
      await refused(await withFiles(2900, 2900), 'bundleBytes');

      expect((await doc.annotations.listRaw(pageRef)).annotations).toEqual(before);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
