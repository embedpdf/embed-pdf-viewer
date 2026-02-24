import { Rect, PdfTextRun, PdfPageTextRuns } from '@embedpdf/models';
import { LayoutBlock, PageLayout } from './types';

/**
 * A layout block enriched with the text runs that spatially overlap it.
 */
export interface EnrichedLayoutBlock extends LayoutBlock {
  textRuns: PdfTextRun[];
}

/**
 * Merge text runs with layout blocks based on spatial overlap.
 *
 * For each block, collects all text runs whose bounding rect intersects
 * the block's rect. Both are in PDF page coordinates (points).
 */
export function mergeTextRunsWithLayout(
  layout: PageLayout,
  textRuns: PdfPageTextRuns,
): EnrichedLayoutBlock[] {
  return layout.blocks.map((block) => ({
    ...block,
    textRuns: textRuns.runs.filter((run) => rectsOverlap(run.rect, block.rect)),
  }));
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const aLeft = a.origin.x;
  const aRight = a.origin.x + a.size.width;
  const aTop = a.origin.y;
  const aBottom = a.origin.y + a.size.height;

  const bLeft = b.origin.x;
  const bRight = b.origin.x + b.size.width;
  const bTop = b.origin.y;
  const bBottom = b.origin.y + b.size.height;

  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}
