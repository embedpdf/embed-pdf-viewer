/**
 * `epdfTheme()`: a theme written with setting names, as the CSS variables for the element
 * around your viewer. The variables and their lookup are framework-free (`@embedpdf/web`); this
 * types the result for Angular's `[style]` binding, which sets custom properties as they are.
 */
import { epdfThemeVariables, type EpdfTheme } from '@embedpdf/web';

export type { EpdfTheme } from '@embedpdf/web';

/**
 * The CSS variables of a theme: `<div [style]="theme()">` with
 * `theme = computed(() => epdfTheme({ accent: this.accent() }))`. Everything inside follows
 * them, and a CSS variable set in a stylesheet still wins over a setting.
 */
export function epdfTheme(theme: EpdfTheme): Record<string, string> {
  return epdfThemeVariables(theme) as Record<string, string>;
}
