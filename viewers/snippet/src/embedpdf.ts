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
// Plugin Classes, Capabilities & Scopes - for use with registry.getPlugin<T>()
// ============================================================================
export {
  ViewportPlugin,
  type ViewportPluginConfig,
  type ViewportCapability,
  type ViewportScope,
  type ViewportMetrics,
} from '@embedpdf/plugin-viewport/preact';
export {
  ScrollPlugin,
  ScrollStrategy,
  type ScrollPluginConfig,
  type ScrollCapability,
  type ScrollScope,
  type ScrollMetrics,
  type PageChangeEvent,
  type ScrollEvent,
  type LayoutChangeEvent,
} from '@embedpdf/plugin-scroll/preact';
export {
  SpreadPlugin,
  SpreadMode,
  type SpreadPluginConfig,
  type SpreadCapability,
  type SpreadScope,
} from '@embedpdf/plugin-spread/preact';
export {
  ZoomPlugin,
  ZoomMode,
  type ZoomPluginConfig,
  type ZoomCapability,
  type ZoomScope,
  type ZoomLevel,
  type ZoomChangeEvent,
} from '@embedpdf/plugin-zoom/preact';
export {
  RotatePlugin,
  type RotatePluginConfig,
  type RotateCapability,
  type RotateScope,
} from '@embedpdf/plugin-rotate/preact';
export {
  TilingPlugin,
  type TilingPluginConfig,
  type TilingCapability,
  type TilingScope,
} from '@embedpdf/plugin-tiling/preact';
export {
  ThumbnailPlugin,
  type ThumbnailPluginConfig,
  type ThumbnailCapability,
  type ThumbnailScope,
} from '@embedpdf/plugin-thumbnail/preact';
export {
  AnnotationPlugin,
  type AnnotationPluginConfig,
  type AnnotationCapability,
  type AnnotationScope,
  type AnnotationEvent,
} from '@embedpdf/plugin-annotation/preact';
export {
  SearchPlugin,
  type SearchPluginConfig,
  type SearchCapability,
  type SearchScope,
} from '@embedpdf/plugin-search/preact';
export {
  SelectionPlugin,
  type SelectionPluginConfig,
  type SelectionCapability,
  type SelectionScope,
} from '@embedpdf/plugin-selection/preact';
export {
  CapturePlugin,
  type CapturePluginConfig,
  type CaptureCapability,
  type CaptureScope,
} from '@embedpdf/plugin-capture/preact';
export {
  RedactionPlugin,
  RedactionMode,
  type RedactionPluginConfig,
  type RedactionCapability,
  type RedactionScope,
  type RedactionItem,
} from '@embedpdf/plugin-redaction/preact';
export {
  UIPlugin,
  type UIPluginConfig,
  type UICapability,
  type UIScope,
} from '@embedpdf/plugin-ui/preact';

// UI Schema Types - for customizing toolbars, menus, sidebars, etc.
export type {
  // Top-level schema
  UISchema,

  // Toolbar types
  ToolbarSchema,
  ToolbarPosition,
  ToolbarItem,
  CommandButtonItem,
  GroupItem,
  DividerItem,
  SpacerItem,
  TabGroupItem,
  TabItem,
  CustomComponentItem,

  // Menu types
  MenuSchema,
  MenuItem,
  MenuCommandItem,
  MenuDividerItem,
  MenuSectionItem,
  MenuSubmenuItem,
  MenuCustomItem,

  // Sidebar types
  SidebarSchema,
  SidebarPosition,
  PanelContent,
  TabsPanelContent,
  ComponentPanelContent,
  PanelTab,

  // Modal types
  ModalSchema,

  // Overlay types
  OverlaySchema,
  OverlayPosition,
  OverlayAnchor,

  // Selection menu types
  SelectionMenuSchema,
  SelectionMenuItem,
  SelectionMenuCommandItem,
  SelectionMenuDividerItem,
  SelectionMenuGroupItem,

  // Responsive types
  ResponsiveRules,
  BreakpointRule,

  // Utility types
  VisibilityDependency,
} from '@embedpdf/plugin-ui/preact';
export {
  I18nPlugin,
  type I18nPluginConfig,
  type I18nCapability,
  type I18nScope,
  type Locale,
  type LocaleChangeEvent,
} from '@embedpdf/plugin-i18n/preact';
export {
  CommandsPlugin,
  type CommandsPluginConfig,
  type Command,
  type ResolvedCommand,
  type CommandsCapability,
  type CommandScope,
} from '@embedpdf/plugin-commands/preact';
export {
  DocumentManagerPlugin,
  type DocumentManagerPluginConfig,
  type DocumentManagerCapability,
  type DocumentChangeEvent,
  type LoadDocumentUrlOptions,
  type LoadDocumentBufferOptions,
} from '@embedpdf/plugin-document-manager/preact';
export {
  PrintPlugin,
  type PrintPluginConfig,
  type PrintCapability,
  type PrintScope,
} from '@embedpdf/plugin-print/preact';
export {
  FullscreenPlugin,
  type FullscreenPluginConfig,
  type FullscreenCapability,
} from '@embedpdf/plugin-fullscreen/preact';
export {
  BookmarkPlugin,
  type BookmarkPluginConfig,
  type BookmarkCapability,
  type BookmarkScope,
} from '@embedpdf/plugin-bookmark/preact';
export {
  ExportPlugin,
  type ExportPluginConfig,
  type ExportCapability,
  type ExportScope,
} from '@embedpdf/plugin-export/preact';
export {
  PanPlugin,
  type PanPluginConfig,
  type PanCapability,
  type PanScope,
} from '@embedpdf/plugin-pan/preact';
export {
  HistoryPlugin,
  type HistoryPluginConfig,
  type HistoryCapability,
  type HistoryScope,
} from '@embedpdf/plugin-history/preact';
export {
  AttachmentPlugin,
  type AttachmentPluginConfig,
  type AttachmentCapability,
  type AttachmentScope,
} from '@embedpdf/plugin-attachment/preact';
export {
  RenderPlugin,
  type RenderPluginConfig,
  type RenderCapability,
  type RenderScope,
} from '@embedpdf/plugin-render/preact';
export {
  InteractionManagerPlugin,
  type InteractionManagerPluginConfig,
  type InteractionManagerCapability,
  type InteractionManagerScope,
} from '@embedpdf/plugin-interaction-manager/preact';

// Re-export from models
export { Rotation, ignore } from '@embedpdf/models';

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
