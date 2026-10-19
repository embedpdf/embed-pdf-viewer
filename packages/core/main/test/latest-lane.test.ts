import { describe, expect, it, vi } from 'vitest';
import { createLatestLane } from '../src/lanes';
import { isPluginError } from '../src/errors';

/** A superseded run cannot publish, in every settle order. */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (event: unknown) => void;
  const promise = new Promise<T>((result, rej) => {
    resolve = result;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLatestLane', () => {
  it('newest wins: the older run cannot commit and rejects operation-cancelled', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const requestA = deferred<string>();
    const requestB = deferred<string>();
    const published: string[] = [];

    const runA = lane.run(async (run) => {
      const value = await requestA.promise;
      run.commit(() => published.push(value));
      return value;
    });
    const runB = lane.run(async (run) => {
      const value = await requestB.promise;
      run.commit(() => published.push(value));
      return value;
    });

    // A settles after B started, in both orders
    requestA.resolve('A');
    await expect(runA).rejects.toSatisfy((error) => isPluginError(error, 'operation-cancelled'));
    requestB.resolve('B');
    await expect(runB).resolves.toBe('B');
    expect(published).toEqual(['B']);
  });

  it('a superseded run whose promise rejects still reports cancellation, not failure', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const requestA = deferred<string>();
    const runA = lane.run(async () => requestA.promise);
    void lane.run(async () => 'B');
    requestA.reject(new Error('network'));
    await expect(runA).rejects.toSatisfy((error) => isPluginError(error, 'operation-cancelled'));
  });

  it('aborts the older run’s signal and exposes superseded', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const seen = { aborted: false, superseded: false };
    const gate = deferred<void>();
    const runA = lane.run(async (run) => {
      await gate.promise;
      seen.aborted = run.signal.aborted;
      seen.superseded = run.superseded;
      return 'A';
    });
    const runB = lane.run(async () => 'B');
    gate.resolve();
    await runA.catch(() => {});
    await runB;
    expect(seen).toEqual({ aborted: true, superseded: true });
  });

  it('a pre-aborted caller starts no work and does not cancel the running one', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const fn = vi.fn(async () => 'x');
    const running = lane.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'running';
    });
    const caller = new AbortController();
    caller.abort();
    await expect(lane.run(fn, { signal: caller.signal })).rejects.toSatisfy((error) =>
      isPluginError(error, 'operation-cancelled'),
    );
    expect(fn).not.toHaveBeenCalled();
    await expect(running).resolves.toBe('running');
  });

  it('closing the instance rejects the current run with instance-closed', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const gate = deferred<string>();
    const run = lane.run(async () => gate.promise);
    lifetime.abort();
    gate.resolve('late');
    await expect(run).rejects.toSatisfy((error) => isPluginError(error, 'instance-closed'));
    await expect(lane.run(async () => 'x')).rejects.toSatisfy((error) =>
      isPluginError(error, 'instance-closed'),
    );
  });

  it('maps a genuine failure through toPluginError', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    await expect(
      lane.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'operation-failed'));
  });
});
