import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  EngineErrorCode,
  type AnnotationBundleLimits,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import {
  runAnnotationExportConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { WorkerHost } from '../../services/src/worker-host/WorkerHost';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = {
  authoring: resolve(here, 'fixtures', 'hello_world.pdf'),
  'acrobat-stamps': resolve(here, 'fixtures', 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(here, 'fixtures', 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runAnnotationExportConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures[fixture])),
      },
      { scope: ['*'] },
    ),
  rawAppearances: true,
});

/** A 30 × 10 PNG of three bands. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAIAAAAsFXl4AAAAGklEQVR42mP4z8CABzFQIj1q9KjRo0aTIg0AQXcq5OunV0AAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
);

/** hello_world.pdf with two stamps of one image and a square. */
async function documentWithStamps(): Promise<Uint8Array> {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  try {
    const doc = await engine.open(
      {
        kind: 'bytes',
        id: `stamps-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures.authoring)),
      },
      { scope: ['*'] },
    );
    const { pages } = await doc.pages.list();
    const page = doc.page(pages[0]!.ref);
    for (const left of [20, 100]) {
      await page.annotations.create(
        { subtype: 'stamp', rect: { left, bottom: 20, right: left + 60, top: 40 } },
        { appearance: PNG },
      );
    }
    await page.annotations.create({
      subtype: 'square',
      rect: { left: 200, bottom: 20, right: 260, top: 40 },
    });
    const saved = await doc.download({ mode: 'rewrite' });
    await doc.close();
    return saved;
  } finally {
    await engine.destroy();
  }
}

describe('annotation export on the local engine', () => {
  test('needs doc.download, as reading a resource does', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open(
        { kind: 'bytes', id: `scoped-${++opened}`, bytes: await documentWithStamps() },
        { scope: ['doc.annotate.read'] },
      );
      await expect(doc.annotations.export()).rejects.toMatchObject({ name: 'PermissionDenied' });
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('refuses a bundle past a limit while building it, naming the limit', async () => {
    const runtime = await createPdfRuntime({ prefer: 'wasm' });
    const results = new Map<number, (response: WorkerResponse) => void>();
    const host = new WorkerHost(runtime, (pack: WirePack<WorkerResponse>) => {
      results.get(pack.payload.jobId)?.(pack.payload);
    });
    let jobId = 0;
    const send = (request: Record<string, unknown>) =>
      new Promise<WorkerResponse>((resolveResponse) => {
        results.set(++jobId, resolveResponse);
        host.receive({ ...request, jobId } as unknown as WorkerRequest);
      });
    const bytes = await documentWithStamps();
    const opened = await send({
      kind: 'open.fatMem',
      docId: 'limits',
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      password: null,
    });
    expect(opened.kind).toBe('resolve');

    const exported = (limits: Partial<AnnotationBundleLimits>) =>
      send({
        kind: 'annotations.export',
        docId: 'limits',
        selection: {},
        limits: { ...DEFAULT_ANNOTATION_BUNDLE_LIMITS, ...limits },
      });
    const whole = await exported({});
    expect(whole.kind).toBe('resolve');
    if (whole.kind !== 'resolve' || whole.result.tag !== 'annotations.export') return;
    // Two stamps of one image: one resource.
    expect(Object.keys(whole.result.bundle.resources)).toHaveLength(1);
    const imageBytes = Object.values(whole.result.bundle.resources)[0]!.byteLength;

    for (const [limit, value] of [
      ['items', 2],
      ['resourceBytes', imageBytes - 1],
      ['bundleBytes', imageBytes],
      ['manifestBytes', 100],
      ['pages', 0],
    ] as const) {
      const refused = await exported({ [limit]: value });
      expect(refused.kind).toBe('reject');
      if (refused.kind !== 'reject') continue;
      expect(refused.error).toMatchObject({
        code: EngineErrorCode.PayloadTooLarge,
        details: { limit, max: value },
      });
    }
  });
});
