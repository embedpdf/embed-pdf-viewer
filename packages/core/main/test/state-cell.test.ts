import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { createCapabilityToken, definePlugin } from '../src/index';
import { isPluginError } from '../src/errors';
import { bytesInput, immediateEngine } from './helpers';

/**
 * `ctx.state`, `ctx.notify` and `ctx.watch` through a real kernel: pure
 * transitions, identity no-ops, change hooks that run after the store's
 * subscribers, and the lease that stops a closed instance from writing.
 */

interface Counter {
  readonly count: number;
}
interface CounterApi {
  increment(by?: number): void;
  keep(): void;
  read(): number;
  ping(): void;
  changes(): readonly string[];
}
const token = createCapabilityToken<CounterApi>('counter');

const increment = (state: Counter, by: number): Counter => ({ count: state.count + by });
const keep = (state: Counter): Counter => state;

const counterPlugin = () =>
  definePlugin<Counter, CounterApi>({
    id: 'counter',
    scope: 'document',
    token,
    state: () => ({ count: 0 }),
    create: (ctx) => {
      const changes: string[] = [];
      ctx.state.onChange(({ previous, next }) => changes.push(`${previous.count}->${next.count}`));
      return {
        api: {
          increment: (by = 1) => ctx.state.update(increment, by),
          keep: () => ctx.state.update(keep),
          read: () => ctx.state.get().count,
          ping: () => ctx.notify(),
          changes: () => changes,
        },
      };
    },
  });

async function openCounter(report = vi.fn()) {
  const kernel = createKernel({ engine: immediateEngine(), plugins: [counterPlugin()], report });
  await kernel.start();
  await kernel.documents.open(bytesInput('doc-1'));
  return { kernel, counter: kernel.capability(token, 'doc-1'), report };
}

describe('ctx.state', () => {
  it('applies pure transitions and reports each change once', async () => {
    const { counter } = await openCounter();
    counter.increment();
    counter.increment(2);
    expect(counter.read()).toBe(3);
    expect(counter.changes()).toEqual(['0->1', '1->3']);
  });

  it('treats a transition that returns the same state as a no-op', async () => {
    const { kernel, counter } = await openCounter();
    const listener = vi.fn();
    kernel.subscribe(listener);
    counter.keep();
    expect(listener).not.toHaveBeenCalled();
    expect(counter.changes()).toEqual([]);
  });

  it('runs onChange after the store subscribers saw the new state', async () => {
    const { kernel, counter } = await openCounter();
    const order: string[] = [];
    kernel.subscribe(() => order.push(`store:${counter.read()}`));
    const changesBefore = counter.changes().length;
    counter.increment();
    order.push(`hook:${counter.changes().length - changesBefore}`);
    expect(order).toEqual(['store:1', 'hook:1']);
  });

  it('drops writes from a closed instance and reports it once', async () => {
    const { kernel, counter, report } = await openCounter();
    counter.increment();
    await kernel.documents.close('doc-1');
    counter.increment();
    counter.increment();
    expect(counter.read()).toBe(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(isPluginError(report.mock.calls[0][0], 'instance-closed')).toBe(true);
  });
});

describe('ctx.notify', () => {
  it('wakes subscribers without a state change, and stops after close', async () => {
    const { kernel, counter } = await openCounter();
    const listener = vi.fn();
    kernel.subscribe(listener);
    counter.ping();
    expect(listener).toHaveBeenCalledTimes(1);
    await kernel.documents.close('doc-1');
    listener.mockClear();
    counter.ping();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ctx.watch', () => {
  it('calls the handler only when the selected value changes', async () => {
    const seen: [number, number][] = [];
    const watcher = definePlugin<void, { poke(): void }>({
      id: 'watcher',
      scope: 'document',
      token: createCapabilityToken<{ poke(): void }>('watcher'),
      requires: [token],
      create: (ctx) => ({
        api: { poke: () => ctx.notify() },
        connect() {
          const counter = ctx.get(token);
          ctx.watch(
            () => counter.read(),
            (next, previous) => seen.push([previous, next]),
          );
        },
      }),
    });
    const kernel = createKernel({ engine: immediateEngine(), plugins: [counterPlugin(), watcher] });
    await kernel.start();
    await kernel.documents.open(bytesInput('doc-1'));
    const counter = kernel.capability(token, 'doc-1');
    kernel.capability(watcher.token!, 'doc-1').poke();
    counter.increment();
    counter.increment();
    expect(seen).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});
