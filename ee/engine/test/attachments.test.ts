import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAttachmentConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
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

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
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
    return createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});
