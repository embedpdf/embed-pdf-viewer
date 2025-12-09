import { EmbedPdfContainer } from './web-components/container';
import {
  PDFViewerConfig,
  PluginConfigs,
  ScrollStrategy,
  ZoomMode,
  SpreadMode,
  Rotation,
} from './components/app';

// Export theme types and utilities for customization
export {
  Theme,
  ThemeConfig,
  ThemeColors,
  ThemePreference,
  DeepPartial,
  lightTheme,
  darkTheme,
  createTheme,
} from './config/theme';

// Export the container class for typing
export { EmbedPdfContainer };

type ContainerConfig = PDFViewerConfig & {
  type: 'container';
  target: Element;
};

customElements.define('embedpdf-container', EmbedPdfContainer);

/**
 * Initialize the EmbedPDF viewer
 *
 * @returns The EmbedPdfContainer element, which provides:
 * - `.registry` - Promise that resolves to the PluginRegistry
 * - `.setTheme(theme)` - Change the theme at runtime
 * - `.activeTheme` - Get the current theme object
 * - `.activeColorScheme` - Get 'light' or 'dark'
 * - `.themePreference` - Get the preference ('light', 'dark', or 'system')
 * - Event: 'themechange' - Fired when theme changes
 *
 * @example
 * ```ts
 * const viewer = EmbedPDF.init({
 *   type: 'container',
 *   target: document.getElementById('pdf-viewer'),
 *   src: '/document.pdf',
 *   theme: { preference: 'system' }
 * });
 *
 * // Access registry
 * const registry = await viewer.registry;
 *
 * // Change theme
 * viewer.setTheme('dark');
 * viewer.setTheme({ preference: 'light' });
 *
 * // Listen for theme changes
 * viewer.addEventListener('themechange', (e) => {
 *   console.log('Theme changed:', e.detail.colorScheme);
 * });
 * ```
 */
function initContainer(config: ContainerConfig): EmbedPdfContainer {
  const { type, target, ...viewerConfig } = config;
  const embedPdfElement = document.createElement('embedpdf-container') as EmbedPdfContainer;
  embedPdfElement.config = viewerConfig;
  config.target.appendChild(embedPdfElement);

  return embedPdfElement;
}

// Export types for users
export type { PluginConfigs, ScrollStrategy, ZoomMode, SpreadMode, Rotation };

export default {
  init: (config: ContainerConfig): EmbedPdfContainer | undefined => {
    if (config.type === 'container') {
      return initContainer(config);
    }
  },
};
