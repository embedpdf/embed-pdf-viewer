/**
 * A search layer's paint: each line of each match on a page, as a piece to
 * draw in the page layer's pixels. An upright line is a box (a positioned
 * element with rounded corners); a turned one is its true quad (an SVG
 * polygon). The active match's lines take the active color. The plugin's hit
 * is mirrored structurally, so this package stays free of EmbedPDF imports.
 */
import { isUprightQuad, quadInPixels, svgPoints } from './page-pixels';
import type { PageQuad, PageToPixels, PixelRect } from './page-pixels';

/** A match as the search plugin lists it: the fields the paint reads. */
export interface SearchHitShape {
  /** Where the match starts in the document's text: with the line's index, its key. */
  readonly start: number;
  /** One per line the match spans, in page points. */
  readonly segments: readonly { readonly quad: PageQuad }[];
}

/** One line of a match, ready to draw. */
export interface SearchHighlightPiece<Hit extends SearchHitShape> {
  readonly key: string;
  readonly hit: Hit;
  /** Whether it's a line of the active match. */
  readonly active: boolean;
  readonly fill: string;
  /** The line's box in the page layer's pixels when it's upright; null when it's turned. */
  readonly box: PixelRect | null;
  /** The four corners as SVG `points`, for a turned line; null when it's upright. */
  readonly points: string | null;
}

/** What {@link searchHighlightsOf} paints with. */
export interface SearchHighlightOptions<Hit extends SearchHitShape> {
  /** The search's active match (compared by identity), or null. */
  readonly active: Hit | null;
  /** The page layer's transform. */
  readonly page: PageToPixels;
  /** The fill of a match, and of the active one (`paint('search-highlight', …)`). */
  readonly color: string;
  readonly activeColor: string;
}

/** Every line of `hits` as a piece to draw, in hit order. */
export function searchHighlightsOf<Hit extends SearchHitShape>(
  hits: readonly Hit[],
  options: SearchHighlightOptions<Hit>,
): SearchHighlightPiece<Hit>[] {
  const { page } = options;
  return hits.flatMap((hit) =>
    hit.segments.map(({ quad }, line): SearchHighlightPiece<Hit> => {
      const active = hit === options.active;
      const fill = active ? options.activeColor : options.color;
      const key = `${hit.start}:${line}`;
      if (!isUprightQuad(quad)) {
        return { key, hit, active, fill, box: null, points: svgPoints(quadInPixels(quad, page)) };
      }
      const topLeft = page.toPixels(quad.upperLeft);
      const bottomRight = page.toPixels(quad.lowerRight);
      const box = {
        left: topLeft.x,
        top: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      };
      return { key, hit, active, fill, box, points: null };
    }),
  );
}
