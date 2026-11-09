/**
 * Page renders run in slices: a render the caller aborts stops at its next
 * slice, and requests that arrive during a render wait their turn, in order,
 * because PDFium holds the page's render until it ends. However finely a render
 * is sliced, its bytes are those of a render in one slice.
 *
 * Mock-free: the real wasm runtime, driven through a WorkerHost one turn of the
 * event loop at a time, so every step is deterministic.
 */
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  toPageRef,
  type PageRef,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import {
  createPdfRuntime,
  type Callback,
  type PdfRuntimeModule,
  type Ptr,
} from '@embedpdf/engine-runtime';
import { WorkerHost } from '../../services/src/worker-host/WorkerHost';
import { heavyPdf } from './helpers/heavyPdf';

const bytes = heavyPdf(2, 30_000);
const FIRST = toPageRef(3);
const SECOND = toPageRef(5);

/**
 * The runtime, counting the render slices it runs, and the memory and
 * callbacks it hands out: a render gives every one back, aborted or not.
 */
function counting(runtime: PdfRuntimeModule) {
  const counts = {
    starts: 0,
    continues: 0,
    schemeStarts: 0,
    schemeContinues: 0,
    allocations: 0,
    frees: 0,
    callbacks: 0,
    disposals: 0,
  };
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      const counted: Record<string, keyof typeof counts> = {
        EPDF_RenderPageBitmapWithMatrix_Start: 'starts',
        EPDF_RenderPage_Continue: 'continues',
        FPDF_RenderPageBitmapWithColorScheme_Start: 'schemeStarts',
        FPDF_RenderPage_Continue: 'schemeContinues',
      };
      if (typeof name === 'string' && name in counted) {
        return (...args: unknown[]) => {
          counts[counted[name]!]++;
          return (original as (...values: unknown[]) => unknown)(...args);
        };
      }
      return original;
    },
  });
  const mem = Object.create(runtime.mem, {
    alloc: {
      value: (bytes: number) => {
        counts.allocations++;
        return runtime.mem.alloc(bytes);
      },
    },
    free: {
      value: (ptr: Ptr) => {
        counts.frees++;
        runtime.mem.free(ptr);
      },
    },
  }) as PdfRuntimeModule['mem'];
  const cb = Object.create(runtime.cb, {
    register: {
      value: (...args: Parameters<PdfRuntimeModule['cb']['register']>) => {
        counts.callbacks++;
        return runtime.cb.register(...args);
      },
    },
    dispose: {
      value: (callback: Callback) => {
        counts.disposals++;
        runtime.cb.dispose(callback);
      },
    },
  }) as PdfRuntimeModule['cb'];
  return {
    runtime: Object.create(runtime, {
      fn: { value: fn },
      mem: { value: mem },
      cb: { value: cb },
    }) as PdfRuntimeModule,
    counts,
  };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A worker host with the heavy document open, and the replies it posted. */
async function openHost(sliceMs: number) {
  const { runtime, counts } = counting(await createPdfRuntime({ prefer: 'wasm' }));
  const replies: WorkerResponse[] = [];
  const host = new WorkerHost(
    runtime,
    (pack: WirePack<WorkerResponse>) => replies.push(pack.payload),
    { sliceMs },
  );
  let jobId = 0;
  // An abort names the job it stops; every other request gets a new id.
  const send = (request: Record<string, unknown>): number => {
    host.receive({ docId: 'doc', jobId: ++jobId, ...request } as unknown as WorkerRequest);
    return jobId;
  };
  const reply = (id: number) => replies.find((response) => response.jobId === id);
  const settled = async (id: number) => {
    while (!reply(id)) await turn();
    return reply(id)!;
  };
  const order = () => replies.map((response) => response.jobId);
  const open = await settled(
    send({ kind: 'open.fatMem', effect: 'open', bytes: bytes.slice().buffer, password: null }),
  );
  expect(open.kind).toBe('resolve');
  return { host, counts, send, reply, settled, order };
}

type Host = Awaited<ReturnType<typeof openHost>>;

const render = (host: Host, page: PageRef, options: Record<string, unknown> = {}) =>
  host.send({
    kind: 'pages.render',
    effect: 'read',
    page,
    options: { viewport: { kind: 'scale', scale: 1 }, ...options },
  });

async function digest(host: Host, page: PageRef, options: Record<string, unknown> = {}) {
  const response = await host.settled(render(host, page, options));
  if (response.kind !== 'resolve' || response.result.tag !== 'pages.render') {
    throw new Error(`render failed: ${JSON.stringify(response)}`);
  }
  return createHash('sha256').update(new Uint8Array(response.result.raster.data)).digest('hex');
}

const tile = {
  viewport: { kind: 'scale', scale: 3 },
  target: { kind: 'rect', rect: { x: 200, y: 300, width: 130, height: 130 } },
};

