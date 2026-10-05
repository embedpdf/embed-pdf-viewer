/**
 * The queue's abort contract: a job aborted while it waits never reaches the
 * worker; a job aborted after it was sent rejects at once, the worker is told
 * to stop it, and its slot stays taken until the worker answers. And its
 * order: by priority, then rank, then arrival, with ranks changeable while
 * a job waits.
 */
import { describe, expect, test } from 'vitest';
import {
  AbortError,
  wirePack,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
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
  return { transport, sent, answer };
}

const job = (docId: string) => ({
  buildPack: (jobId: number) => wirePack({ kind: 'close', jobId, docId } as WorkerRequest),
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
      expect.objectContaining({ kind: 'close' }),
      { kind: 'abort', jobId: firstId },
    ]);

    // The worker's answer frees the slot, and the answer itself is dropped.
    answer(firstId);
    expect(sent[2]).toEqual(expect.objectContaining({ kind: 'close', docId: 'b' }));
    answer(sent[2]!.jobId);
    await second;
  });

  test('sends jobs by priority, then rank, then arrival; a waiting job can be re-ranked', async () => {
    const { transport, sent, answer } = fakeTransport();
    const queue = new WorkerQueue(transport);
    const running = queue.enqueue(job('running'));
    const jobs = [
      queue.enqueue(job('tile'), { priority: 150, rank: 3 }),
      queue.enqueue(job('base'), { priority: 150, rank: 3 }),
      queue.enqueue(job('read'), { priority: 100 }),
      queue.enqueue(job('write'), { priority: 200 }),
      queue.enqueue(job('focus'), { priority: 150, rank: 1 }),
    ];
    jobs[4]!.setRank(8); // the camera moved: this page is the focus now

    const order: string[] = [];
    for (let next = sent.length - 1; next < sent.length; next++) {
      const request = sent[next] as { jobId: number; docId: string };
      order.push(request.docId);
      answer(request.jobId);
    }
    await Promise.all([running, ...jobs]);
    expect(order).toEqual(['running', 'write', 'focus', 'tile', 'base', 'read']);

    // Once sent, a job's rank no longer matters.
    const sentJob = queue.enqueue(job('sent'), { priority: 150 });
    expect(() => sentJob.setRank(1)).not.toThrow();
    answer(sent[sent.length - 1]!.jobId);
    await sentJob;
  });
});
