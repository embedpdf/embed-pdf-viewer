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
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';
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

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('remote fonts.changed', () => {
  test('a remote write that embeds a font ends its events with fonts.changed, for a reader too', async () => {
    const app = fixtureApp();
    const docId = `fonts-${++docs}`;
    await seedDocument(app, TENANT_ID, docId, await fixture('hello_world.pdf'));
    const engines = [0, 1, 2].map(() => cloudEngine({ baseUrl: app.baseUrl }));
    const [writer, editor, reader] = await Promise.all([
      engines[0].open({ kind: 'token', token: docScopedToken(app, TENANT_ID, docId) }),
      engines[1].open({ kind: 'token', token: docScopedToken(app, TENANT_ID, docId) }),
      // May read no annotation: the write reaches it withheld, as only its pins.
      engines[2].open({
        kind: 'token',
        token: signDevToken(app.secret, {
          sub: 'cloud-test-reader',
          tenant_id: TENANT_ID,
          doc_id: docId,
          scope: ['doc.open', 'doc.render'],
        }),
      }),
    ]);
    try {
      const hasRoboto = async (doc: typeof editor) =>
        (await doc.fonts.list()).fonts.some(
          (font) => font.source === 'document' && font.familyName === 'Roboto',
        );
      expect(await hasRoboto(editor)).toBe(false);
      expect(await hasRoboto(reader)).toBe(false);
      const heardByEditor: DocumentEvent[] = [];
      const heardByReader: DocumentEvent[] = [];
      editor.events.subscribe((event) => heardByEditor.push(event));
      reader.events.subscribe((event) => heardByReader.push(event));
      // Give the lazy streams a beat to connect before the write.
      await new Promise((r) => setTimeout(r, 300));

      const page = (await writer.pages.list()).pages[0]!.ref;
      await writer.page(page).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 60, width: 200, height: 40 },
        contents: 'Hello',
        fontFamily: 'roboto',
      });

      await waitFor(() => heardByEditor.some((e) => e.type === 'fonts.changed'), 'the editor');
      expect(heardByEditor.map((event) => event.type)).toEqual([
        'annotations.created',
        'fonts.changed',
      ]);
      const [created, changed] = heardByEditor;
      expect(changed.origin.kind).toBe('remote');
      expect('transaction' in changed.origin && changed.origin.transaction?.id).toBe(
        'transaction' in created.origin && created.origin.transaction?.id,
      );
      await waitFor(() => heardByReader.length > 0, 'the reader');
      expect(heardByReader.map((event) => event.type)).toEqual(['fonts.changed']);

      expect(await hasRoboto(editor)).toBe(true);
      expect(await hasRoboto(reader)).toBe(true);
    } finally {
      await Promise.all([writer.close(), editor.close(), reader.close()]);
      await Promise.all(engines.map((engine) => engine.destroy()));
    }
  });
});
