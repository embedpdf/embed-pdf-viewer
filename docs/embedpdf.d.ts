import { EmbedPdfContainer } from './web-components/container';
import { PDFViewerConfig } from './components/app';
/**
 * The version of the EmbedPDF snippet package
 */
export declare const version: string;
export { ViewportPlugin, type ViewportPluginConfig, type ViewportCapability, type ViewportScope, type ViewportMetrics, } from '@embedpdf/plugin-viewport/preact';
export { ScrollPlugin, ScrollStrategy, type ScrollPluginConfig, type ScrollCapability, type ScrollScope, type ScrollMetrics, type PageChangeEvent, type ScrollEvent, type LayoutChangeEvent, } from '@embedpdf/plugin-scroll/preact';
export { SpreadPlugin, SpreadMode, type SpreadPluginConfig, type SpreadCapability, type SpreadScope, } from '@embedpdf/plugin-spread/preact';
export { ZoomPlugin, ZoomMode, type ZoomPluginConfig, type ZoomCapability, type ZoomScope, type ZoomLevel, type ZoomChangeEvent, } from '@embedpdf/plugin-zoom/preact';
export { RotatePlugin, type RotatePluginConfig, type RotateCapability, type RotateScope, } from '@embedpdf/plugin-rotate/preact';
export { TilingPlugin, type TilingPluginConfig, type TilingCapability, type TilingScope, } from '@embedpdf/plugin-tiling/preact';
export { ThumbnailPlugin, type ThumbnailPluginConfig, type ThumbnailCapability, type ThumbnailScope, } from '@embedpdf/plugin-thumbnail/preact';
export { AnnotationPlugin, type AnnotationPluginConfig, type AnnotationCapability, type AnnotationScope, type AnnotationEvent, } from '@embedpdf/plugin-annotation/preact';
export { SearchPlugin, type SearchPluginConfig, type SearchCapability, type SearchScope, } from '@embedpdf/plugin-search/preact';
export { SelectionPlugin, type SelectionPluginConfig, type SelectionCapability, type SelectionScope, } from '@embedpdf/plugin-selection/preact';
export { CapturePlugin, type CapturePluginConfig, type CaptureCapability, type CaptureScope, } from '@embedpdf/plugin-capture/preact';
export { RedactionPlugin, RedactionMode, type RedactionPluginConfig, type RedactionCapability, type RedactionScope, type RedactionItem, } from '@embedpdf/plugin-redaction/preact';
export { UIPlugin, type UIPluginConfig, type UICapability, type UIScope, } from '@embedpdf/plugin-ui/preact';
export type { UISchema, ToolbarSchema, ToolbarPosition, ToolbarItem, CommandButtonItem, GroupItem, DividerItem, SpacerItem, TabGroupItem, TabItem, CustomComponentItem, MenuSchema, MenuItem, MenuCommandItem, MenuDividerItem, MenuSectionItem, MenuSubmenuItem, MenuCustomItem, SidebarSchema, SidebarPosition, PanelContent, TabsPanelContent, ComponentPanelContent, PanelTab, ModalSchema, OverlaySchema, OverlayPosition, OverlayAnchor, SelectionMenuSchema, SelectionMenuItem, SelectionMenuCommandItem, SelectionMenuDividerItem, SelectionMenuGroupItem, ResponsiveRules, BreakpointRule, VisibilityDependency, } from '@embedpdf/plugin-ui/preact';
export { I18nPlugin, type I18nPluginConfig, type I18nCapability, type I18nScope, type Locale, type LocaleChangeEvent, } from '@embedpdf/plugin-i18n/preact';
export { CommandsPlugin, type CommandsPluginConfig, type Command, type ResolvedCommand, type CommandsCapability, type CommandScope, } from '@embedpdf/plugin-commands/preact';
export { DocumentManagerPlugin, type DocumentManagerPluginConfig, type DocumentManagerCapability, type DocumentChangeEvent, type LoadDocumentUrlOptions, type LoadDocumentBufferOptions, } from '@embedpdf/plugin-document-manager/preact';
export { PrintPlugin, type PrintPluginConfig, type PrintCapability, type PrintScope, } from '@embedpdf/plugin-print/preact';
export { FullscreenPlugin, type FullscreenPluginConfig, type FullscreenCapability, } from '@embedpdf/plugin-fullscreen/preact';
export { BookmarkPlugin, type BookmarkPluginConfig, type BookmarkCapability, type BookmarkScope, } from '@embedpdf/plugin-bookmark/preact';
export { ExportPlugin, type ExportPluginConfig, type ExportCapability, type ExportScope, } from '@embedpdf/plugin-export/preact';
export { PanPlugin, type PanPluginConfig, type PanCapability, type PanScope, } from '@embedpdf/plugin-pan/preact';
export { HistoryPlugin, type HistoryPluginConfig, type HistoryCapability, type HistoryScope, } from '@embedpdf/plugin-history/preact';
export { AttachmentPlugin, type AttachmentPluginConfig, type AttachmentCapability, type AttachmentScope, } from '@embedpdf/plugin-attachment/preact';
export { RenderPlugin, type RenderPluginConfig, type RenderCapability, type RenderScope, } from '@embedpdf/plugin-render/preact';
export { InteractionManagerPlugin, type InteractionManagerPluginConfig, type InteractionManagerCapability, type InteractionManagerScope, } from '@embedpdf/plugin-interaction-manager/preact';
export { Rotation, ignore } from '@embedpdf/models';
export type { PluginRegistry } from '@embedpdf/core';
export type { Theme, ThemeConfig, ThemeColors, ThemePreference, DeepPartial } from './config/theme';
export { lightTheme, darkTheme, createTheme } from './config/theme';
export type { IconConfig, IconsConfig, IconColor, IconPathConfig, CustomIconConfig, SimpleIconConfig, } from './config/icon-registry';
export { registerIcon, registerIcons } from './config/icon-registry';
export { EmbedPdfContainer };
export type { PDFViewerConfig };
export type { TabBarVisibility } from './components/tab-bar';
type ContainerConfig = PDFViewerConfig & {
    type: 'container';
    target: Element;
};
declare const _default: {
    /**
     * The version of the EmbedPDF snippet package
     */
    version: string;
    /**
     * Initialize the EmbedPDF viewer
     */
    init: (config: ContainerConfig) => EmbedPdfContainer | undefined;
};
export default _default;
//# sourceMappingURL=embedpdf.d.ts.map