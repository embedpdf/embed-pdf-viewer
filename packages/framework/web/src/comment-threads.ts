/**
 * Comment threads with where their page is shown: the join of the annotation
 * plugin's threads and the document's page list that a comments panel
 * prints. A thread's identity stays its page's address; the index and the
 * label are presentation, following page moves and deletes.
 */

/** Where a thread's page is shown now. */
export interface CommentThreadPage {
  /** Current 0-based display index of the thread's page; `-1` when the page is no longer in the document. */
  pageIndex: number;
  /**
   * The page's `/PageLabels` label when the PDF declares one ("iv", "A-2"),
   * else the 1-based position as a string; `'?'` for a page that's gone.
   * Print it as it is.
   */
  pageLabel: string;
}

/** A page as the document's page list has it: its address, display index and label. */
export interface CommentPageLayout {
  readonly ref: { readonly objectNumber: number };
  readonly index: number;
  readonly label?: string | null;
}

/**
 * Each thread with its page's display index and label. A thread whose page
 * was just deleted reads `-1` and `'?'` for the one render before it goes.
 */
export function enrichCommentThreads<
  Thread extends { readonly page: { readonly objectNumber: number } },
>(
  threads: readonly Thread[],
  pages: readonly CommentPageLayout[],
): Array<Thread & CommentThreadPage> {
  const byPageObjectNumber = new Map(pages.map((page) => [page.ref.objectNumber, page] as const));
  return threads.map((thread) => {
    const page = byPageObjectNumber.get(thread.page.objectNumber);
    return {
      ...thread,
      pageIndex: page ? page.index : -1,
      pageLabel: page ? (page.label ?? String(page.index + 1)) : '?',
    };
  });
}
