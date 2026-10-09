/**
 * The queue's abort contract: a job aborted while it waits never reaches the
 * worker; a job aborted after it was sent rejects at once, the worker is told
 * to stop it, and its slot stays taken until the worker answers. Its ranking:
 * a call's priority, then where its page is in the working sets as they are
 * when the next job is picked (the order itself: job-order.test.ts). And a
 * running read giving way to a job that clearly outranks it.
 */
import { describe, expect, test } from 'vitest';
import {
  AbortError,
  wirePack,
  type PageBox,
  type WirePack,
  type WorkerJobRequest,
  type WorkerRequest,
  type WorkerResponse,
  type WorkingSetPage,
} from '@embedpdf/engine-core/runtime';
import { WorkerQueue } from '../src/worker/WorkerQueue';
import type { Transport } from '../src/transport/Transport';

function fakeTransport() {
  const sent: WorkerRequest[] = [];
  let handler: (msg: WorkerResponse) => void = () => undefined;
  const transport: Transport = {
    send: (pack: WirePack<WorkerRequest>) => void sent.push(pack.payload),
    onMessage: (next) => {
      handler = next;
      return () => undefined;
    },
    terminate: async () => undefined,
  };
  const answer = (jobId: number) =>
    handler({ kind: 'resolve', jobId, result: { tag: 'close' } } as WorkerResponse);
  /** The worker's answer to an abort: the job stopped. */
  const stopped = (jobId: number) =>
    handler({
      kind: 'reject',
      jobId,
      error: { name: 'EngineError', code: 'Aborted', message: 'stopped' },
    } as WorkerResponse);
  return { transport, sent, answer, stopped };
}

const job = (docId: string) => ({
  buildPack: (jobId: number) =>
    wirePack({ kind: 'close', effect: 'close', jobId, docId } as WorkerJobRequest),
});

