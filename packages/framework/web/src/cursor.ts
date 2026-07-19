/**
 * SVG → CSS cursor string. The armed-tool indicator is the CURSOR itself (the
 * only zero-latency pointer-locked pixel the web has — the OS composites it),
 * so an app hands its toolbar icon here and assigns the result via the
 * interaction hub's `setToolCursor`.
 *
 * Browser rules baked into this module:
 *   - The SVG must carry explicit `width`/`height` attributes (not just a
 *     viewBox) or Chromium/WebKit ignore it — enforced here.
 *   - The hard ceiling is 128×128 CSS px (bigger falls back to the keyword).
 *     Above 32×32, Chromium temporarily resets the cursor to default while it
 *     would overlap browser UI (anti-spoofing) — fine mid-viewport, so ~40px
 *     compositions are common; stay ≤128.
 *   - The keyword fallback covers browsers that refuse SVG cursor images.
 *
 * Pure string work with no EmbedPDF types — like the file picker, this module
 * is a plain web utility.
 */

export interface SvgCursorOptions {
  /** Complete `<svg>` markup, colors baked in (no `currentColor` — a cursor
   *  image has no cascade to inherit from). */
  svg: string;
  /** The click point inside the image, CSS px from the top-left. Default 0,0
   *  (arrow-style: the image's corner is the tip). */
  hotspot?: { x: number; y: number };
  /** Keyword cursor when the image can't render. Default `'crosshair'`. */
  fallback?: string;
}

/** Build the CSS cursor value: `url("data:image/svg+xml,…") x y, fallback`. */
export function svgCursor({ svg, hotspot, fallback = 'crosshair' }: SvgCursorOptions): string {
  if (!/<svg[^>]*\swidth\s*=/.test(svg) || !/<svg[^>]*\sheight\s*=/.test(svg)) {
    throw new Error(
      '[web] svgCursor: the <svg> needs explicit width/height attributes — ' +
        'browsers ignore cursor images without an intrinsic size',
    );
  }
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const spot = hotspot ? ` ${Math.round(hotspot.x)} ${Math.round(hotspot.y)}` : '';
  return `url("${uri}")${spot}, ${fallback}`;
}
