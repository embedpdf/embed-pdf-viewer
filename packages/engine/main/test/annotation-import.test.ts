import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  toPageRef,
  type AnnotationBundle,
  type AnnotationRef,
  type PageRef,
  type WireAnnotationBundle,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResultPayload,
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
  /** Annotations without a number or a name. */
  weak: resolve(here, '../../../../examples/engine-runtime-demo/public/annotations.pdf'),
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
    const { annotation: note } = await page.annotations.create({ subtype: 'text', rect });
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
  const counted = new Map<string, number>();
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      if (typeof original === 'function' && typeof name === 'string' && counted.has(name)) {
        return (...args: unknown[]) => {
          counted.set(name, counted.get(name)! + 1);
          return (original as (...values: unknown[]) => unknown)(...args);
        };
      }
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
    /** Count the calls of `names` from now on. */
    count(names: readonly string[]) {
      for (const name of names) counted.set(name, 0);
    },
    counts: () => Object.fromEntries(counted),
  };
}

/** A worker host on `runtime`, with `bytes` open as `docId`. */
async function openWorker(runtime: PdfRuntimeModule, bytes: Uint8Array, docId: string) {
  const results = new Map<number, (response: WorkerResponse) => void>();
  const host = new WorkerHost(runtime, (pack: WirePack<WorkerResponse>) => {
    results.get(pack.payload.jobId)?.(pack.payload);
  });
  let jobId = 0;
  const send = (request: Record<string, unknown>) =>
    new Promise<WorkerResponse>((resolveResponse) => {
      results.set(++jobId, resolveResponse);
      host.receive({ ...request, docId, jobId } as unknown as WorkerRequest);
    });
  const opened = await send({
    kind: 'open.fatMem',
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    password: null,
  });
  expect(opened.kind).toBe('resolve');
  const result = async <Tag extends string>(request: Record<string, unknown>, tag: Tag) => {
    const response = await send(request);
    if (response.kind !== 'resolve' || response.result.tag !== tag) {
      throw new Error(`${tag} failed: ${JSON.stringify(response)}`);
    }
    return response.result as Extract<WorkerResultPayload, { tag: Tag }>;
  };
  return {
    send,
    result,
    /** A save, with the trailer's /ID blanked. */
    save: async (mode: 'rewrite' | 'incremental') =>
      withoutId((await result({ kind: 'document.saveBuffer', mode }, 'document.saveBuffer')).bytes),
    draw: async (page: PageRef) =>
      Buffer.from((await result({ kind: 'pages.render', page }, 'pages.render')).raster.data),
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
      const worker = await openWorker(
        fault.runtime,
        new Uint8Array(await readFile(fixtures.authoring)),
        'r9',
      );
      const { send, save } = worker;
      // The page is loaded and drawn first, as in a viewer: a rollback must
      // show on the loaded page too.
      const page = bundle.pages[0]!.page;
      const draw = () => worker.draw(page);
      // Each attribution mode writes its own last pass: both run, each
      // against the document as the one before left it.
      for (const attribution of ['stamp', 'restore'] as const) {
        const importing = () => send({ kind: 'annotations.import', bundle: wire, attribution });
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
          ...(attribution === 'restore'
            ? [['FPDFAttachment_SetStringValue', 1] as [string, number]]
            : []),
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
        expect(applied.result.result.annotations).toHaveLength(count);
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

      const { annotations: created } = await doc.annotations.import(bundle, {
        attribution: 'stamp',
      });

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

describe.each(['wasm', 'native'] as const)('one create (%s runtime)', (prefer) => {
  /** A worker on hello_world.pdf with a note on its first page. */
  async function withNote() {
    const fault = withFault(await createPdfRuntime({ prefer }));
    const worker = await openWorker(
      fault.runtime,
      new Uint8Array(await readFile(fixtures.authoring)),
      'one-create',
    );
    const { snapshot } = await worker.result({ kind: 'pages.list' }, 'pages.list');
    const page = toPageRef(snapshot.pages[0]!.ref.pageObjectNumber);
    const rect = { left: 300, bottom: 300, right: 320, top: 320 };
    const create = (draft: Record<string, unknown>) =>
      worker.send({ kind: 'annotations.create', page, draft });
    const created = await create({ subtype: 'text', rect });
    if (created.kind !== 'resolve' || created.result.tag !== 'annotations.create') {
      throw new Error(`the note: ${JSON.stringify(created)}`);
    }
    const note: AnnotationRef = created.result.result.annotation.ref;
    return { fault, worker, page, rect, create, note };
  }

  test('loads no page, for any kind', async () => {
    const { fault, worker, page, rect, create, note } = await withNote();
    const loaders = ['EPDFDoc_LoadPageByObjectNumber', 'EPDFDoc_LoadPageByObjectNumberNormalized'];
    fault.count(loaders);
    const drafts: Array<Record<string, unknown>> = [
      ...creatables()
        .filter(({ resources }) => !resources)
        .map(({ data }) => data as unknown as Record<string, unknown>),
      { subtype: 'popup', rect, parent: note },
      { subtype: 'text', rect, reply: { to: note } },
      {
        subtype: 'link',
        rect,
        target: { kind: 'goto', destination: { kind: 'fit', page } },
      },
    ];
    expect(drafts.length).toBeGreaterThan(10);
    for (const draft of drafts) {
      const response = await create(draft);
      expect(response.kind, String(draft.subtype)).toBe('resolve');
    }
    expect(fault.counts()).toEqual(Object.fromEntries(loaders.map((name) => [name, 0])));
    // The count sees a load when one happens: a draw loads the page.
    await worker.draw(page);
    expect(Object.values(fault.counts()).reduce((sum, calls) => sum + calls)).toBeGreaterThan(0);
  });

  test('that fails after linking to a note leaves the note as it was', async () => {
    const { fault, worker, rect, create, note } = await withNote();
    const baseline = {
      rewrite: await worker.save('rewrite'),
      incremental: await worker.save('incremental'),
    };
    // The popup's /Parent and the note's /Popup are written before the
    // creation date is: failing there must take the note's /Popup back too.
    fault.arm('FPDFAnnot_SetStringValue', 1, (args) => args[1] === 'CreationDate');
    const response = await create({ subtype: 'popup', rect, parent: note });
    expect(fault.fired()).toBe(true);
    expect(response.kind).toBe('reject');
    expect(await worker.save('rewrite')).toBe(baseline.rewrite);
    expect(await worker.save('incremental')).toBe(baseline.incremental);

    // And a create that holds finds the note free.
    expect((await create({ subtype: 'popup', rect, parent: note })).kind).toBe('resolve');
    expect(await worker.save('rewrite')).toMatch(/\/Popup \d+ 0 R/);
  });

  test('that fails after naming a weak note leaves the note weak', async () => {
    const fault = withFault(await createPdfRuntime({ prefer }));
    const worker = await openWorker(
      fault.runtime,
      new Uint8Array(await readFile(fixtures.weak)),
      'weak-reply',
    );
    const { list } = await worker.result({ kind: 'annotations.list' }, 'annotations.list');
    const weak = list.annotations.find(
      (dto) => dto.ref.kind === 'index' && dto.subtype !== 'popup',
    )!.ref;
    expect(weak).toBeDefined();
    const baseline = {
      rewrite: await worker.save('rewrite'),
      incremental: await worker.save('incremental'),
    };
    const reply = () =>
      worker.send({
        kind: 'annotations.create',
        page: weak.page,
        draft: {
          subtype: 'text',
          rect: { left: 10, bottom: 10, right: 30, top: 30 },
          reply: { to: weak },
        },
      });
    // The reply names the note (and makes it indirect) before its creation
    // date is written: failing there must take both back.
    fault.arm('FPDFAnnot_SetStringValue', 1, (args) => args[1] === 'CreationDate');
    const response = await reply();
    expect(fault.fired()).toBe(true);
    expect(response.kind).toBe('reject');
    expect(await worker.save('rewrite')).toBe(baseline.rewrite);
    expect(await worker.save('incremental')).toBe(baseline.incremental);
    const after = await worker.result({ kind: 'annotations.list' }, 'annotations.list');
    expect(after.list).toEqual(list);

    // And a reply that holds names it.
    const held = await reply();
    expect(held.kind).toBe('resolve');
    if (held.kind !== 'resolve' || held.result.tag !== 'annotations.create') return;
    expect(held.result.result.meta.changed).toHaveLength(2);
  });
});
