/**
 * Parsed pages kept across jobs (PageResidency), through a WorkerHost on the
 * real wasm runtime: which jobs keep a page parsed, which close it, how a
 * render's or a read's page loads in slices and how an aborted load goes on,
 * how a read's glyph loop stops part way, in which order renders held during
 * a render run, and how what a view shows keeps its pages parsed.
 *
 * Mock-free: the runtime is only wrapped to count the native calls that load,
 * continue and close pages.
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
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { WorkerHost, type WorkerHostOptions } from '../../services/src/worker-host/WorkerHost';
import { heavyPdf, textPdf } from './helpers/heavyPdf';

const bytes = heavyPdf(2, 30_000);
/** One of these pages parses into 5 to 6 MB: this budget keeps one, never two. */
const ONE_PAGE_BUDGET = 8 * 1024 * 1024;
/** And this one keeps two, never three. */
const TWO_PAGE_BUDGET = 14 * 1024 * 1024;
const FIRST = toPageRef(3);
const SECOND = toPageRef(5);

const COUNTED = {
  EPDFDoc_StartLoadPageByObjectNumber: 'starts',
  EPDFDoc_LoadPageByObjectNumberNormalized: 'loads',
  EPDFDoc_LoadPageByObjectNumber: 'plainLoads',
  EPDFPage_ContinueLoad: 'continues',
  FPDF_ClosePage: 'closes',
  EPDF_RenderPageBitmapWithMatrix_Start: 'renders',
  FPDFText_GetTextObject: 'glyphs',
} as const;
type Counted = (typeof COUNTED)[keyof typeof COUNTED];

/** The runtime, counting the calls that load, continue and close pages. */
function counting(runtime: PdfRuntimeModule) {
  const counts: Record<Counted, number> = {
    starts: 0,
    loads: 0,
    plainLoads: 0,
    continues: 0,
    closes: 0,
    renders: 0,
    glyphs: 0,
  };
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      const counter = COUNTED[name as keyof typeof COUNTED];
      if (!counter) return original;
      return (...args: unknown[]) => {
        counts[counter]++;
        return (original as (...values: unknown[]) => unknown)(...args);
      };
    },
  });
  return { runtime: Object.create(runtime, { fn: { value: fn } }) as PdfRuntimeModule, counts };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A worker host with the heavy document open, and the replies it posted. */
async function openHost(options: WorkerHostOptions = {}, document: Uint8Array = bytes) {
  const { runtime, counts } = counting(await createPdfRuntime({ prefer: 'wasm' }));
  const replies: WorkerResponse[] = [];
  const host = new WorkerHost(
    runtime,
    (pack: WirePack<WorkerResponse>) => replies.push(pack.payload),
    options,
  );
  let jobId = 0;
  const send = (request: Record<string, unknown>): number => {
    ++jobId;
    // Every write is its own, under its own opId.
    host.receive({
      docId: 'doc',
      jobId,
      opId: `op-${jobId}`,
      ...request,
    } as unknown as WorkerRequest);
    return jobId;
  };
  const reply = (id: number) => replies.find((response) => response.jobId === id);
  const settled = async (id: number) => {
    while (!reply(id)) await turn();
    return reply(id)!;
  };
  const ok = async (request: Record<string, unknown>) => {
    const response = await settled(send(request));
    if (response.kind !== 'resolve') throw new Error(JSON.stringify(response));
    return response;
  };
  await ok({ kind: 'open.fatMem', effect: 'open', bytes: document.slice().buffer, password: null });
  return { counts, replies, send, settled, ok };
}

type Host = Awaited<ReturnType<typeof openHost>>;

const render = (host: Host, page: PageRef) =>
  host.send({
    kind: 'pages.render',
    effect: 'read',
    page,
    options: { viewport: { kind: 'scale', scale: 0.25 } },
  });

async function digest(host: Host, page: PageRef) {
  const response = await host.settled(render(host, page));
  if (response.kind !== 'resolve' || response.result.tag !== 'pages.render') {
    throw new Error(`render failed: ${JSON.stringify(response)}`);
  }
  return createHash('sha256').update(new Uint8Array(response.result.raster.data)).digest('hex');
}

