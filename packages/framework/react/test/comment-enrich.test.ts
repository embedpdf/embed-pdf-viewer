import { describe, expect, it } from 'vitest';
import type { CommentThread } from '@embedpdf/plugin-annotation';
import { enrichCommentThreads } from '../src/annotation';
import type { PageLayout } from '../src/runtime';

/** The join is presentation-only: identity stays PON; pageIndex/pageLabel
 *  come from the CURRENT layout and must track moves/deletes. */

const CROP = { left: 0, bottom: 0, right: 600, top: 800 };

/** Root rect in PDF space (y-up, crop-relative): a 20pt box near the top. */
const thread = (pon: number): CommentThread =>
  ({
    pageObjectNumber: pon,
    root: { rect: { left: 100, bottom: 700, right: 120, top: 720 } },
  }) as unknown as CommentThread;

const page = (pon: number, index: number, label: string | null = null): PageLayout =>
  ({ pageObjectNumber: pon, index, label, boxes: { crop: CROP } }) as unknown as PageLayout;

describe('enrichCommentThreads', () => {
  it('joins pageIndex + pageLabel from the live layout, falling back to 1-based position', () => {
    const out = enrichCommentThreads(
      [thread(30), thread(10)],
      [page(10, 0, 'iv'), page(30, 1, null)],
    );
    expect(out.map((v) => v.pageIndex)).toEqual([1, 0]);
    expect(out.map((v) => v.pageLabel)).toEqual(['2', 'iv']);
  });

  it('a page move re-labels without touching thread identity', () => {
    const before = enrichCommentThreads([thread(10)], [page(10, 0), page(30, 1)]);
    const after = enrichCommentThreads([thread(10)], [page(30, 0), page(10, 1)]);
    expect(before[0]!.pageIndex).toBe(0);
    expect(after[0]!.pageIndex).toBe(1);
    expect(after[0]!.pageObjectNumber).toBe(10);
  });

  it('a thread on a deleted page renders as -1/"?" instead of throwing', () => {
    const out = enrichCommentThreads([thread(99)], [page(10, 0)]);
    expect(out[0]!.pageIndex).toBe(-1);
    expect(out[0]!.pageLabel).toBe('?');
    expect(out[0]!.contentRect).toBe(null);
  });

  it('contentRect converts the root rect into reveal space (y-down, crop-relative)', () => {
    const out = enrichCommentThreads([thread(10)], [page(10, 0)]);
    // PDF y-up top=720 within an 800pt-tall crop → content y = 800 - 720 = 80.
    expect(out[0]!.contentRect).toEqual({ x: 100, y: 80, width: 20, height: 20 });
  });
});
