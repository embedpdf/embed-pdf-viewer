/**
 * Converts a style object with camelCase properties to a CSS string with kebab-case properties.
 *
 * This is useful in Svelte 5 where spreading style objects doesn't work with the `style:` directive.
 * Instead, you can convert the entire style object to a string and apply it to the `style` attribute.
 *
 * @param style - An object containing CSS properties in camelCase format with string or number values
 * @returns A CSS string with kebab-case properties suitable for the HTML style attribute
 *
 * @example
 * ```ts
 * const styles = {
 *   position: 'absolute',
 *   zIndex: 10,
 *   borderRadius: '50%',
 *   backgroundColor: '#007ACC'
 * };
 *
 * const cssString = stylesToString(styles);
 * // Returns: "position: absolute; z-index: 10; border-radius: 50%; background-color: #007ACC"
 * ```
 *
 * @example
 * Usage in Svelte templates:
 * ```svelte
 * <div style="{stylesToString(myStyles)}; color: red;"></div>
 * ```
 */
export function stylesToString(style: Record<string, string | number>): string {
  return Object.entries(style)
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${cssKey}: ${value}`;
    })
    .join('; ');
}
