import { describe, expect, it, vi } from 'vitest';

import { createEventHook, createSerialQueue } from '../src';

describe('createEventHook', () => {
  it('fans out synchronously in subscription order', () => {
    const hook = createEventHook<number>();
    const seen: string[] = [];
    hook.on((value) => seen.push(`a${value}`));
    hook.on((value) => seen.push(`b${value}`));
    hook.emit(1);
    expect(seen).toEqual(['a1', 'b1']);
  });

  it('unsubscribe removes exactly one listener', () => {
    const hook = createEventHook<void>();
    const listener = vi.fn();
    const off = hook.on(listener);
    hook.emit();
    off();
    hook.emit();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits over a snapshot: listeners added or removed mid-emit do not affect that emit', () => {
    const hook = createEventHook<void>();
    const late = vi.fn();
    const early = vi.fn(() => {
      hook.on(late); // added during emit → not called this round
      offSelf(); // removed during emit → still received this round
    });
    const offSelf = hook.on(early);
    const sibling = vi.fn();
    hook.on(sibling);
    hook.emit();
    expect(early).toHaveBeenCalledTimes(1);
    expect(sibling).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    hook.emit();
    expect(early).toHaveBeenCalledTimes(1); // unsubscribed
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener and reports it', () => {
    const errors: unknown[] = [];
    const hook = createEventHook<void>((error) => errors.push(error));
    hook.on(() => {
      throw new Error('boom');
    });
    const sibling = vi.fn();
    hook.on(sibling);
    expect(() => hook.emit()).not.toThrow();
    expect(sibling).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });

  it('is inert after dispose: subscribing never throws, emitting is a no-op', () => {
    const hook = createEventHook<void>();
    const listener = vi.fn();
    hook.on(listener);
    hook.dispose();
    expect(() => hook.emit()).not.toThrow();
    const off = hook.on(listener);
    expect(() => off()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createSerialQueue', () => {
  it('runs operations one at a time in submission order', async () => {
    const enqueue = createSerialQueue('test');
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = enqueue(async () => {
      order.push('first-start');
      await gate;
      order.push('first-end');
    });
    const second = enqueue(async () => {
      order.push('second');
    });
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('a failed operation never poisons later ones', async () => {
    const enqueue = createSerialQueue('test');
    await expect(enqueue(async () => Promise.reject(new Error('nope')))).rejects.toThrow('nope');
    await expect(enqueue(async () => 'ok')).resolves.toBe('ok');
  });

  it('skips an operation whose signal fired while it waited, and runs the next one', async () => {
    const enqueue = createSerialQueue('test');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ran: string[] = [];
    const first = enqueue(async () => {
      await gate;
      ran.push('first');
    });
    const controller = new AbortController();
    const skipped = vi.fn(async () => {
      ran.push('skipped');
    });
    const second = enqueue(skipped, { signal: controller.signal });
    const third = enqueue(async () => {
      ran.push('third');
    });
    controller.abort();
    release();
    await first;
    await expect(second).rejects.toMatchObject({
      code: 'operation-cancelled',
      capability: 'test',
    });
    await third;
    expect(skipped).not.toHaveBeenCalled();
    expect(ran).toEqual(['first', 'third']);
  });

  it('an operation that started runs on when its signal fires', async () => {
    const enqueue = createSerialQueue('test');
    const controller = new AbortController();
    const running = enqueue(
      async () => {
        controller.abort();
        return 'done';
      },
      { signal: controller.signal },
    );
    await expect(running).resolves.toBe('done');
  });
});

describe('createEventHook · signal option', () => {
  it('removes the listener when the signal aborts, and never registers a pre-aborted one', () => {
    const hook = createEventHook<number>();
    const controller = new AbortController();
    const listener = vi.fn();
    hook.on(listener, { signal: controller.signal });
    hook.emit(1);
    controller.abort();
    hook.emit(2);
    expect(listener).toHaveBeenCalledTimes(1);

    const dead = vi.fn();
    hook.on(dead, { signal: controller.signal });
    hook.emit(3);
    expect(dead).not.toHaveBeenCalled();
  });
});
