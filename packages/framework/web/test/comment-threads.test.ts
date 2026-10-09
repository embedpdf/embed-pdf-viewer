import { describe, expect, it } from 'vitest';

import { enrichCommentThreads } from '../src/comment-threads';

/** The join is presentation only: identity stays the page address; the index and the label follow the live page list. */

const thread = (pageObjectNumber: number) => ({
  page: { objectNumber: pageObjectNumber },
  id: `t${pageObjectNumber}`,
});

const page = (pageObjectNumber: number, index: number, label: string | null = null) => ({
  ref: { objectNumber: pageObjectNumber },
  index,
  label,
});

describe('enrichCommentThreads', () => {
  it('joins the page index and label from the page list, falling back to the 1-based position', () => {
    const out = enrichCommentThreads([thread(30), thread(10)], [page(10, 0, 'iv'), page(30, 1)]);
    expect(out.map((view) => view.pageIndex)).toEqual([1, 0]);
    expect(out.map((view) => view.pageLabel)).toEqual(['2', 'iv']);
    expect(out[0]!.id).toBe('t30');
  });

  it('a page move relabels without touching the thread’s identity', () => {
    const before = enrichCommentThreads([thread(10)], [page(10, 0), page(30, 1)]);
    const after = enrichCommentThreads([thread(10)], [page(30, 0), page(10, 1)]);
    expect(before[0]!.pageIndex).toBe(0);
    expect(after[0]!.pageIndex).toBe(1);
    expect(after[0]!.page.objectNumber).toBe(10);
  });

  it('reads a thread on a deleted page as -1 and "?" instead of throwing', () => {
    const out = enrichCommentThreads([thread(99)], [page(10, 0)]);
    expect(out[0]!.pageIndex).toBe(-1);
    expect(out[0]!.pageLabel).toBe('?');
  });
});