describe('WorkerQueue', () => {
  test('drops a job aborted before it was sent', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const first = queue.enqueue(job('a'));
    const second = queue.enqueue(job('b'));
    second.abort('gone');

    await expect(second).rejects.toBeInstanceOf(AbortError);
    answer(sent[0]!.jobId);
    await first;
    expect(sent.map((request) => request.kind)).toEqual(['close']);
  });

  test('tells the worker to stop a sent job and keeps its slot until the worker answers', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const first = queue.enqueue(job('a'));
    const second = queue.enqueue(job('b'));
    const firstId = sent[0]!.jobId;

    first.abort('gone');
    await expect(first).rejects.toBeInstanceOf(AbortError);
    expect(sent).toEqual([
      expect.objectContaining({ kind: 'close', effect: 'close' }),
      { kind: 'abort', jobId: firstId },
    ]);

    // The worker's answer frees the slot, and the answer itself is dropped.
    answer(firstId);
    expect(sent[2]).toEqual(
      expect.objectContaining({ kind: 'close', effect: 'close', docId: 'b' }),
    );
    answer(sent[2]!.jobId);
    await second;
  });

  test('tells the worker a message at once, past waiting jobs, without taking a slot', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const running = queue.enqueue(job('running'));
    const waiting = queue.enqueue(job('waiting'));
    queue.tell((jobId) =>
      wirePack({ kind: 'pages.workingSet', jobId, docId: 'a', view: 'stage', pages: [] }),
    );
    expect(sent.map((request) => request.kind)).toEqual(['close', 'pages.workingSet']);

    answer(sent[0]!.jobId); // the slot frees: the waiting job goes next, as before
    expect(sent[2]).toEqual(
      expect.objectContaining({ kind: 'close', effect: 'close', docId: 'waiting' }),
    );
    answer(sent[2]!.jobId);
    await Promise.all([running, waiting]);
  });

  test('ranks the jobs waiting by where their pages are when it picks the next one', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const running = queue.enqueue(read('running'));
    const jobs = [
      queue.enqueue(read('199', 199)),
      queue.enqueue(read('200', 200)),
      queue.enqueue(read('201', 201)),
      queue.enqueue(read('whole document')),
    ];
    // The view lands on 200 after the jobs were asked for: they take their places now.
    queue.setWorkingSet('doc', 'stage', [
      shown(199, 'visible', 50_000),
      shown(200, 'visible', 1_000_000),
      shown(201, 'near', 0),
    ]);
    expect(await drain(sent, answer)).toEqual(['running', '200', '199', 'whole document', '201']);
    await Promise.all([running, ...jobs]);
  });

  test('background last, then where its page is, then the call’s priority', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [shown(1, 'visible', 1_000_000), shown(2, 'near', 0)]);
    // A write holds the slot meanwhile: a running read would give way to these.
    const running = queue.enqueue(write('running'));
    const high = queue.withFacts({ priority: 'high' });
    const jobs = [
      queue.withFacts({ priority: 'low' }).enqueue(read('low on screen', 1)),
      high.enqueue(read('high near', 2)),
      queue.enqueue(read('auto on screen', 1)),
      high.enqueue(read('high on screen', 1)),
    ];
    expect(await drain(sent, answer)).toEqual([
      'running',
      'high on screen',
      'auto on screen',
      'high near',
      'low on screen',
    ]);
    await Promise.all([running, ...jobs]);
  });

  test('landing on a page: every base on screen before any tile, pictures before data, then what is just off screen', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    // Page 200 fills the screen, a sliver of 199 shows above it, 201 is just below.
    queue.setWorkingSet('doc', 'stage', [
      shown(199, 'visible', 50_000),
      shown(200, 'visible', 1_000_000),
      shown(201, 'near', 0),
    ]);
    const running = queue.enqueue(write('running'));
    const picture = queue.withFacts({ priority: 'high', view: 'stage' });
    const tile = { x: 0, y: 0, width: 100, height: 100 };
    const jobs = [
      picture.enqueue(read('tile of 200', 200, tile)),
      queue.enqueue(read('geometry of 200', 200)),
      picture.enqueue(read('base of 201', 201)),
      picture.enqueue(read('tile of 199', 199, tile)),
      picture.enqueue(read('base of 199', 199)),
      picture.enqueue(read('base of 200', 200)),
    ];
    expect(await drain(sent, answer)).toEqual([
      'running',
      'base of 200',
      'base of 199',
      'tile of 200',
      'tile of 199',
      'geometry of 200',
      'base of 201',
    ]);
    await Promise.all([running, ...jobs]);
  });

  test('a job ranks by the view it serves; a shared job by the best view; a part off screen is near', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [
      shown(1, 'visible', 1_000_000, { x: 0, y: 0, width: 600, height: 400 }),
    ]);
    queue.setWorkingSet('doc', 'rail', [shown(1, 'visible', 30_000), shown(2, 'visible', 30_000)]);
    const running = queue.enqueue(read('running'));
    const thumbs = queue.withFacts({ view: 'rail' });
    const stage = queue.withFacts({ view: 'stage' });
    const jobs = [
      thumbs.enqueue(read('thumbnail of 1', 1)),
      queue.enqueue(read('text of 2', 2)),
      stage.enqueue(read('tile below the screen', 1, { x: 0, y: 500, width: 100, height: 100 })),
      stage.enqueue(read('tile on screen', 1, { x: 0, y: 300, width: 100, height: 100 })),
      queue.enqueue(read('text of 1', 1)),
    ];
    // A whole page before a part of one; among the whole pages, the most pixels first.
    expect(await drain(sent, answer)).toEqual([
      'running',
      'text of 1',
      'thumbnail of 1',
      'text of 2',
      'tile on screen',
      'tile below the screen',
    ]);
    await Promise.all([running, ...jobs]);
  });

  test('aborting a waiting write lets the read it held back go', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const running = queue.enqueue(read('running'));
    const edit = queue.enqueue(write('edit'));
    const after = queue.enqueue(read('read'));
    edit.abort('gone');
    await expect(edit).rejects.toBeInstanceOf(AbortError);
    expect(await drain(sent, answer)).toEqual(['running', 'read']);
    await Promise.all([running, after]);
  });

  test('a job built later keeps its place: what is asked after it waits, and an abort before it is built drops it', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    let build!: () => void;
    const built = new Promise<void>((resolve) => (build = resolve));
    const create = queue.enqueue({
      line: { effect: 'write', docId: 'doc' },
      buildPack: async (jobId: number) => {
        await built;
        return write('create').buildPack(jobId);
      },
    });
    const update = queue.enqueue(write('update'));
    const after = queue.enqueue(read('read'));
    expect(sent).toEqual([]);
    build();
    await built;
    await Promise.resolve();
    expect(await drain(sent, answer)).toEqual(['create', 'update', 'read']);
    await Promise.all([create, update, after]);

    const dropped = queue.enqueue({
      line: { effect: 'write', docId: 'doc' },
      buildPack: async (jobId: number) => write('dropped').buildPack(jobId),
    });
    dropped.abort('gone');
    await expect(dropped).rejects.toBeInstanceOf(AbortError);
    const from = sent.length;
    const next = queue.enqueue(write('next'));
    expect(await drain(sent, answer, from)).toEqual(['next']);
    await next;
  });

  test('a working set reaches the worker at once, and is forgotten when the document closes', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const running = queue.enqueue(read('running'));
    queue.setWorkingSet('doc', 'stage', [shown(2, 'visible', 10)]);
    expect(sent[1]).toEqual(
      expect.objectContaining({ kind: 'pages.workingSet', docId: 'doc', view: 'stage' }),
    );
    queue.forgetWorkingSets('doc');
    const jobs = [queue.enqueue(read('1', 1)), queue.enqueue(read('2', 2))];
    expect(await drain(sent, answer)).toEqual(['running', '1', '2']);
    await Promise.all([running, ...jobs]);
  });
});

