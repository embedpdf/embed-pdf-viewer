import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runSearchConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { toPageRef, type Engine } from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

// sample.pdf is the USCIS Form I-140 (8 pages); "Form I-140" sits in every
// page header and page 0 has indirect object number 3056 — the same fixture
// facts the engine-local suite pins. Here the identical suite drives the
// cloud engine: POST slices through the layer search route, the server-side
// SearchReader on the native worker pool, and the docVersion-pinned cursor
// envelope across the wire.
const TENANT_ID = 'cloud-search-tenant';
const DOC_ID = 'docsearch001';
const PAGE_OBJECT_NUMBER = 3056;
const PAGE_COUNT = 8;

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-search-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, samplePath, PAGE_COUNT);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runSearchConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: {
    id: DOC_ID,
    bytes: async () => new Uint8Array(),
    expected: { trapped: 'unknown' },
    presentLiteral: 'Form I-140',
    presentPageObjectNumber: PAGE_OBJECT_NUMBER,
    absentLiteral: 'zyxqvark never appears anywhere',
    presentRegex: 'I-\\d{3}',
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});

// A layer per visitor costs nothing to search until it changes: a layer whose
// text and page order are still the base's searches the base session. Once
// it deletes a page, it searches itself.
describe('search on a layer', () => {
  // A reader may only read, so opening the document starts no editing session
  // (which would open the layer); an editor may change it.
  const READ = ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.search'];
  const engineFor = (layerName: string, scope: string[]) =>
    cloudEngine({
      baseUrl: fx!.baseUrl,
      token: docScopedToken(fx!, TENANT_ID, DOC_ID, scope, layerName),
    });

  async function pagesWith(doc: Awaited<ReturnType<Engine['open']>>): Promise<number[]> {
    const pages = new Set<number>();
    let cursor: string | undefined;
    do {
      const slice = await doc.search.query({ text: 'Form I-140', cursor });
      for (const match of slice.matches) pages.add(match.page.objectNumber);
      cursor = slice.nextCursor ?? undefined;
    } while (cursor);
    return [...pages];
  }

  test('an unchanged layer opens no layer session; a changed one sees its change', async () => {
    const service = fx!.bundle.documentService!;
    const reader = engineFor('search-reader', READ);
    const editor = engineFor('search-editor', ['*']);
    try {
      const readerDoc = await reader.open({ kind: 'id', id: DOC_ID });
      const sessions = service.stats().openLayerSessions;
      expect(await pagesWith(readerDoc)).toHaveLength(PAGE_COUNT);
      expect(service.stats().openLayerSessions).toBe(sessions);

      const editorDoc = await editor.open({ kind: 'id', id: DOC_ID });
      await editorDoc.pages.delete([toPageRef(PAGE_OBJECT_NUMBER)]);
      const edited = await pagesWith(editorDoc);
      expect(edited).toHaveLength(PAGE_COUNT - 1);
      expect(edited).not.toContain(PAGE_OBJECT_NUMBER);

      expect(await pagesWith(readerDoc)).toHaveLength(PAGE_COUNT);
    } finally {
      await reader.destroy();
      await editor.destroy();
    }
  });
});
