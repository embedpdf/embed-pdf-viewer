import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  PRINT_RULES_PDF,
  runPrintCopyConformance,
  runPrintRenderConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * Print pictures and print copies on the cloud engine, against
 * `@cloudpdf/server` on the native runtime: each picture family at each
 * print tier is a path of its own, with a document token per set of rights.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-print-render-conformance-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;
let users = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-print-render-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

/** A fresh server document of `bytes`, opened with `scope`. */
async function openSeeded(
  engine: ReturnType<typeof cloudEngine>,
  bytes: Uint8Array,
  scope: readonly string[],
) {
  const docId = `print-rules-${++docs}`;
  await seedDocument(fixture(), TENANT_ID, docId, bytes);
  const token = signDevToken(fixture().secret, {
    sub: `print-user-${++users}`,
    tenant_id: TENANT_ID,
    doc_id: docId,
    scope: [...scope],
  });
  return engine.open({ kind: 'token', token });
}

const label = 'cloud engine (HTTP -> @cloudpdf/server, native runtime)';
const makeEngine = () => cloudEngine({ baseUrl: fixture().baseUrl });

runPrintRenderConformance(runner, {
  label,
  makeEngine,
  open: (engine, scope) => openSeeded(engine, PRINT_RULES_PDF, scope),
});

runPrintCopyConformance(runner, {
  label,
  makeEngine,
  open: (engine, scope) => openSeeded(engine, PRINT_RULES_PDF, scope),
  openCopy: (engine, bytes) => openSeeded(engine, bytes, ['*']),
});