describe('a running read giving way', () => {
  /** What the worker was sent, read: each request's name, or `stop <name>` for an abort. */
  const log = (sent: WorkerRequest[]) => {
    const names = new Map<number, string>();
    return sent
      .filter((request) => request.kind !== 'pages.workingSet')
      .map((request) => {
        const { jobId, kind, name } = request as { jobId: number; kind: string; name?: string };
        if (kind === 'abort') return `stop ${names.get(jobId)}`;
        names.set(jobId, name ?? kind);
        return name ?? kind;
      });
  };

  test('gives way to a job that clearly outranks it, runs again after it, and its caller just gets its answer', async () => {
    const { transport, sent, answer, stopped } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [shown(1, 'visible', 1_000_000), shown(2, 'near', 0)]);
    const warmUp = queue.enqueue(read('warm-up of 2', 2));
    const warmUpId = sent.at(-1)!.jobId;
    const landing = queue.enqueue(read('render of 1', 1));
    expect(log(sent)).toEqual(['warm-up of 2', 'stop warm-up of 2']);

    stopped(warmUpId); // the worker stopped it at its next slice
    expect(log(sent)).toEqual(['warm-up of 2', 'stop warm-up of 2', 'render of 1']);
    answer(sent.at(-1)!.jobId);
    expect(log(sent).at(-1)).toBe('warm-up of 2'); // sent again, under its own id
    expect(sent.at(-1)!.jobId).toBe(warmUpId);
    answer(warmUpId);
    await expect(Promise.all([landing, warmUp])).resolves.toHaveLength(2);
  });

  test("a running tile gives way to another page's base, and a running read about a page to its picture", async () => {
    const { transport, sent, answer, stopped } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [
      shown(1, 'visible', 1_000_000),
      shown(2, 'visible', 50_000),
    ]);
    const picture = queue.withFacts({ priority: 'high', view: 'stage' });
    const tile = picture.enqueue(read('tile of 1', 1, { x: 0, y: 0, width: 100, height: 100 }));
    const tileId = sent.at(-1)!.jobId;
    const base = picture.enqueue(read('base of 2', 2));
    expect(log(sent)).toEqual(['tile of 1', 'stop tile of 1']);
    stopped(tileId);
    answer(sent.at(-1)!.jobId); // base of 2
    answer(sent.at(-1)!.jobId); // tile of 1, again
    await Promise.all([tile, base]);

    const appearances = queue.enqueue(read('appearances of 1', 1));
    const appearancesId = sent.at(-1)!.jobId;
    const render = picture.enqueue(read('render of 1', 1));
    expect(log(sent).slice(-2)).toEqual(['appearances of 1', 'stop appearances of 1']);
    stopped(appearancesId);
    answer(sent.at(-1)!.jobId); // render of 1
    answer(sent.at(-1)!.jobId); // appearances of 1, again
    await Promise.all([appearances, render]);
  });

  test('pixels alone stop nothing: two pages on screen take turns', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [
      shown(1, 'visible', 30_000),
      shown(2, 'visible', 900_000),
    ]);
    const small = queue.enqueue(read('small', 1));
    const big = queue.enqueue(read('big', 2));
    expect(log(sent)).toEqual(['small']);
    expect(await drain(sent, answer)).toEqual(['small', 'big']);
    await Promise.all([small, big]);
  });

  test('a write never gives way, nor does a read with buffers to move', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const edit = queue.enqueue(write('edit'));
    const urgent = queue.withFacts({ priority: 'high' }).enqueue(read('urgent', 1));
    expect(log(sent)).toEqual(['edit']);
    answer(sent[0]!.jobId);
    expect(log(sent)).toEqual(['edit', 'urgent']);
    answer(sent[1]!.jobId);
    await Promise.all([edit, urgent]);
  });

  test('a read that finished before the stop reached it keeps its answer', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [shown(1, 'visible', 1_000_000), shown(2, 'near', 0)]);
    const warmUp = queue.enqueue(read('warm-up of 2', 2));
    const warmUpId = sent.at(-1)!.jobId;
    const landing = queue.enqueue(read('render of 1', 1));
    answer(warmUpId); // done before the stop arrived: the answer stands
    await expect(warmUp).resolves.toBeDefined();
    expect(log(sent)).toEqual(['warm-up of 2', 'stop warm-up of 2', 'render of 1']);
    answer(sent.at(-1)!.jobId);
    await landing;
  });

  test('its caller aborting it wins over giving way: it is not sent again', async () => {
    const { transport, sent, answer, stopped } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [shown(1, 'visible', 1_000_000), shown(2, 'near', 0)]);
    const warmUp = queue.enqueue(read('warm-up of 2', 2));
    const warmUpId = sent.at(-1)!.jobId;
    const landing = queue.enqueue(read('render of 1', 1));
    warmUp.abort('gone');
    stopped(warmUpId);
    await expect(warmUp).rejects.toBeInstanceOf(AbortError);
    answer(sent.at(-1)!.jobId);
    await landing;
    expect(log(sent).filter((name) => name === 'warm-up of 2')).toHaveLength(1);
  });

  test('a working set that moves the running read off screen makes it give way', async () => {
    const { transport, sent, answer, stopped } = fakeTransport();
    const queue = new WorkerQueue(transport);
    queue.setWorkingSet('doc', 'stage', [
      shown(1, 'visible', 30_000),
      shown(2, 'visible', 900_000),
    ]);
    const reading = queue.enqueue(read('text of 1', 1));
    const readingId = sent.at(-1)!.jobId;
    const next = queue.enqueue(read('text of 2', 2));
    expect(log(sent)).toEqual(['text of 1']);

    // The camera moved on: page 1 is near now.
    queue.setWorkingSet('doc', 'stage', [shown(1, 'near', 0), shown(2, 'visible', 900_000)]);
    expect(log(sent)).toEqual(['text of 1', 'stop text of 1']);
    stopped(readingId);
    expect(await drain(sent, answer, sent.length - 1)).toEqual(['text of 2', 'text of 1']);
    await Promise.all([reading, next]);
  });
});

