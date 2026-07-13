import { PdfActionType, PdfBookmarkObject, PdfZoomMode } from '@embedpdf/models';
import { getActiveBookmarkPath, resolveBookmarkPageIndex } from './active-bookmark';

// A bookmark with a direct destination target.
const dest = (
  title: string,
  pageIndex: number,
  children?: PdfBookmarkObject[],
): PdfBookmarkObject => ({
  title,
  target: {
    type: 'destination',
    destination: { pageIndex, zoom: { mode: PdfZoomMode.Unknown } },
  },
  children,
});

// A header bookmark with no target (e.g. a "Part" grouping node).
const header = (title: string, children?: PdfBookmarkObject[]): PdfBookmarkObject => ({
  title,
  children,
});

// A bookmark whose target is a URI action (no page).
const uri = (title: string, url: string): PdfBookmarkObject => ({
  title,
  target: { type: 'action', action: { type: PdfActionType.URI, uri: url } },
});

describe('resolveBookmarkPageIndex', () => {
  test('reads a direct destination target', () => {
    expect(resolveBookmarkPageIndex(dest('A', 4))).toBe(4);
  });

  test('reads a Goto action destination', () => {
    const bm: PdfBookmarkObject = {
      title: 'A',
      target: {
        type: 'action',
        action: {
          type: PdfActionType.Goto,
          destination: { pageIndex: 7, zoom: { mode: PdfZoomMode.Unknown } },
        },
      },
    };
    expect(resolveBookmarkPageIndex(bm)).toBe(7);
  });

  test('returns undefined for URI actions', () => {
    expect(resolveBookmarkPageIndex(uri('Docs', 'https://example.com'))).toBeUndefined();
  });

  test('returns undefined for a header without a target', () => {
    expect(resolveBookmarkPageIndex(header('Part'))).toBeUndefined();
  });
});

describe('getActiveBookmarkPath', () => {
  const tree: PdfBookmarkObject[] = [
    dest('Chapter 1', 0, [dest('Section 1.1', 2), dest('Section 1.2', 5)]),
    dest('Chapter 2', 10),
  ];

  test('returns null when the page precedes the first bookmark', () => {
    expect(getActiveBookmarkPath([dest('Intro', 3)], 1)).toBeNull();
  });

  test('selects the top-level entry on its own page', () => {
    expect(getActiveBookmarkPath(tree, 0)).toEqual([0]);
  });

  test('selects the deepest heading at or before the page', () => {
    expect(getActiveBookmarkPath(tree, 2)).toEqual([0, 0]);
    expect(getActiveBookmarkPath(tree, 4)).toEqual([0, 0]);
    expect(getActiveBookmarkPath(tree, 6)).toEqual([0, 1]);
  });

  test('selects a later top-level entry once its page is reached', () => {
    expect(getActiveBookmarkPath(tree, 10)).toEqual([1]);
    expect(getActiveBookmarkPath(tree, 12)).toEqual([1]);
  });

  test('on a tie, the later entry in document order wins', () => {
    expect(getActiveBookmarkPath([dest('A', 3), dest('B', 3)], 3)).toEqual([1]);
  });

  test('skips target-less headers but selects their targeted children', () => {
    const t = [header('Part I', [dest('Chapter 1', 0)])];
    expect(getActiveBookmarkPath(t, 1)).toEqual([0, 0]);
  });

  test('ignores URI bookmarks when choosing the active entry', () => {
    const t = [dest('Home', 0), uri('External', 'https://example.com'), dest('End', 8)];
    expect(getActiveBookmarkPath(t, 4)).toEqual([0]);
  });
});
