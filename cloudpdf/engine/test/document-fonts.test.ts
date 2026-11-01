import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  runDocumentFontsConformance,
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

/**
 * `doc.fonts` on the cloud engine, against `@cloudpdf/server` on the native
 * runtime, with Roboto as a font of the server's own that it serves: the same
 * conformance suite as the local engine.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../packages/engine/main/test/fixtures');
const fixture = async (name: string) => new Uint8Array(await readFile(resolve(fixtures, name)));
const robotoPath = resolve(fixtures, 'Roboto-Regular.ttf');
const roboto = await readFile(robotoPath);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-fonts-conformance-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({
    secret: 'cloud-fonts-conformance-secret',
    fonts: [{ key: 'roboto', path: robotoPath, serve: true }],
  });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixtureApp(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runDocumentFontsConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixtureApp().baseUrl }),
  open: async (engine, bytes) => {
    const docId = `fonts-${++docs}`;
    await seedDocument(fixtureApp(), TENANT_ID, docId, bytes);
    return engine.open({ kind: 'token', token: docScopedToken(fixtureApp(), TENANT_ID, docId) });
  },
  openReadOnly: async (engine, bytes) => {
    const docId = `fonts-${++docs}`;
    await seedDocument(fixtureApp(), TENANT_ID, docId, bytes);
    return engine.open({
      kind: 'token',
      token: signDevToken(fixtureApp().secret, {
        sub: 'cloud-test-reader',
        tenant_id: TENANT_ID,
        doc_id: docId,
        scope: ['doc.open', 'doc.render'],
      }),
    });
  },
  servedFont: { key: 'roboto', sha256: createHash('sha256').update(roboto).digest('hex') },
  fixtures: {
    page: await fixture('hello_world.pdf'),
    keptFonts: await fixture('kept_fonts_form.pdf'),
    documentSubset: await fixture('freetext_document_subset_helvetica.pdf'),
    sharedProgram: await fixture('kept_font_shared_program.pdf'),
    fontProgram: new Uint8Array(
      await readFile(
        resolve(here, '../../../packages/default-fallback-fonts/fonts/NotoSansHebrew-Regular.ttf'),
      ),
    ),
  },
});
