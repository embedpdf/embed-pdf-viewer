import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import type { AbortablePromise } from '../promise/AbortablePromise';
import type { TextLayout } from '../text/layout';
import type { TextRange } from '../text/TextRange';

/**
 * Per-page text service exposed via `PageHandle.text`. Text changes only
 * with the page's content, so none of these carry annotation state
 * (`PageState`).
 */
export interface PageTextService {
  /**
   * The page's text in reading order, its character count and, when the two
   * numberings differ, the character↔text map. Needs `doc.text.copy`.
   */
  get(): AbortablePromise<PageTextSnapshot>;
  /** The text of a character range: the copy primitive. Needs `doc.text.copy`. */
  slice(range: TextRange): AbortablePromise<string>;
  /**
   * Where the page's characters are: hit-testing, words and lines, and the
   * segments to draw a selection or a highlight. Needs `doc.text.select`
   * (where text is, not what it says).
   */
  layout(): AbortablePromise<TextLayout>;
}
