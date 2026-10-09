/**
 * SVG → CSS cursor string. The armed-tool indicator is the cursor itself (the
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
  // Scan only the opening `<svg …>` tag (bounded slice) rather than running
  // `/<svg[^>]*\swidth\s*=/` over the whole string — the unbounded form is
  // quadratic on pathological inputs (many `<svg` fragments with no `>`),
  // while accepting exactly the same markup: `[^>]*` could never cross a
  // `>` either.
  const tagStart = svg.indexOf('<svg');
  const tagEnd = tagStart >= 0 ? svg.indexOf('>', tagStart) : -1;
  const openTag = tagEnd >= 0 ? svg.slice(tagStart, tagEnd + 1) : '';
  if (!/\swidth\s*=/.test(openTag) || !/\sheight\s*=/.test(openTag)) {
    throw new Error(
      '[web] svgCursor: the <svg> needs explicit width/height attributes — ' +
        'browsers ignore cursor images without an intrinsic size',
    );
  }
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const spot = hotspot ? ` ${Math.round(hotspot.x)} ${Math.round(hotspot.y)}` : '';
  return `url("${uri}")${spot}, ${fallback}`;
}

/** One cursor slot: an SVG image ({@link SvgCursorOptions}) or a plain CSS cursor ('crosshair', 'url(…) 4 4, copy'). */
export type ToolCursorImage = SvgCursorOptions | string;

/**
 * A tool's cursors: the tool, and its cursors by keyword. Build `svg` from the same icon your
 * toolbar shows, so the cursor and the button never drift apart.
 */
export interface ToolCursorSpec {
  toolId: string;
  /**
   * keyword → cursor: replace the keywords this tool can show (its own cursor, 'crosshair' or
   * 'copy', and hover claims, 'text' over text) with the tool's look. Keywords left out show as
   * they are: a markup tool's 'default' stays the bare arrow, a 'move' claim drops the icon. An
   * SVG value's `fallback` defaults to the keyword it replaces.
   */
  cursors: Record<string, ToolCursorImage>;
}

/**
 * A tool's cursors as CSS cursor values, for the interaction hub's `setToolCursor(toolId,
 * cursors)`: a string stays as it is, an SVG becomes its `url(…)` cursor, falling back to the
 * keyword it replaces unless it names its own fallback.
 */
export function toolCursorsOf(cursors: Record<string, ToolCursorImage>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(cursors).map(([keyword, image]) => [
      keyword,
      typeof image === 'string'
        ? image
        : svgCursor(image.fallback === undefined ? { ...image, fallback: keyword } : image),
    ]),
  );
}
