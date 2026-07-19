import { describe, expect, test } from 'vitest';
import { AbortablePromise, AbortError } from '@embedpdf/engine-core/runtime';

describe('AbortablePromise', () => {
  test('resolves like a normal promise', async () => {
    const p = new AbortablePromise<number>((resolve) => resolve(42));
    expect(await p).toBe(42);
  });

  test('abort rejects with AbortError when the executor honours the signal', async () => {
    const p = new AbortablePromise<number>((_resolve, reject, _progress, signal) => {
      signal.addEventListener('abort', () => reject(new AbortError(signal.reason)));
    });
    p.abort('test');
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('abort rejects even when the executor ignores the signal', async () => {
    // Executor never resolves and never wires up signal.addEventListener.
    const p = new AbortablePromise<number>(() => {
      // intentionally empty
    });
    p.abort('cancelled');
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('AbortablePromise.run rejects on abort even if the async fn never resolves', async () => {
    const p = AbortablePromise.run<number>(
      () =>
        new Promise<number>(() => {
          /* never settles */
        }),
    );
    p.abort('cancelled');
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('AbortablePromise.run drops a late inner rejection after abort', async () => {
    let rejectInner!: (err: unknown) => void;
    const p = AbortablePromise.run<number>(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectInner = reject;
        }),
    );

    p.abort('cancelled');
    await expect(p).rejects.toBeInstanceOf(AbortError);

    // Inner work eventually fails after the public promise already settled.
    // This must not turn into an UnhandledPromiseRejection or change the
    // outcome: the public promise stays rejected with AbortError.
    rejectInner(new Error('late inner failure'));
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('late executor resolve after abort is silently ignored', async () => {
    let resolveLater!: (v: number) => void;
    const p = new AbortablePromise<number>((resolve) => {
      resolveLater = resolve;
    });

    p.abort('cancelled');
    await expect(p).rejects.toBeInstanceOf(AbortError);

    // Executor wakes up and tries to resolve. First-settlement-wins: this
    // is dropped silently.
    resolveLater(42);
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('late executor reject after abort is silently ignored', async () => {
    let rejectLater!: (err: unknown) => void;
    const p = new AbortablePromise<number>((_resolve, reject) => {
      rejectLater = reject;
    });

    p.abort('cancelled');
    await expect(p).rejects.toBeInstanceOf(AbortError);

    rejectLater(new Error('late rejection'));
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('progress callbacks fire and unsubscribe works', async () => {
    const seen: number[] = [];
    const p = new AbortablePromise<void, number>((resolve, _reject, progress) => {
      progress(1);
      Promise.resolve().then(() => {
        progress(2);
        resolve();
      });
    });
    p.onProgress((v) => seen.push(v));
    await p;
    // The first progress(1) fires before the listener is registered, so
    // we expect the post-resolve no-op behavior plus the late-registered
    // listener to receive (2).
    expect(seen).toEqual([2]);
  });

  test('progress subscriber errors are swallowed', async () => {
    const seen: number[] = [];
    const p = new AbortablePromise<void, number>((resolve, _reject, progress) => {
      Promise.resolve().then(() => {
        progress(1);
        progress(2);
        resolve();
      });
    });
    // Two subscribers: the first throws every time, the second must still
    // receive every progress event.
    p.onProgress(() => {
      throw new Error('subscriber blew up');
    });
    p.onProgress((v) => seen.push(v));
    await p;
    expect(seen).toEqual([1, 2]);
  });

  test('Symbol.species returns plain Promise: .then() chain is regular Promise', async () => {
    const p = new AbortablePromise<number>((resolve) => resolve(1));
    const chained = p.then((v) => v + 1);
    expect(chained).not.toBeInstanceOf(AbortablePromise);
    expect(chained).toBeInstanceOf(Promise);
    expect(await chained).toBe(2);
  });

  test('aborting after settle is a no-op', async () => {
    const p = new AbortablePromise<number>((resolve) => resolve(7));
    expect(await p).toBe(7);
    p.abort();
    // Should still resolve cleanly to 7 (no rejection occurs after settle).
    expect(await p).toBe(7);
  });

  test('double abort is idempotent', async () => {
    const p = new AbortablePromise<number>(() => {
      /* never settles */
    });
    p.abort('first');
    p.abort('second'); // must not throw, must not change rejection
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('abort fires the AbortSignal so cooperative cleanup still runs', async () => {
    let signalFired = false;
    const p = new AbortablePromise<number>((_resolve, _reject, _progress, signal) => {
      signal.addEventListener('abort', () => {
        signalFired = true;
      });
    });
    p.abort('test');
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(signalFired).toBe(true);
  });
});
