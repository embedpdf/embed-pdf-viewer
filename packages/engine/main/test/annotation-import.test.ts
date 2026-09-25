import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  toPageRef,
  type AnnotationBundle,
  type WireAnnotationBundle,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import {
  creatables,
  runAnnotationImportConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
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

runAnnotationImportConformance(runner, {
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

/** hello_world.pdf's annotations of every kind a create makes, with a thread and a link, as a bundle. */
async function everyKind(): Promise<AnnotationBundle> {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  try {
    const doc = await engine.open(
      {
        kind: 'bytes',
        id: `every-kind-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures.authoring)),
      },
      { scope: ['*'] },
    );
    const { pages } = await doc.pages.list();
    const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
    const page = doc.page(pageRef);
    for (const { data, resources } of creatables()) await page.annotations.create(data, resources);
    const rect = { left: 300, bottom: 300, right: 320, top: 320 };
    const { created: note } = await page.annotations.create({ subtype: 'text', rect });
    await page.annotations.create({ subtype: 'popup', rect, parent: note.ref });
    await page.annotations.create({ subtype: 'text', rect, reply: { to: note.ref } });
    await page.annotations.create({
      subtype: 'link',
      rect,
      target: { kind: 'goto', destination: { kind: 'fit', page: pageRef } },
    });
    const bundle = await doc.annotations.export();
    await doc.close();
    return bundle;
  } finally {
    await engine.destroy();
  }
}

/**
 * The runtime with one native call made to fail: `arm(name, at)` throws on
 * the `at`-th call of `name` (for which `when` holds), as a native failure
 * midway through a job would.
 */
function withFault(runtime: PdfRuntimeModule) {
  let armed: { name: string; at: number; when?: (args: unknown[]) => boolean } | null = null;
  let calls = 0;
  let fired = false;
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      if (typeof original !== 'function' || armed?.name !== name) return original;
      return (...args: unknown[]) => {
        if (armed && (!armed.when || armed.when(args)) && ++calls === armed.at) {
          armed = null;
          fired = true;
          throw new Error(`forced failure in ${String(name)}`);
        }
        return (original as (...values: unknown[]) => unknown)(...args);
      };
    },
  });
  return {
    runtime: Object.create(runtime, { fn: { value: fn } }) as PdfRuntimeModule,
    arm(name: string, at: number, when?: (args: unknown[]) => boolean) {
      armed = { name, at, ...(when ? { when } : {}) };
      calls = 0;
      fired = false;
    },
    fired: () => fired,
  };
}

/** A save with the trailer's `/ID` blanked: every save writes a fresh second id. */
function withoutId(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1')
    .decode(bytes)
    .replace(/\/ID\s*\[\s*<[0-9A-Fa-f]*>\s*<[0-9A-Fa-f]*>\s*\]/g, '/ID[]');
}

describe.each(['wasm', 'native'] as const)(
  'a failed import leaves the document as it was (%s runtime)',
  (prefer) => {
    test('at any pass, with every kind a create makes', async () => {
      const bundle = await everyKind();
      const wire: WireAnnotationBundle = {
        ...bundle,
        resources: Object.fromEntries(
          Object.entries(bundle.resources).map(([id, bytes]) => [
            id,
            new Uint8Array(bytes).buffer as ArrayBuffer,
          ]),
        ),
      };
      const count = bundle.items.length;
      expect(count).toBeGreaterThan(20);

      const fault = withFault(await createPdfRuntime({ prefer }));
      const results = new Map<number, (response: WorkerResponse) => void>();
      const host = new WorkerHost(fault.runtime, (pack: WirePack<WorkerResponse>) => {
        results.get(pack.payload.jobId)?.(pack.payload);
      });
      let jobId = 0;
      const send = (request: Record<string, unknown>) =>
        new Promise<WorkerResponse>((resolveResponse) => {
          results.set(++jobId, resolveResponse);
          host.receive({ ...request, jobId } as unknown as WorkerRequest);
        });
      const bytes = new Uint8Array(await readFile(fixtures.authoring));
      expect(
        (
          await send({
            kind: 'open.fatMem',
            docId: 'r9',
            bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            password: null,
          })
        ).kind,
      ).toBe('resolve');

      const save = async (mode: 'rewrite' | 'incremental') => {
        const response = await send({ kind: 'document.saveBuffer', docId: 'r9', mode });
        if (response.kind !== 'resolve' || response.result.tag !== 'document.saveBuffer') {
          throw new Error(`save failed: ${JSON.stringify(response)}`);
        }
        return withoutId(response.result.bytes);
      };
      // The page is loaded and drawn first, as in a viewer: a rollback must
      // show on the loaded page too.
      const page = bundle.pages[0]!.page;
      const draw = async () => {
        const response = await send({ kind: 'pages.render', docId: 'r9', page });
        if (response.kind !== 'resolve' || response.result.tag !== 'pages.render') {
          throw new Error(`render failed: ${JSON.stringify(response)}`);
        }
        return Buffer.from(response.result.raster.data);
      };
      // Each attribution mode writes its own last pass: both run, each
      // against the document as the one before left it.
      for (const attribution of ['stamp', 'restore'] as const) {
        const importing = () =>
          send({ kind: 'annotations.import', docId: 'r9', bundle: wire, attribution });
        const drawn = await draw();
        const baseline = { rewrite: await save('rewrite'), incremental: await save('incremental') };
        expect(await save('rewrite')).toBe(baseline.rewrite);

        const faults: Array<[string, number, ((args: unknown[]) => boolean)?]> = [
          ['EPDFPage_CreateAnnotRaw', 1],
          ['EPDFPage_CreateAnnotRaw', Math.ceil(count / 2)],
          ['EPDFPage_CreateAnnotRaw', count],
          ['EPDFAnnot_SetLinkedAnnot', 1],
          ['FPDFAnnot_SetStringValue', count, (args) => args[1] === 'CreationDate'],
          ['FPDFAnnot_GetSubtype', count],
          ...(attribution === 'restore' ? ([['FPDFAttachment_SetStringValue', 1]] as const) : []),
        ];
        for (const [name, at, when] of faults) {
          const what = `${attribution}: ${name} #${at}`;
          fault.arm(name, at, when);
          const response = await importing();
          expect(fault.fired(), `${what} was called`).toBe(true);
          expect(response.kind, what).toBe('reject');
          expect(await save('rewrite'), `${what}: rewrite`).toBe(baseline.rewrite);
          expect(await save('incremental'), `${what}: incremental`).toBe(baseline.incremental);
          expect((await draw()).equals(drawn), `${what}: drawn`).toBe(true);
        }

        // Nothing of the failed attempts is left behind: the import applies.
        const applied = await importing();
        expect(applied.kind).toBe('resolve');
        if (applied.kind !== 'resolve' || applied.result.tag !== 'annotations.import') return;
        expect(applied.result.result.created).toHaveLength(count);
        expect(applied.result.result.dropped).toEqual([]);
        expect((await draw()).equals(drawn)).toBe(false);
      }
    });
  },
);

describe('an import into an open document', () => {
  test('shows on a page already loaded and drawn, as a fresh open of the saved file shows it', async () => {
    const bundle = await everyKind();
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open(
        {
          kind: 'bytes',
          id: `open-${++opened}`,
          bytes: new Uint8Array(await readFile(fixtures.authoring)),
        },
        { scope: ['*'] },
      );
      const { pages } = await doc.pages.list();
      const page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
      // Loaded the way a viewer loads it: drawn, and its annotations listed.
      const before = await page.render.raw();
      expect((await page.annotations.list()).annotations).toEqual([]);

      const { created } = await doc.annotations.import(bundle, { attribution: 'stamp' });

      // The loaded page lists them and draws them...
      expect((await page.annotations.list()).annotations).toEqual(created);
      const after = await page.render.raw();
      expect(Buffer.from(after.data).equals(Buffer.from(before.data))).toBe(false);

      // ...exactly as the saved file, opened afresh, draws them.
      const saved = await doc.download({ mode: 'rewrite' });
      const fresh = await engine.open(
        { kind: 'bytes', id: `reopened-${++opened}`, bytes: saved },
        { scope: ['*'] },
      );
      const reopened = (await fresh.pages.list()).pages[0]!;
      const drawn = await fresh.page(toPageRef(reopened.ref.pageObjectNumber)).render.raw();
      expect(Buffer.from(drawn.data).equals(Buffer.from(after.data))).toBe(true);
      await fresh.close();
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});
