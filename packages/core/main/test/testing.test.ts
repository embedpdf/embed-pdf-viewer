import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { createCapabilityToken } from '../src/index';
import { createTestContext } from '../src/testing';

/** The testing context behaves like the kernel where a controller can tell. */
describe('createTestContext', () => {
  type Action = { type: 'inc' };
  const make = () =>
    createTestContext<number, Action>({
      id: 'demo',
      initialState: 0,
      reduce: (n) => n + 1,
      pages: [{ ref: toPageRef(7), crop: { left: 10, bottom: 20, right: 610, top: 820 } }],
    });

  it('dispatches through the reducer and notifies subscribers', () => {
    const ctx = make();
    let seen = 0;
    ctx.subscribe(() => (seen = ctx.getState()));
    ctx.dispatch({ type: 'inc' });
    expect(seen).toBe(1);
  });

  it('answers page geometry from the page list, like the kernel', () => {
    const ctx = make();
    const space = ctx.geometry.forPage(toPageRef(7));
    expect(space.pdfToPage({ x: 10, y: 820 })).toEqual({ x: 0, y: 0 });
    expect(ctx.geometry.tryForPage(toPageRef(8))).toBeNull();
    expect(() => ctx.geometry.forPage(toPageRef(8))).toThrow(/not in this document/);
    expect(ctx.document()?.pages[0]?.size).toEqual({ width: 600, height: 800 });
  });

  it('resolves capabilities by token and runs cleanups on dispose', async () => {
    const token = createCapabilityToken<{ ping(): string }>('ping');
    const ctx = createTestContext({
      initialState: null,
      capabilities: [[token, { ping: () => 'pong' }]],
    });
    expect(ctx.get(token).ping()).toBe('pong');
    expect(ctx.tryGet(createCapabilityToken('other'))).toBeNull();
    let cleaned = false;
    ctx.cleanup(() => (cleaned = true));
    await ctx.dispose();
    expect(cleaned).toBe(true);
  });
});
