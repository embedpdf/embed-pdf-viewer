import { describe, expect, it, vi } from 'vitest';

import { createEventHook, createSerialQueue } from '../src';

describe('createEventHook', () => {
  it('fans out synchronously in subscription order', () => {
    const hook = createEventHook<number>();
    const seen: string[] = [];
    hook.on((n) => seen.push(`a${n}`));
    hook.on((n) => seen.push(`b${n}`));
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
    const enqueue = createSerialQueue();
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
    const enqueue = createSerialQueue();
    await expect(enqueue(async () => Promise.reject(new Error('nope')))).rejects.toThrow('nope');
    await expect(enqueue(async () => 'ok')).resolves.toBe('ok');
  });
});