/** Page loads of any kind: each parses the page. */
const parses = (host: Host) => host.counts.starts + host.counts.loads + host.counts.plainLoads;

describe('parsed pages kept across jobs (wasm engine)', () => {
  test("a page's first render parses it once: looking it up loads nothing", async () => {
    const host = await openHost();
    await digest(host, SECOND);
    expect(host.counts).toMatchObject({ starts: 1, loads: 0, plainLoads: 0, closes: 0 });
  }, 120_000);

  test('a page parses once for many renders', async () => {
    const host = await openHost();
    const first = await digest(host, FIRST);
    expect(await digest(host, FIRST)).toBe(first);
    expect(await digest(host, FIRST)).toBe(first);
    expect(parses(host)).toBe(1);
    expect(host.counts.closes).toBe(0);
  }, 120_000);

  test('reads and writes that leave content alone keep the page parsed', async () => {
    const host = await openHost();
    const before = await digest(host, FIRST);
    await host.ok({ kind: 'pages.list', effect: 'read' });
    await host.ok({ kind: 'annotations.list', effect: 'read' });
    await host.ok({ kind: 'metadata.update', effect: 'write', patch: { title: 'kept' } });
    expect(await digest(host, FIRST)).toBe(before);

    // An annotation drawn over the page: new pixels, from the same parse.
    await host.ok({
      kind: 'annotations.create',
      effect: 'write',
      page: FIRST,
      draft: { subtype: 'square', box: { x: 100, y: 100, width: 200, height: 200 } },
    });
    expect(await digest(host, FIRST)).not.toBe(before);
    expect(parses(host)).toBe(1);
  }, 120_000);

  test('a write that changes the page closes it', async () => {
    const host = await openHost();
    await digest(host, FIRST);
    await host.ok({ kind: 'pages.rotate', effect: 'contentWrite', pages: [FIRST], rotation: 90 });
    expect(host.counts.closes).toBeGreaterThan(0);
    await digest(host, FIRST);
    expect(parses(host)).toBeGreaterThan(1);
  }, 120_000);

  test("a render's page loads in slices, and an aborted load goes on in the next render", async () => {
    const sliced = await openHost({ sliceMs: 0 });
    const job = render(sliced, FIRST);
    // Abort while the page loads, before it renders.
    while (sliced.counts.continues < 5) await turn();
    expect(sliced.counts.renders).toBe(0);
    sliced.send({ kind: 'abort', jobId: job });
    const aborted = await sliced.settled(job);
    expect(aborted.kind).toBe('reject');
    if (aborted.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    const continuesAtAbort = sliced.counts.continues;

    // The next render goes on with the load set aside, and renders the bytes
    // of a page loaded at once.
    const whole = await digest(await openHost(), FIRST);
    expect(await digest(sliced, FIRST)).toBe(whole);
    expect(sliced.counts.starts).toBe(1);
    expect(sliced.counts.continues).toBeGreaterThan(continuesAtAbort);
    expect(sliced.counts.closes).toBe(0);
  }, 120_000);

  test("a read's page loads in slices too: what arrives meanwhile waits, and an aborted load goes on in the next read", async () => {
    const sliced = await openHost({ sliceMs: 0 });
    const geometry = { kind: 'pages.geometry', effect: 'read', page: FIRST };
    const job = sliced.send(geometry);
    // Arrives while the read pauses between slices of its page load: held.
    const list = sliced.send({ kind: 'pages.list', effect: 'read' });
    while (sliced.counts.continues < 5) await turn();
    sliced.send({ kind: 'abort', jobId: job });
    const aborted = await sliced.settled(job);
    expect(aborted.kind).toBe('reject');
    if (aborted.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    expect((await sliced.settled(list)).kind).toBe('resolve');
    const answered = sliced.replies.map((reply) => reply.jobId);
    expect(answered.indexOf(job)).toBeLessThan(answered.indexOf(list));
    const continuesAtAbort = sliced.counts.continues;

    // The next read goes on with the load set aside.
    expect((await sliced.settled(sliced.send(geometry))).kind).toBe('resolve');
    expect(sliced.counts.starts).toBe(1);
    expect(sliced.counts.continues).toBeGreaterThan(continuesAtAbort);
    expect(sliced.counts.closes).toBe(0);
  }, 120_000);

  test("a page's glyphs are read in slices: an abort stops the loop part way, and the page stays parsed", async () => {
    const host = await openHost({ sliceMs: 0 }, textPdf(200));
    const job = host.send({ kind: 'pages.geometry', effect: 'read', page: toPageRef(3) });
    while (host.counts.glyphs < 20) await turn();
    host.send({ kind: 'abort', jobId: job });
    const aborted = await host.settled(job);
    expect(aborted.kind).toBe('reject');
    if (aborted.kind === 'reject') expect(aborted.error.code).toBe('Aborted');
    // Stopped within a glyph or two of the abort, of the page's thousands.
    expect(host.counts.glyphs).toBeLessThan(100);
    expect(parses(host)).toBe(1);
    expect(host.counts.closes).toBe(0);
  }, 120_000);

  test('pages that fit together both stay; pages that do not replace each other', async () => {
    const roomy = await openHost();
    for (const page of [FIRST, SECOND, FIRST, SECOND]) await digest(roomy, page);
    expect(parses(roomy)).toBe(2);

    // One page fits, two don't: each page closes the other.
    const tight = await openHost({ parsedPageBudgetBytes: ONE_PAGE_BUDGET });
    for (const page of [FIRST, SECOND, FIRST, SECOND]) await digest(tight, page);
    expect(parses(tight)).toBe(4);
  }, 120_000);

  test('a working set is taken at once, even during a render, and decides which page a load closes', async () => {
    const THIRD = toPageRef(7);
    const host = await openHost(
      { parsedPageBudgetBytes: TWO_PAGE_BUDGET, sliceMs: 0 },
      heavyPdf(3, 30_000),
    );
    await digest(host, SECOND);
    await digest(host, FIRST);

    // A render of the first page takes the worker, so the third page's render
    // is held behind it. The working set is not: it is taken at once, before
    // the third page loads. It shows the second page big and the first small,
    // so the load closes the first, though the second was used longer ago.
    const running = render(host, FIRST);
    const third = render(host, THIRD);
    const workingSet = host.send({
      kind: 'pages.workingSet',
      view: 'stage',
      pages: [
        { page: SECOND, role: 'visible', pixels: 1_000_000 },
        { page: FIRST, role: 'visible', pixels: 30_000 },
      ],
    });
    await host.settled(running);
    await host.settled(third);
    expect(parses(host)).toBe(3);
    await digest(host, SECOND); // still parsed
    expect(parses(host)).toBe(3);
    expect(host.replies.some((reply) => reply.jobId === workingSet)).toBe(false); // never answered
  }, 120_000);

  test('renders held during a render run parsed page first; other requests hold their place', async () => {
    const THIRD = toPageRef(7);
    const host = await openHost({}, heavyPdf(3, 30_000));
    await digest(host, FIRST); // parsed and kept

    const names = new Map<number, string>();
    const sent = (name: string, jobId: number) => names.set(jobId, name);
    sent('running', render(host, SECOND));
    // All arrive while the render above is in progress, so all are held.
    sent('third', render(host, THIRD));
    sent('first, parsed', render(host, FIRST));
    sent('second, parsed', render(host, SECOND));
    sent('list', host.send({ kind: 'pages.list', effect: 'read' }));
    sent('after the list', render(host, THIRD));
    const ids = [...names.keys()];
    await Promise.all(ids.map((id) => host.settled(id)));

    const order = host.replies
      .filter((reply) => names.has(reply.jobId))
      .map((reply) => names.get(reply.jobId));
    expect(order).toEqual([
      'running',
      'first, parsed',
      'second, parsed',
      'third',
      'list',
      'after the list',
    ]);
    expect(host.replies.every((reply) => reply.kind === 'resolve')).toBe(true);
  }, 120_000);
});
