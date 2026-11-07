import type { PrintDpi } from '../dto/PageRender';

/**
 * The paper a print picture is sized for, in points: the larger of A4
 * (595 × 842) and Letter (612 × 792) on each side.
 */
export const PRINT_PAPER = { long: 842, short: 612 } as const;

/**
 * The scale (pixels per point) of a print picture of a page `size` points
 * big at `dpi` dots per inch of paper. A page that fits on the paper is
 * drawn at its own size at that DPI; a bigger one gets no more pixels than
 * it needs shrunk to fit, since the printer would throw the rest away. An
 * A0 drawing printed on office paper needs no more; printed at its own
 * size, it needs vectors (the print copy). Portrait or landscape doesn't
 * matter.
 */
export function printScale(size: { width: number; height: number }, dpi: PrintDpi): number {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  const fit = Math.min(1, PRINT_PAPER.long / long, PRINT_PAPER.short / short);
  return (dpi / 72) * fit;
}
