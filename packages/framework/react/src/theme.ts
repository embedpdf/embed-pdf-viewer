/**
 * `epdfTheme()`: a theme written with setting names, as a style for the
 * element around your viewer. The variables and their lookup are framework-free
 * (`@embedpdf/web`); this only types the result as React's style.
 */
import type * as React from 'react';
import { epdfThemeVariables, type EpdfTheme } from '@embedpdf/web';

export type { EpdfTheme } from '@embedpdf/web';

/**
 * The CSS variables of a theme, for a `style` prop: `<div style={epdfTheme({ accent })}>`.
 * Everything inside the element follows them, and a CSS variable wins over any setting.
 */
export function epdfTheme(theme: EpdfTheme): React.CSSProperties {
  return epdfThemeVariables(theme) as React.CSSProperties;
}
