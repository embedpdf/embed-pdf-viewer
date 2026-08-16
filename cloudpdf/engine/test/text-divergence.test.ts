import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runTextDivergenceConformance,
  TEXT_DIVERGENCE_CASES,
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
// Same vendored fixtures as the engine-local suite; canonical copy and
// provenance live in packages/engine/main/test/fixtures/README.md, so CI
// never needs the multi-GB runtime-src submodule.
const resources = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-text-divergence-tenant';

let fx: DbSeededFixture | undefined;

const entries = Object.entries(TEXT_DIVERGENCE_CASES);

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-text-divergence-secret' });
  for (const [key, c] of entries) {
    await seedDocumentFromBytes(fx, TENANT_ID, docId(key), resolve(resources, c.resource), 1);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function docId(key: string): string {
  return `docdiv${key.toLowerCase()}`;
}

for (const [key, c] of entries) {
  runTextDivergenceConformance(runner, {
    label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime, versioned URLs)',
    openKind: 'id',
    makeEngine: () => {
      if (!fx) throw new Error('fixture not initialised');
      return createCloudEngine({
        baseUrl: fx.baseUrl,
        token: docScopedToken(fx, TENANT_ID, docId(key)),
      });
    },
    fixture: {
      ...c,
      id: docId(key),
      bytes: async () => new Uint8Array(),
      expected: {},
    },
  });
}
