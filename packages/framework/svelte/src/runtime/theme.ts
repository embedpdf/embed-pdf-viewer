/**
 * `epdfTheme()`: a theme written with setting names, as a `style` for the element around your
 * viewer. The variables and their lookup are framework-free (`@embedpdf/web`); this writes them
 * as the CSS text a Svelte `style` attribute takes.
 */
import { epdfThemeVariables, type EpdfTheme } from '@embedpdf/web';

export type { EpdfTheme } from '@embedpdf/web';

/**
 * The CSS variables of a theme, for a `style` attribute: `<div style={epdfTheme({ accent })}>`.
 * Everything inside the element follows them, and a CSS variable wins over any setting.
 */
export function epdfTheme(theme: EpdfTheme): string {
  return Object.entries(epdfThemeVariables(theme))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}
