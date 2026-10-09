import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runWidgetRotationConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/** Widget turns on the cloud engine, against `@cloudpdf/server` on the native runtime. */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-widget-rotation-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-widget-rotation-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runWidgetRotationConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  open: async (engine, bytes) => {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `widget-rotation-${++docs}`;
    await seedDocument(fx, TENANT_ID, docId, bytes);
    const token = docScopedToken(fx, TENANT_ID, docId, ['*']);
    return engine.open({ kind: 'token', token });
  },
});
