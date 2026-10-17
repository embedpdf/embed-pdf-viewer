/**
 * `epdfTheme()`: a theme written with setting names, as a style for the
 * element around your viewer. The variables and their lookup are framework-free
 * (`@embedpdf/web`); this only types the result as Vue's style.
 */
import type { CSSProperties } from 'vue';
import { epdfThemeVariables, type EpdfTheme } from '@embedpdf/web';

export type { EpdfTheme } from '@embedpdf/web';

/**
 * The CSS variables of a theme, for a `:style` binding: `<div :style="epdfTheme({ accent })">`.
 * Everything inside the element follows them, and a CSS variable wins over any setting.
 */
export function epdfTheme(theme: EpdfTheme): CSSProperties {
  return epdfThemeVariables(theme) as CSSProperties;
}
