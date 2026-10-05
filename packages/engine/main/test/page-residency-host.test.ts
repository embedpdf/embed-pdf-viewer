/**
 * Parsed pages kept across jobs (PageResidency), through a WorkerHost on the
 * real wasm runtime: which jobs keep a page parsed, which close it, how a
 * render's page loads in slices and how an aborted load goes on.
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
import { pdf, type Objects } from './helpers/miniPdf';

/** Pages of small coloured squares: a parse of many steps. */
function heavyPdf(pageCount: number, squares: number): Uint8Array {
  const objects: Objects = { 1: '<< /Type /Catalog /Pages 2 0 R >>' };
  const kids: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const pageNumber = 3 + 2 * p;
    kids.push(`${pageNumber} 0 R`);
    let body = '';
    for (let i = 0; i < squares; i++) {
      const x = (i * 7 + p * 3) % 590;
      const y = (i * 13) % 830;
      body += `${(i % 7) / 7} ${(i % 5) / 5} ${(i % 3) / 3} rg ${x} ${y} 4 4 re f\n`;
    }
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Contents ${pageNumber + 1} 0 R >>`;
    objects[pageNumber + 1] = `<< /Length ${body.length} >>\nstream\n${body}endstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`;
  return pdf(objects);
}

const bytes = heavyPdf(2, 30_000);
const FIRST = toPageRef(3);
const SECOND = toPageRef(5);

const COUNTED = {
  EPDFDoc_StartLoadPageByObjectNumber: 'starts',
  EPDFDoc_LoadPageByObjectNumberNormalized: 'loads',
  EPDFDoc_LoadPageByObjectNumber: 'plainLoads',
  EPDFPage_ContinueLoad: 'continues',
  FPDF_ClosePage: 'closes',
  EPDF_RenderPageBitmapWithMatrix_Start: 'renders',
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
async function openHost(options: WorkerHostOptions = {}) {
  const { runtime, counts } = counting(await createPdfRuntime({ prefer: 'wasm' }));
  const replies: WorkerResponse[] = [];
  const host = new WorkerHost(
    runtime,
    (pack: WirePack<WorkerResponse>) => replies.push(pack.payload),
    options,
  );
  let jobId = 0;
  const send = (request: Record<string, unknown>): number => {
    host.receive({ docId: 'doc', jobId: ++jobId, ...request } as unknown as WorkerRequest);
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
  await ok({ kind: 'open.fatMem', bytes: bytes.slice().buffer, password: null });
  return { counts, send, settled, ok };
}

type Host = Awaited<ReturnType<typeof openHost>>;

const render = (host: Host, page: PageRef) =>
  host.send({ kind: 'pages.render', page, options: { viewport: { kind: 'scale', scale: 0.25 } } });

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
    await host.ok({ kind: 'pages.list' });
    await host.ok({ kind: 'annotations.list' });
    await host.ok({ kind: 'metadata.update', patch: { title: 'kept' } });
    expect(await digest(host, FIRST)).toBe(before);

    // An annotation drawn over the page: new pixels, from the same parse.
    await host.ok({
      kind: 'annotations.create',
      page: FIRST,
      draft: { subtype: 'square', box: { x: 100, y: 100, width: 200, height: 200 } },
    });
    expect(await digest(host, FIRST)).not.toBe(before);
    expect(parses(host)).toBe(1);
  }, 120_000);

  test('a write that changes the page closes it', async () => {
    const host = await openHost();
    await digest(host, FIRST);
    await host.ok({ kind: 'pages.rotate', pages: [FIRST], rotation: 90 });
    expect(host.counts.closes).toBeGreaterThan(0);
    await digest(host, FIRST);
    expect(parses(host)).toBeGreaterThan(1);
  }, 120_000);

  test("a render's page loads in slices, and an aborted load goes on in the next render", async () => {
    const sliced = await openHost({ renderSliceMs: 0 });
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

  test('pages that fit together both stay; pages that do not replace each other', async () => {
    const roomy = await openHost();
    for (const page of [FIRST, SECOND, FIRST, SECOND]) await digest(roomy, page);
    expect(parses(roomy)).toBe(2);

    // About one page's worth: the second page closes the first.
    const tight = await openHost({ parsedPageBudgetBytes: 4 * 1024 * 1024 });
    for (const page of [FIRST, SECOND, FIRST, SECOND]) await digest(tight, page);
    expect(parses(tight)).toBe(4);
  }, 120_000);
});
