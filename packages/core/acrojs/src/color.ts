import type { ScriptColorArray } from './types';

/**
 * Host-side Acrobat color-array conversions — the commit sinks and world
 * builders cross the Acrobat-array ↔ renderer-color boundary through these.
 * The PRELUDE inlines its own identical formulas (it must stay
 * self-contained); `prelude.test.ts` pins the two implementations together.
 *
 * Conversion vectors (the documented Acrobat semantics):
 *   G → RGB: replicate the gray component.
 *   CMYK → RGB: component = 1 − min(1, channel + k).
 *   RGB → G: luminosity 0.3r + 0.59g + 0.11b.
 *   RGB → CMYK: k = 1 − max(r,g,b); channels = 1 − component − k.
 *   T (transparent) converts to itself only.
 */
export function scriptColorToRgb(
  color: ScriptColorArray,
): { r: number; g: number; b: number } | null {
  switch (color[0]) {
    case 'T':
      return null;
    case 'G':
      return { r: color[1], g: color[1], b: color[1] };
    case 'RGB':
      return { r: color[1], g: color[2], b: color[3] };
    case 'CMYK': {
      const [, c, m, y, k] = color;
      return {
        r: 1 - Math.min(1, c + k),
        g: 1 - Math.min(1, m + k),
        b: 1 - Math.min(1, y + k),
      };
    }
  }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const hex = (value: number): string =>
  Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0');

/** Acrobat array → CSS hex, or null for transparent. */
export function scriptColorToCss(color: ScriptColorArray): string | null {
  const rgb = scriptColorToRgb(color);
  return rgb === null ? null : `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

/** CSS hex (#rgb/#rrggbb) → Acrobat RGB array; null/undefined → transparent. */
export function cssToScriptColor(css: string | null | undefined): ScriptColorArray {
  if (!css) return ['T'];
  const raw = css.trim().replace(/^#/, '');
  const long =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(long)) return ['T'];
  const channel = (offset: number) => parseInt(long.slice(offset, offset + 2), 16) / 255;
  return ['RGB', channel(0), channel(2), channel(4)];
}

/** Structural validation for values scripts assign. */
export function isScriptColorArray(value: unknown): value is ScriptColorArray {
  if (!Array.isArray(value) || value.length === 0) return false;
  const [space, ...parts] = value as [unknown, ...unknown[]];
  const counts: Record<string, number> = { T: 0, G: 1, RGB: 3, CMYK: 4 };
  const expected = counts[String(space)];
  return (
    expected !== undefined &&
    parts.length === expected &&
    parts.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
}
