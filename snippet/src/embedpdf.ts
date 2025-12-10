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

// Export icon types and utilities for custom icons
export {
  IconConfig,
  IconsConfig,
  IconColor,
  IconPathConfig,
  CustomIconConfig,
  SimpleIconConfig,
  registerIcon,
  registerIcons,
} from './config/icon-registry';

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
 * - `.registerIcon(name, config)` - Register a custom icon
 * - `.registerIcons(icons)` - Register multiple custom icons
 * - Event: 'themechange' - Fired when theme changes
 *
 * @example
 * ```ts
 * const viewer = EmbedPDF.init({
 *   type: 'container',
 *   target: document.getElementById('pdf-viewer'),
 *   src: '/document.pdf',
 *   theme: { preference: 'system' },
 *   // Register icons via config
 *   icons: {
 *     myArrow: { path: 'M5 12h14M12 5l7 7-7 7', stroke: 'primary' }
 *   }
 * });
 *
 * // Or register icons at runtime
 * viewer.registerIcon('twoToneFolder', {
 *   paths: [
 *     { d: 'M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2v-10a2 2 0 0 0 -2 -2h-6l-2 -2h-6a2 2 0 0 0 -2 2z', fill: 'secondary' },
 *     { d: 'M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2v-10a2 2 0 0 0 -2 -2h-6l-2 -2h-6a2 2 0 0 0 -2 2z', stroke: 'primary' }
 *   ]
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
