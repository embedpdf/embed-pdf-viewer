import { describe, expect, it, vi } from 'vitest';
import { createScope, isCancelled, CancelledError } from '../src/scope';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('scope', () => {
  it('disposes LIFO and awaits async teardowns in order', async () => {
    const order: string[] = [];
    const scope = createScope(() => {});
    scope.defer(() => {
      order.push('first-registered');
    });
    scope.defer(async () => {
      await tick();
      order.push('second-registered');
    });
    scope.defer(() => {
      order.push('third-registered');
    });

    await scope.dispose();
    expect(order).toEqual(['third-registered', 'second-registered', 'first-registered']);
  });

  it('a throwing teardown is reported and never strands the rest', async () => {
    const report = vi.fn();
    const ran: string[] = [];
    const scope = createScope(report);
    scope.defer(() => ran.push('a'));
    scope.defer(() => {
      throw new Error('sync boom');
    });
    scope.defer(() => Promise.reject(new Error('async boom')));
    scope.defer(() => ran.push('b'));

    await scope.dispose();
    expect(ran).toEqual(['b', 'a']);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('dispose is idempotent: every call returns the same promise', async () => {
    const teardown = vi.fn();
    const scope = createScope(() => {});
    scope.defer(teardown);

    const first = scope.dispose();
    const second = scope.dispose();
    expect(first).toBe(second);
    await first;
    expect(teardown).toHaveBeenCalledTimes(1);
    await scope.dispose(); // post-completion call: still the same settled promise
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('a disposed scope never swallows a teardown — late defer runs immediately', async () => {
    const late = vi.fn();
    const scope = createScope(() => {});
    await scope.dispose();
    expect(scope.disposed).toBe(true);

    scope.defer(late); // e.g. an in-flight init registering cleanup after close
    expect(late).not.toHaveBeenCalled(); // async, but...
    await tick();
    expect(late).toHaveBeenCalledTimes(1); // ...never dropped
  });

  it('a late defer during an in-flight disposal runs after the disposal finishes', async () => {
    const order: string[] = [];
    let releaseSlow!: () => void;
    const scope = createScope(() => {});
    scope.defer(
      () =>
        new Promise<void>((r) => {
          releaseSlow = r;
        }),
    );

    const disposal = scope.dispose();
    scope.defer(() => order.push('late'));
    order.push('registered-late');
    releaseSlow();
    await disposal;
    await tick();
    expect(order).toEqual(['registered-late', 'late']);
  });

  it('a throwing late defer is reported, not unhandled', async () => {
    const report = vi.fn();
    const scope = createScope(report);
    await scope.dispose();
    scope.defer(() => {
      throw new Error('late boom');
    });
    await tick();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe('CancelledError', () => {
  it('isCancelled distinguishes cancellation from failure', () => {
    expect(isCancelled(new CancelledError('closed while opening: a'))).toBe(true);
    expect(isCancelled(new Error('corrupt file'))).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});