/** A read of page `page` of `doc` (of the whole document without one), named by `docId`'s slot. */
function read(name: string, page?: number, region?: PageBox) {
  return {
    buildPack: (jobId: number) =>
      wirePack({
        kind: 'pages.text',
        effect: 'read',
        jobId,
        docId: 'doc',
        page: { kind: 'objectNumber', objectNumber: page ?? 1 },
        name,
        ...(page === undefined ? { page: undefined } : {}),
      } as unknown as WorkerJobRequest),
    ...(region ? { region } : {}),
  };
}

function write(name: string) {
  return {
    buildPack: (jobId: number) =>
      wirePack({
        kind: 'metadata.update',
        effect: 'write',
        jobId,
        docId: 'doc',
        name,
      } as unknown as WorkerJobRequest),
  };
}

function shown(
  objectNumber: number,
  role: 'visible' | 'near',
  pixels: number,
  visible?: PageBox,
): WorkingSetPage {
  return {
    page: { kind: 'objectNumber', objectNumber },
    role,
    pixels,
    ...(visible ? { visible } : {}),
  };
}

/** Answers every job as it is sent, from `from` on, and names them in the order they went. */
async function drain(
  sent: WorkerRequest[],
  answer: (jobId: number) => void,
  from = sent.findIndex((request) => request.kind !== 'pages.workingSet'),
): Promise<string[]> {
  const order: string[] = [];
  for (let next = from; next < sent.length; next++) {
    const request = sent[next] as { jobId: number; kind: string; name?: string };
    if (request.kind === 'pages.workingSet') continue;
    order.push(request.name ?? request.kind);
    answer(request.jobId);
  }
  return order;
}
