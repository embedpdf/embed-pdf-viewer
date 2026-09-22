import { describe, expect, it } from 'vitest';
import { createKernel } from '../src/kernel';
import { bytesInput, immediateEngine, makeHandle, page } from './helpers';

/** The kernel is the source of page identity — refs, indexes, and the registry revision. */
describe('documents · page registry', () => {
  it('lists pages, resolves by ref and by index, and reports the revision', async () => {
    const pages = [page(11, 0), page(12, 1), page(13, 2)];
    const kernel = createKernel({
      engine: immediateEngine({ d: makeHandle('d', pages) }),
      plugins: [],
    });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const { documents } = kernel;

    expect(documents.listPages('d')).toBe(documents.listPages()); // active by default, same reference
    expect(documents.listPages().map((pageInfo) => pageInfo.ref.pageObjectNumber)).toEqual([
      11, 12, 13,
    ]);
    expect(documents.getPage({ kind: 'objectNumber', pageObjectNumber: 12 })?.index).toBe(1);
    expect(documents.getPage({ kind: 'objectNumber', pageObjectNumber: 99 })).toBeNull();
    expect(documents.getPageAt(2)?.ref.pageObjectNumber).toBe(13);
    expect(documents.getPageAt(3)).toBeNull();
    expect(documents.getPageIndex({ kind: 'objectNumber', pageObjectNumber: 13 })).toBe(2);
    expect(documents.getPageIndex({ kind: 'objectNumber', pageObjectNumber: 99 })).toBe(-1);
    expect(documents.getRevision()).toBe(0);
    expect(documents.listPages('missing')).toEqual([]);
    await kernel.destroy();
  });
});
