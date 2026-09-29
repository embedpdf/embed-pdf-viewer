import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { createCapabilityToken, DocumentsToken } from '../src/index';
import { createTestContext } from '../src/testing';

/** The testing context behaves like the kernel where a controller can tell. */
describe('createTestContext', () => {
  const make = () =>
    createTestContext<number>({
      id: 'demo',
      state: 0,
      pages: [{ ref: toPageRef(7), crop: { left: 10, bottom: 20, right: 610, top: 820 } }],
    });
  const increment = (count: number) => count + 1;

  it('applies state transitions and notifies subscribers', () => {
    const ctx = make();
    let seen = 0;
    ctx.subscribe(() => (seen = ctx.state.get()));
    ctx.state.update(increment);
    expect(seen).toBe(1);
  });

  it('provides a documents registry holding the one document', () => {
    const ctx = make();
    const documents = ctx.get(DocumentsToken);
    expect(documents.getActiveId()).toBe('doc');
    expect(documents.getPageAt(0)?.ref).toEqual(toPageRef(7));
    expect(documents.listPages('elsewhere')).toEqual([]);
  });

  it('answers pages from the page list, like the kernel', () => {
    const ctx = make();
    expect(ctx.getPage(toPageRef(7))?.pdfCropBox).toEqual({
      left: 10,
      bottom: 20,
      right: 610,
      top: 820,
    });
    expect(ctx.getPage(toPageRef(8))).toBeNull();
    expect(() => ctx.assertPageRef(toPageRef(8))).toThrow(/not in this document/);
    expect(ctx.document()?.pages[0]?.size).toEqual({ width: 600, height: 800 });
  });

  it('resolves capabilities by token and runs cleanups on dispose', async () => {
    const token = createCapabilityToken<{ ping(): string }>('ping');
    const ctx = createTestContext({
      capabilities: [[token, { ping: () => 'pong' }]],
    });
    expect(ctx.get(token).ping()).toBe('pong');
    expect(ctx.tryGet(createCapabilityToken('other'))).toBeNull();
    let cleaned = false;
    ctx.cleanup(() => {
      cleaned = true;
    });
    await ctx.dispose();
    expect(cleaned).toBe(true);
  });
});
