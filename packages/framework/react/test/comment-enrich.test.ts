import { describe, expect, it } from 'vitest';
import type { CommentThread } from '@embedpdf/plugin-annotation';
import { enrichCommentThreads } from '../src/annotation';
import { toPageRef, type PageLayout } from '../src/runtime';

/** The join is presentation-only: identity stays the page address; pageIndex/pageLabel
 *  come from the current layout and must track moves/deletes. */

const thread = (pageObjectNumber: number): CommentThread =>
  ({
    page: toPageRef(pageObjectNumber),
    root: { rect: { x: 100, y: 80, width: 20, height: 20 } },
  }) as unknown as CommentThread;

const page = (pageObjectNumber: number, index: number, label: string | null = null): PageLayout =>
  ({
    ref: toPageRef(pageObjectNumber),
    index,
    label,
  }) as unknown as PageLayout;

describe('enrichCommentThreads', () => {
  it('joins pageIndex + pageLabel from the live layout, falling back to 1-based position', () => {
    const out = enrichCommentThreads(
      [thread(30), thread(10)],
      [page(10, 0, 'iv'), page(30, 1, null)],
    );
    expect(out.map((view) => view.pageIndex)).toEqual([1, 0]);
    expect(out.map((view) => view.pageLabel)).toEqual(['2', 'iv']);
  });

  it('a page move re-labels without touching thread identity', () => {
    const before = enrichCommentThreads([thread(10)], [page(10, 0), page(30, 1)]);
    const after = enrichCommentThreads([thread(10)], [page(30, 0), page(10, 1)]);
    expect(before[0]!.pageIndex).toBe(0);
    expect(after[0]!.pageIndex).toBe(1);
    expect(after[0]!.page.objectNumber).toBe(10);
  });

  it('a thread on a deleted page renders as -1/"?" instead of throwing', () => {
    const out = enrichCommentThreads([thread(99)], [page(10, 0)]);
    expect(out[0]!.pageIndex).toBe(-1);
    expect(out[0]!.pageLabel).toBe('?');
  });
});
