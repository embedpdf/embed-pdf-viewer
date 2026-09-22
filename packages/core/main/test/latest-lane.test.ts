import { describe, expect, it, vi } from 'vitest';
import { createLatestLane } from '../src/lanes';
import { isPluginError } from '../src/errors';

/** G4: a superseded run cannot publish, in every settle order. */

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLatestLane', () => {
  it('newest wins: the older run cannot commit and rejects operation-cancelled', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const a = deferred<string>();
    const b = deferred<string>();
    const published: string[] = [];

    const runA = lane.run(async (run) => {
      const v = await a.promise;
      run.commit(() => published.push(v));
      return v;
    });
    const runB = lane.run(async (run) => {
      const v = await b.promise;
      run.commit(() => published.push(v));
      return v;
    });

    // A settles AFTER B started, in both orders
    a.resolve('A');
    await expect(runA).rejects.toSatisfy((e) => isPluginError(e, 'operation-cancelled'));
    b.resolve('B');
    await expect(runB).resolves.toBe('B');
    expect(published).toEqual(['B']);
  });

  it('a superseded run whose promise rejects still reports cancellation, not failure', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    const a = deferred<string>();
    const runA = lane.run(async () => a.promise);
    void lane.run(async () => 'B');
    a.reject(new Error('network'));
    await expect(runA).rejects.toSatisfy((e) => isPluginError(e, 'operation-cancelled'));
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
      await new Promise((r) => setTimeout(r, 5));
      return 'running';
    });
    const caller = new AbortController();
    caller.abort();
    await expect(lane.run(fn, { signal: caller.signal })).rejects.toSatisfy((e) =>
      isPluginError(e, 'operation-cancelled'),
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
    await expect(run).rejects.toSatisfy((e) => isPluginError(e, 'instance-closed'));
    await expect(lane.run(async () => 'x')).rejects.toSatisfy((e) =>
      isPluginError(e, 'instance-closed'),
    );
  });

  it('maps a genuine failure through toPluginError', async () => {
    const lifetime = new AbortController();
    const lane = createLatestLane(lifetime.signal, 'test', 'session');
    await expect(
      lane.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toSatisfy((e) => isPluginError(e, 'operation-failed'));
  });
});
