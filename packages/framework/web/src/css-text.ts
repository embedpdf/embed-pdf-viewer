/**
 * Style records as CSS text. This package hands styles out as records with
 * camelCase names (`strokeWidth`, `fontFamily`) and lengths with their units,
 * the shape a style object takes in React, Vue and Angular. A framework whose
 * `style` is a string (Svelte) turns a record into CSS text with
 * {@link cssText}: `stroke-width: …; font-family: …`. Paint values are
 * `var(--epdf-…, …)`, which only work in `style`, never in an SVG
 * presentation attribute.
 */

/** `strokeWidth` → `stroke-width`. */
const cssNameOf = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** A style record: CSS property names in camelCase, each a value or left out. */
export type StyleRecord<Style> = {
  readonly [Name in keyof Style]?: string | number | null;
};

/** A style record as CSS text, leaving out what is `undefined` or `null`. */
export function cssText<Style extends StyleRecord<Style>>(style: Style): string {
  return Object.entries(style as Record<string, string | number | null | undefined>)
    .filter((entry): entry is [string, string | number] => entry[1] != null)
    .map(([name, value]) => `${cssNameOf(name)}: ${value}`)
    .join('; ');
}
