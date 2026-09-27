/**
 * The queue's abort contract: a job aborted while it waits never reaches the
 * worker; a job aborted after it was sent rejects at once, the worker is told
 * to stop it, and its slot stays taken until the worker answers.
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
});
