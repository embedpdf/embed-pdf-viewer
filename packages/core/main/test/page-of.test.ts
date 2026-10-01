import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import { createTestContext } from '../src/testing';
import type { AnyPlugin, PluginContext } from '../src/types';
import { bytesInput, immediateEngine, makeHandle, page } from './helpers';

/**
 * A page argument, a ref or an index, looked up two ways: `ctx.getPage` for
 * reads, which answer null for a page that isn't there, and `ctx.pageOf` for
 * verbs, which refuse it.
 */

async function contextWithPages() {
  let captured: PluginContext<unknown> | null = null;
  const plugin: AnyPlugin = {
    id: 'probe',
    scope: 'document',
    token: createCapabilityToken<unknown>('probe'),
    create: (ctx: PluginContext<unknown>) => {
      captured = ctx;
      return { api: {} };
    },
  };
  const handle = makeHandle('d', [page(7, 0), page(9, 1)]);
  const kernel = createKernel({ engine: immediateEngine({ d: handle }), plugins: [plugin] });
  await kernel.start();
  await kernel.documents.open(bytesInput('d'));
  return { kernel, ctx: captured! as PluginContext<unknown> };
}

describe('ctx.getPage', () => {
  it('finds a page by its ref or its index', async () => {
    const { kernel, ctx } = await contextWithPages();
    expect(ctx.getPage(toPageRef(9))).toMatchObject({ index: 1, ref: toPageRef(9) });
    expect(ctx.getPage(0)).toMatchObject({ index: 0, ref: toPageRef(7) });
    expect(ctx.getPage(1)).toBe(ctx.pageOf(toPageRef(9)));
    await kernel.destroy();
  });

  it('answers null for a page the document does not have, where a verb would refuse', async () => {
    const { kernel, ctx } = await contextWithPages();
    expect(ctx.getPage(toPageRef(99))).toBeNull();
    expect(ctx.getPage(2)).toBeNull();
    expect(ctx.getPage(-1)).toBeNull();
    expect(ctx.getPage(0.5)).toBeNull();
    await kernel.destroy();
  });

  it('the test context finds pages the same way', () => {
    const ctx = createTestContext({ pages: [{ ref: toPageRef(7) }, { ref: toPageRef(9) }] });
    expect(ctx.getPage(1)?.ref).toEqual(toPageRef(9));
    expect(ctx.getPage(toPageRef(7))?.index).toBe(0);
    expect(ctx.getPage(5)).toBeNull();
    expect(ctx.getPage(toPageRef(99))).toBeNull();
  });
});

describe('ctx.pageOf', () => {
  it('resolves a ref to its page', async () => {
    const { kernel, ctx } = await contextWithPages();
    expect(ctx.pageOf(toPageRef(9))).toMatchObject({ index: 1, ref: toPageRef(9) });
    await kernel.destroy();
  });

  it('resolves an index through the document’s page list', async () => {
    const { kernel, ctx } = await contextWithPages();
    expect(ctx.pageOf(0)).toMatchObject({ index: 0, ref: toPageRef(7) });
    expect(ctx.pageOf(1)).toBe(ctx.pageOf(toPageRef(9)));
    await kernel.destroy();
  });

  it('throws not-found for a page the document does not have', async () => {
    const { kernel, ctx } = await contextWithPages();
    const notFound = expect.objectContaining({ code: 'not-found', capability: 'probe' });
    expect(() => ctx.pageOf(toPageRef(99))).toThrow(notFound);
    expect(() => ctx.pageOf(2)).toThrow(notFound);
    expect(() => ctx.pageOf(-1)).toThrow(notFound);
    expect(() => ctx.pageOf(0.5)).toThrow(notFound);
    await kernel.destroy();
  });

  it('the test context resolves the same way', () => {
    const ctx = createTestContext({ pages: [{ ref: toPageRef(7) }, { ref: toPageRef(9) }] });
    expect(ctx.pageOf(1).ref).toEqual(toPageRef(9));
    expect(ctx.pageOf(toPageRef(7)).index).toBe(0);
    expect(() => ctx.pageOf(5)).toThrow(expect.objectContaining({ code: 'not-found' }));
  });
});
