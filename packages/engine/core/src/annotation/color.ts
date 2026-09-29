import type { Color } from './primitives';

/** One 0..255 component as two lowercase hex digits. */
const hex2 = (component: number): string =>
  Math.max(0, Math.min(255, Math.round(component)))
    .toString(16)
    .padStart(2, '0');

/** A color from its 0..255 sRGB components, as the engine gives colors. */
export function colorOf(r: number, g: number, b: number): Color {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** The 0..255 sRGB components of a `'#rrggbb'` color, in either case. */
export function rgbOf(color: Color): { r: number; g: number; b: number } {
  const value = Number.parseInt(color.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** Whether two colors are the same, whatever the case of their digits. */
export function sameColor(a: Color, b: Color): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
