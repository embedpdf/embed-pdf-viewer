import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAttachmentConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { iconRect } from '@embedpdf/engine-core/conformance';
import { encodeTokenText } from '@embedpdf/engine-core/wire';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
// PDFium's attachment corpus fixture: two embedded files —
// "1.txt" ("test", text/plain) and "attached.pdf" (5869 bytes).
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'embedded_attachments.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-attachments-tenant';
const DOC_ID = 'embedded-attachments-pdf-cloud';
const READS_DOC_ID = 'embedded-attachments-pdf-reads';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
  await seedDocumentFromBytes(fx, TENANT_ID, READS_DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runAttachmentConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: {
    id: DOC_ID,
    bytes: async () => new Uint8Array(),
    expected: {},
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});

describe("the contract's reads: current, never cached", () => {
  const layer = () => `${fx!.baseUrl}/v1/docs/${READS_DOC_ID}/layers/default`;
  const get = (url: string) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${docScopedToken(fx!, TENANT_ID, READS_DOC_ID)}` },
    });

  test('the listing, and a file by its key', async () => {
    const listed = await get(`${layer()}/attachments`);
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toContain('no-store');
    const { attachments } = (await listed.json()) as { attachments: { name: string }[] };
    expect(attachments.map((attachment) => attachment.name)).toEqual(['1.txt', 'attached.pdf']);

    const file = await get(`${layer()}/attachment-files/${encodeTokenText('1.txt')}/data`);
    expect(file.status).toBe(200);
    expect(file.headers.get('cache-control')).toContain('no-store');
    expect(file.headers.get('content-type')).toContain('text/plain');
    expect(await file.text()).toBe('test');

    const missing = await get(`${layer()}/attachment-files/${encodeTokenText('none.txt')}/data`);
    expect(missing.status).toBe(404);
  });

  test("a file-attachment annotation's file, as its file resource", async () => {
    const engine = cloudEngine({
      baseUrl: fx!.baseUrl,
      token: docScopedToken(fx!, TENANT_ID, READS_DOC_ID),
    });
    const doc = await engine.open({ kind: 'id', id: READS_DOC_ID });
    try {
      const page = (await doc.pages.list()).pages[0]!.ref;
      const bytes = new TextEncoder().encode('figures');
      const { annotation } = await doc
        .page(page)
        .annotations.create(
          { subtype: 'file-attachment', rect: iconRect(40, 60), file: { name: 'figures.csv' } },
          { resources: { file: bytes } },
        );
      if (annotation.ref.kind !== 'objectNumber') throw new Error('expected an object number');
      const file = await get(
        `${layer()}/annotations/pages/obj:${page.objectNumber}` +
          `/items/obj:${annotation.ref.objectNumber}/resources/file`,
      );
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toContain('application/octet-stream');
      expect(await file.text()).toBe('figures');
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
