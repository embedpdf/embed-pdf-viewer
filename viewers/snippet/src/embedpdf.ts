import { EmbedPdfContainer } from './web-components/container';
import { PDFViewerConfig } from './components/app';

// ============================================================================
// Version
// ============================================================================

/**
 * The version of the EmbedPDF snippet package
 */
export const version: string = '__EMBEDPDF_VERSION__';

// ============================================================================
// Plugin Classes - for use with registry.getPlugin<T>()
// ============================================================================
export { ViewportPlugin, type ViewportPluginConfig } from '@embedpdf/plugin-viewport/preact';
export {
  ScrollPlugin,
  ScrollStrategy,
  type ScrollPluginConfig,
} from '@embedpdf/plugin-scroll/preact';
export { SpreadPlugin, SpreadMode, type SpreadPluginConfig } from '@embedpdf/plugin-spread/preact';
export { ZoomPlugin, ZoomMode, type ZoomPluginConfig } from '@embedpdf/plugin-zoom/preact';
export { RotatePlugin, type RotatePluginConfig } from '@embedpdf/plugin-rotate/preact';
export { TilingPlugin, type TilingPluginConfig } from '@embedpdf/plugin-tiling/preact';
export { ThumbnailPlugin, type ThumbnailPluginConfig } from '@embedpdf/plugin-thumbnail/preact';
export { AnnotationPlugin, type AnnotationPluginConfig } from '@embedpdf/plugin-annotation/preact';
export { SearchPlugin, type SearchPluginConfig } from '@embedpdf/plugin-search/preact';
export { SelectionPlugin, type SelectionPluginConfig } from '@embedpdf/plugin-selection/preact';
export { CapturePlugin, type CapturePluginConfig } from '@embedpdf/plugin-capture/preact';
export { RedactionPlugin, type RedactionPluginConfig } from '@embedpdf/plugin-redaction/preact';
export { UIPlugin, type UIPluginConfig } from '@embedpdf/plugin-ui/preact';
export { I18nPlugin, type I18nPluginConfig } from '@embedpdf/plugin-i18n/preact';
export { CommandsPlugin, type CommandsPluginConfig } from '@embedpdf/plugin-commands/preact';
export {
  DocumentManagerPlugin,
  type DocumentManagerPluginConfig,
} from '@embedpdf/plugin-document-manager/preact';
export { PrintPlugin, type PrintPluginConfig } from '@embedpdf/plugin-print/preact';
export { FullscreenPlugin, type FullscreenPluginConfig } from '@embedpdf/plugin-fullscreen/preact';
export { BookmarkPlugin, type BookmarkPluginConfig } from '@embedpdf/plugin-bookmark/preact';
export { ExportPlugin, type ExportPluginConfig } from '@embedpdf/plugin-export/preact';
export { PanPlugin, type PanPluginConfig } from '@embedpdf/plugin-pan/preact';
export { HistoryPlugin, type HistoryPluginConfig } from '@embedpdf/plugin-history/preact';
export { AttachmentPlugin, type AttachmentPluginConfig } from '@embedpdf/plugin-attachment/preact';
export { RenderPlugin, type RenderPluginConfig } from '@embedpdf/plugin-render/preact';
export {
  InteractionManagerPlugin,
  type InteractionManagerPluginConfig,
} from '@embedpdf/plugin-interaction-manager/preact';

// Re-export from models
export { Rotation } from '@embedpdf/models';

// Re-export PluginRegistry for typing
export type { PluginRegistry } from '@embedpdf/core';

// ============================================================================
// Theme - types and utilities
// ============================================================================
export type { Theme, ThemeConfig, ThemeColors, ThemePreference, DeepPartial } from './config/theme';
export { lightTheme, darkTheme, createTheme } from './config/theme';

// ============================================================================
// Icons - types and utilities
// ============================================================================
export type {
  IconConfig,
  IconsConfig,
  IconColor,
  IconPathConfig,
  CustomIconConfig,
  SimpleIconConfig,
} from './config/icon-registry';
export { registerIcon, registerIcons } from './config/icon-registry';

// Export the container class for typing
export { EmbedPdfContainer };

// Export main config type and tab bar visibility
export type { PDFViewerConfig };
export type { TabBarVisibility } from './components/tab-bar';

type ContainerConfig = PDFViewerConfig & {
  type: 'container';
  target: Element;
};

if (typeof customElements !== 'undefined' && !customElements.get('embedpdf-container')) {
  customElements.define('embedpdf-container', EmbedPdfContainer);
}

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
 *
 *   // Appearance
 *   theme: { preference: 'system' },
 *   icons: {
 *     myArrow: { path: 'M5 12h14M12 5l7 7-7 7', stroke: 'primary' }
 *   },
 *
 *   // Behavior options (all flat at root level)
 *   zoom: { defaultLevel: 'fit-width', minZoom: 0.5, maxZoom: 5 },
 *   scroll: { strategy: 'vertical', pageGap: 20 },
 *   thumbnails: { width: 200, gap: 15 },
 *   annotations: { autoCommit: false, author: 'John Doe' },
 * });
 *
 * // Access registry
 * const registry = await viewer.registry;
 *
 * // Change theme at runtime
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

export default {
  /**
   * The version of the EmbedPDF snippet package
   */
  version,

  /**
   * Initialize the EmbedPDF viewer
   */
  init: (config: ContainerConfig): EmbedPdfContainer | undefined => {
    if (config.type === 'container') {
      return initContainer(config);
    }
  },
};
