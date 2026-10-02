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
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { WorkerHost } from '../../services/src/worker-host/WorkerHost';
import { pdf, type Objects } from './helpers/miniPdf';

/** Pages of small coloured squares, enough for a render of many slices. */
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

/** The runtime, counting the render slices it runs. */
function counting(runtime: PdfRuntimeModule) {
  const counts = { starts: 0, continues: 0 };
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      if (name === 'EPDF_RenderPageBitmapWithMatrix_Start') {
        return (...args: unknown[]) => {
          counts.starts++;
          return (original as (...values: unknown[]) => unknown)(...args);
        };
      }
      if (name === 'EPDF_RenderPage_Continue') {
        return (...args: unknown[]) => {
          counts.continues++;
          return (original as (...values: unknown[]) => unknown)(...args);
        };
      }
      return original;
    },
  });
  return { runtime: Object.create(runtime, { fn: { value: fn } }) as PdfRuntimeModule, counts };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A worker host with the heavy document open, and the replies it posted. */
async function openHost(renderSliceMs: number) {
  const { runtime, counts } = counting(await createPdfRuntime({ prefer: 'wasm' }));
  const replies: WorkerResponse[] = [];
  const host = new WorkerHost(
    runtime,
    (pack: WirePack<WorkerResponse>) => replies.push(pack.payload),
    { renderSliceMs },
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
    send({ kind: 'open.fatMem', bytes: bytes.slice().buffer, password: null }),
  );
  expect(open.kind).toBe('resolve');
  return { host, counts, send, reply, settled, order };
}

type Host = Awaited<ReturnType<typeof openHost>>;

const render = (host: Host, page: PageRef, options: Record<string, unknown> = {}) =>
  host.send({
    kind: 'pages.render',
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
    const list = host.send({ kind: 'pages.list' });
    const update = host.send({ kind: 'metadata.update', patch: { title: 'held' } });
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
    const close = host.send({ kind: 'close' });

    expect((await host.settled(close)).kind).toBe('resolve');
    expect(host.order().slice(-2)).toEqual([job, close]);
    expect(host.reply(job)!.kind).toBe('resolve');
  }, 120_000);
});
