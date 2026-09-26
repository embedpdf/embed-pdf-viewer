/**
 * E8 on the cloud (the annotation transfer benchmarks): an import and an export as
 * one request each against a server on localhost, what the import writes to
 * storage, and the two largest default limits over HTTP. Env-gated
 * (`EPDF_TRANSFER_BENCH=1`); prints tables and asserts only that each run
 * succeeds. The bundles are built with the local engine.
 */
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  manifestBytesOf,
  type AnnotationBundle,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../../../packages/engine/main/src/index';
import {
  fill,
  kb,
  pageRefs,
  pages,
  png,
  timed,
} from '../../../packages/engine/main/test/helpers/transferBench';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const ENABLED = !!process.env.EPDF_TRANSFER_BENCH;
const TENANT_ID = 'cloud-annotation-transfer-bench-tenant';

let fx: DbSeededFixture | undefined;
let scratch = '';
let seeded = 0;

beforeAll(async () => {
  if (!ENABLED) return;
  fx = await buildDbSeededFixture({ secret: 'cloud-annotation-transfer-bench-secret' });
  scratch = await mkdtemp(join(tmpdir(), 'e8-'));
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

/** Bytes under a directory. */
async function sizeOf(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await sizeOf(path) : (await stat(path)).size;
  }
  return total;
}

/** A bundle the local engine exports from `base` after `populate`. */
async function bundleOf(
  base: Uint8Array,
  populate: (
    doc: Awaited<ReturnType<Awaited<ReturnType<typeof createLocalEngine>>['open']>>,
  ) => Promise<void>,
): Promise<AnnotationBundle> {
  const engine = await createLocalEngine({ runtime: { prefer: 'native' } });
  try {
    const doc = await engine.open({ kind: 'bytes', id: 'source', bytes: base }, { scope: ['*'] });
    await populate(doc);
    return await doc.annotations.export();
  } finally {
    await engine.destroy();
  }
}

/** Import `bundle` into a fresh copy of `base` on the server, and export it back. */
async function onTheServer(
  label: string,
  base: Uint8Array,
  pageCount: number,
  bundle: AnnotationBundle,
): Promise<void> {
  if (!fx) throw new Error('fixture not initialised');
  const rows: string[] = [];
  const path = join(scratch, `base-${pageCount}.pdf`);
  await writeFile(path, base);
  const id = `e8-${++seeded}`;
  await seedDocumentFromBytes(fx, TENANT_ID, id, path, pageCount);
  const engine = cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  try {
    const doc = await engine.open({ kind: 'id', id });
    const before = await sizeOf(fx.storageRoot);
    const result = await timed(rows, 'import (stamp), one request', () =>
      doc.annotations.import(bundle, { attribution: 'stamp' }),
    );
    const written = (await sizeOf(fx.storageRoot)) - before;
    expect(result.dropped.filter((drop) => !drop.field)).toEqual([]);
    await timed(rows, 'export, one request', () => doc.annotations.export());
    await timed(rows, 'export again (cached leaf)', () => doc.annotations.export());
    const saved = await doc.download({ mode: 'rewrite' });
    const resources = Object.values(bundle.resources).reduce((sum, bytes) => sum + bytes.length, 0);
    rows.push(
      `items ${bundle.items.length}, resources ${Object.keys(bundle.resources).length}, manifest ${kb(manifestBytesOf(bundle))}, resource bytes ${kb(resources)}`,
      `written to storage ${kb(written)}, the PDF ${kb(saved.length)} (the base ${kb(base.length)})`,
    );
    console.log(`\n── E8 cloud: ${label}\n${rows.join('\n')}`);
    await doc.close();
  } finally {
    await engine.destroy();
  }
}

describe.skipIf(!ENABLED)('E8 annotation transfer (cloud, localhost)', () => {
  test('1 000 mixed annotations over 20 pages', async () => {
    const base = pages(20);
    await onTheServer(
      '1 000 mixed annotations',
      base,
      20,
      await bundleOf(base, (doc) => fill(doc, 1000)),
    );
  }, 600_000);

  test('100 stamps of one 17 KB image (the plan §5 case)', async () => {
    const base = pages(1);
    // Pseudo-random pixels, so the PNG stays about 17 KB as in E4.
    let seed = 1;
    const noise = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
    const image = png(96, 64, () => [noise(), noise(), noise()]);
    const bundle = await bundleOf(base, async (doc) => {
      const [page] = await pageRefs(doc);
      for (let i = 0; i < 100; i++) {
        const left = 20 + (i % 10) * 55;
        const bottom = 40 + Math.floor(i / 10) * 70;
        await doc
          .page(page!)
          .annotations.create(
            { subtype: 'stamp', rect: { left, bottom, right: left + 50, top: bottom + 40 } },
            { appearance: image },
          );
      }
    });
    await onTheServer('100 stamps of one image', base, 1, bundle);
  }, 600_000);

  test(`items: ${DEFAULT_ANNOTATION_BUNDLE_LIMITS.items} mixed annotations over 200 pages`, async () => {
    const base = pages(200);
    const bundle = await bundleOf(base, (doc) => fill(doc, DEFAULT_ANNOTATION_BUNDLE_LIMITS.items));
    await onTheServer(`${DEFAULT_ANNOTATION_BUNDLE_LIMITS.items} items`, base, 200, bundle);
  }, 1_800_000);

  test('bundle bytes: one file just under the bundle limit', async () => {
    const base = pages(1);
    const bytes = new Uint8Array(DEFAULT_ANNOTATION_BUNDLE_LIMITS.bundleBytes - 64 * 1024).map(
      (_, i) => (i * 31) & 255,
    );
    const bundle = await bundleOf(base, async (doc) => {
      const [page] = await pageRefs(doc);
      await doc.page(page!).annotations.create(
        {
          subtype: 'file-attachment',
          rect: { left: 40, bottom: 40, right: 60, top: 60 },
          file: { name: 'large.bin' },
        },
        { file: bytes },
      );
    });
    await onTheServer('bundle bytes', base, 1, bundle);
  }, 1_800_000);
});