describe('sliced page renders (wasm engine)', () => {
  test('render the bytes of a render in one slice, however finely sliced', async () => {
    const whole = await openHost(60_000);
    const finest = await openHost(0);
    for (const options of [{}, tile, { rotation: 90, background: 'transparent' }]) {
      const before = finest.counts.continues;
      expect(await digest(finest, FIRST, options)).toBe(await digest(whole, FIRST, options));
      expect(finest.counts.continues - before).toBeGreaterThan(10);
    }
    expect(whole.counts.continues).toBe(0);
  }, 120_000);

  test('stop at the next slice once aborted, and leave the page ready to render again', async () => {
    const host = await openHost(0);
    const expected = await digest(await openHost(60_000), FIRST);

    const job = render(host, FIRST);
    while (host.counts.continues < 3) await turn();
    host.send({ kind: 'abort', jobId: job });
    const continuesAtAbort = host.counts.continues;

    const aborted = await host.settled(job);
    expect(aborted.kind).toBe('reject');
    if (aborted.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    // The abort landed between two slices; none ran after it.
    expect(host.counts.continues).toBe(continuesAtAbort);

    expect(await digest(host, FIRST)).toBe(expected);
  }, 120_000);

  test('hold requests that arrive during a render and run them after it, in order', async () => {
    const host = await openHost(0);
    const first = render(host, FIRST);
    while (host.counts.continues < 3) await turn();
    const list = host.send({ kind: 'pages.list', effect: 'read' });
    const update = host.send({
      kind: 'metadata.update',
      effect: 'write',
      patch: { title: 'held' },
    });
    const second = render(host, SECOND);

    for (let i = 0; i < 20; i++) await turn();
    // Nothing ran beside the render, not even the page list.
    expect(host.reply(list)).toBeUndefined();
    expect(host.counts.starts).toBe(1);

    await host.settled(second);
    expect(host.order().slice(-4)).toEqual([first, list, update, second]);
    for (const id of [first, list, update, second]) expect(host.reply(id)!.kind).toBe('resolve');
  }, 120_000);

  test('answer a held request that is aborted without running it', async () => {
    const host = await openHost(0);
    const first = render(host, FIRST);
    while (host.counts.continues < 3) await turn();
    const second = render(host, SECOND);
    host.send({ kind: 'abort', jobId: second });

    // Answered at once, while the first render still runs.
    const aborted = host.reply(second);
    expect(aborted?.kind).toBe('reject');
    if (aborted?.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    expect(host.reply(first)).toBeUndefined();

    expect((await host.settled(first)).kind).toBe('resolve');
    for (let i = 0; i < 5; i++) await turn();
    expect(host.counts.starts).toBe(1);
  }, 120_000);

  test('close a document after the render that was running on it', async () => {
    const host = await openHost(0);
    const job = render(host, FIRST);
    while (host.counts.continues < 3) await turn();
    const close = host.send({ kind: 'close', effect: 'close' });

    expect((await host.settled(close)).kind).toBe('resolve');
    expect(host.order().slice(-2)).toEqual([job, close]);
    expect(host.reply(job)!.kind).toBe('resolve');
  }, 120_000);
});

describe('sliced page renders in colors (wasm engine)', () => {
  const dark = { pageColors: 'dark' };

  test('render the bytes of a render in one slice, however finely sliced', async () => {
    const whole = await openHost(60_000);
    const finest = await openHost(0);
    for (const options of [
      dark,
      { ...dark, ...tile },
      { ...dark, rotation: 90, background: 'transparent' },
    ]) {
      const before = finest.counts.schemeContinues;
      expect(await digest(finest, FIRST, options)).toBe(await digest(whole, FIRST, options));
      expect(finest.counts.schemeContinues - before).toBeGreaterThan(10);
    }
    expect(whole.counts.schemeContinues).toBe(0);
    // The render in colors is its own: the matrix render ran for none of it.
    expect(finest.counts.starts + finest.counts.continues).toBe(0);
  }, 120_000);

  test('stop at the next slice once aborted, give back what it took, and leave the page ready to render again', async () => {
    const host = await openHost(0);
    const expected = await digest(await openHost(60_000), FIRST, dark);
    const { counts } = host;
    const [allocated, freed] = [counts.allocations, counts.frees];
    const callbacksBefore = counts.callbacks;

    const job = render(host, FIRST, dark);
    while (counts.schemeContinues < 3) await turn();
    host.send({ kind: 'abort', jobId: job });
    const continuesAtAbort = counts.schemeContinues;

    const aborted = await host.settled(job);
    expect(aborted.kind).toBe('reject');
    if (aborted.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    // The abort landed between two slices; none ran after it.
    expect(counts.schemeContinues).toBe(continuesAtAbort);
    // Every allocation of the render, and its pause callback, was given back.
    expect(counts.allocations - allocated).toBe(counts.frees - freed);
    expect(counts.callbacks).toBe(counts.disposals);
    expect(counts.callbacks - callbacksBefore).toBe(1);

    expect(await digest(host, FIRST, dark)).toBe(expected);
    expect(counts.callbacks).toBe(counts.disposals);
  }, 120_000);

  test('hold requests that arrive during a render in colors, and run them after it', async () => {
    const host = await openHost(0);
    const first = render(host, FIRST, dark);
    while (host.counts.schemeContinues < 3) await turn();
    const list = host.send({ kind: 'pages.list', effect: 'read' });
    const second = render(host, SECOND, dark);

    for (let i = 0; i < 20; i++) await turn();
    expect(host.reply(list)).toBeUndefined();
    expect(host.counts.schemeStarts).toBe(1);

    await host.settled(second);
    expect(host.order().slice(-3)).toEqual([first, list, second]);
    for (const id of [first, list, second]) expect(host.reply(id)!.kind).toBe('resolve');
  }, 120_000);
});
