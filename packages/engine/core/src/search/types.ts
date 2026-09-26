import type { PageRef } from '../identity/PageRef';
import type { PdfTextSegment } from '../text/layout';
import type { PageTextRange } from '../text/TextRange';

/**
 * What to search for — the one shape, engine → wire → plugin state →
 * search box. One flat object; the flags define behavior per mode instead
 * of the mode changing the shape:
 *
 * | flag              | literal          | regex                          |
 * |-------------------|------------------|--------------------------------|
 * | `matchCase`       | fold case        | `i` flag                       |
 * | `wholeWord`       | boundary check   | pattern is `\b(?:…)\b`-wrapped |
 * | `matchDiacritics` | mark fold        | rejected (`InvalidArg`)        |
 * | `ignoreWhitespace`| whitespace drop  | rejected (`InvalidArg`)        |
 *
 * Literal queries match over folded text; regex queries run the portable
 * dialect against the raw page text — which is why `matchDiacritics` and
 * `ignoreWhitespace` cannot apply to them (diacritic folding and whitespace
 * dropping are properties of the folded text plane; a pattern spells its
 * own `\s*`). Validate with `validateSearchQuery` for early UI feedback;
 * engines re-validate and reject with `EngineErrorCode.InvalidArg`.
 */
export interface SearchQuery {
  /**
   * The literal text — or, when `regex`, a pattern in the portable
   * search-regex dialect: JavaScript `u`-mode syntax minus backreferences
   * and lookaround, so every valid pattern also runs on RE2 (the
   * server-side engine).
   */
  text: string;
  /** Interpret `text` as a regex pattern. Default false (literal). */
  regex?: boolean;
  /** Exact-case matching. Default false (case-folded / `i` semantics). */
  matchCase?: boolean;
  /** Only match at word boundaries (letters/digits end the word). */
  wholeWord?: boolean;
  /**
   * Treat diacritics as significant ("café" ≠ "cafe"). Default false —
   * marks are stripped on both sides, which is what viewers ship.
   * Literal only: combined with `regex` the query is rejected.
   */
  matchDiacritics?: boolean;
  /**
   * Drop whitespace on both sides instead of collapsing it, so "invoice"
   * finds the letter-spaced "i n v o i c e" that OCR and tracked-out headings
   * produce, and "total amount" finds "totalamount". Default false — the default
   * fold collapses whitespace runs to one space, so a needle still has to
   * carry a space wherever the page does. A hit spans the original text
   * including the dropped whitespace; with `wholeWord` the boundaries are
   * checked on the original text (the folded plane has no word gaps left).
   * Literal only: combined with `regex` the query is rejected.
   */
  ignoreWhitespace?: boolean;
}

/** The query part of a request (or of any object that carries one): its text and flags, set flags only. */
export function searchQueryOf(query: SearchQuery): SearchQuery {
  return {
    text: query.text,
    ...(query.regex ? { regex: true } : {}),
    ...(query.matchCase ? { matchCase: true } : {}),
    ...(query.wholeWord ? { wholeWord: true } : {}),
    ...(query.matchDiacritics ? { matchDiacritics: true } : {}),
    ...(query.ignoreWhitespace ? { ignoreWhitespace: true } : {}),
  };
}

/**
 * How much one `query()` call may do. A call ends as soon as either limit is
 * hit (or the document is exhausted). Engines clamp both to their own
 * ceilings — the server never lets one request scan 40K pages.
 */
export interface SearchLimit {
  /** Stop after this many matches (default: engine's ceiling). */
  matches?: number;
  /** Stop after searching this many pages (default: engine's ceiling). */
  pages?: number;
}

/**
 * One `query()` call = one bounded batch of work: the query, plus how to
 * run it. Search over a large document is a client-driven cursor loop —
 * there is no server-side job to start, poll, or cancel. Cancelling is
 * simply not asking for the next batch.
 */
export interface SearchRequest extends SearchQuery {
  /**
   * Include the text around each match. A snippet is text from the
   * document, so this also needs `doc.text.copy`; without it the call is
   * refused rather than leaving the snippets out. Default false: a search
   * needs only `doc.text.search`, and nothing readable leaves the engine.
   */
  snippets?: boolean;
  /**
   * Viewport-first ordering: start searching at this page and wrap around
   * the document, so the matches the user is looking at arrive in the
   * first batch. Ignored when `cursor` is set (the cursor owns position).
   */
  from?: PageRef;
  /**
   * Resume token from the previous batch's `nextCursor`. Opaque — it pins
   * the query and position; the engine rejects a cursor replayed against a
   * different query or a changed document with `EngineErrorCode.InvalidArg`
   * (start the search again).
   */
  cursor?: string;
  limit?: SearchLimit;
}

/**
 * The text around one match, ready to render: `match` between `before` and
 * `after`, whitespace flattened to spaces.
 */
export interface SearchSnippet {
  before: string;
  match: string;
  after: string;
}

/**
 * One hit: a range of the page's characters — the space selection ranges
 * and geometry live in, not string offsets into `PageTextSnapshot.text`
 * (engines convert match string ranges through the snapshot's `charMap`
 * before building the hit; see engine-core `text/charmap.ts`). That is what
 * lets a match go straight to selection, `text.slice()` and markup
 * creation, and it means zero-width characters adjacent to the matched text
 * are never inside the range. `segments` are the canonical visual-line
 * segments (the same text layout selection uses) — a match highlights
 * exactly like a selection of the same characters, one oriented segment per
 * visual line, never per glyph.
 */
export interface SearchMatch extends PageTextRange {
  segments: PdfTextSegment[];
  snippet?: SearchSnippet;
}

/**
 * The result of one bounded batch. `nextCursor === null` means the search
 * is done — everything findable has been returned. Progress UI:
 * `pagesSearched / pageCount` (`pagesSearched` is cumulative across the
 * cursor chain, not per batch).
 */
export interface SearchSlice {
  matches: SearchMatch[];
  nextCursor: string | null;
  pagesSearched: number;
  pageCount: number;
}
