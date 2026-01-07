import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import styles from '../styles/index.css';
import { EmbedPDF } from '@embedpdf/core/preact';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
import { usePdfiumEngine } from '@embedpdf/engines/preact';
import { AllLogger, ConsoleLogger, PerfLogger, Rotation } from '@embedpdf/models';
import {
  Viewport,
  ViewportPluginPackage,
  ViewportPluginConfig,
} from '@embedpdf/plugin-viewport/preact';
import {
  Scroller,
  ScrollPluginPackage,
  ScrollPluginConfig,
  ScrollStrategy,
} from '@embedpdf/plugin-scroll/preact';
import {
  SpreadMode,
  SpreadPluginPackage,
  SpreadPluginConfig,
} from '@embedpdf/plugin-spread/preact';
import {
  UIProvider,
  useSchemaRenderer,
  UIPluginPackage,
  UIPluginConfig,
  UIComponents,
  useSelectionMenu,
} from '@embedpdf/plugin-ui/preact';
import {
  DocumentManagerPluginPackage,
  DocumentManagerPluginConfig,
  DocumentContent,
  useOpenDocuments,
  useActiveDocument,
} from '@embedpdf/plugin-document-manager/preact';
import { CommandsPluginPackage, CommandsPluginConfig } from '@embedpdf/plugin-commands/preact';
import { I18nPluginPackage, I18nPluginConfig, useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  MarqueeZoom,
  ZoomMode,
  ZoomPluginPackage,
  ZoomPluginConfig,
  ZoomGestureWrapper,
} from '@embedpdf/plugin-zoom/preact';
import {
  RenderLayer,
  RenderPluginPackage,
  RenderPluginConfig,
} from '@embedpdf/plugin-render/preact';
import { Rotate, RotatePluginPackage, RotatePluginConfig } from '@embedpdf/plugin-rotate/preact';
import {
  SearchLayer,
  SearchPluginPackage,
  SearchPluginConfig,
} from '@embedpdf/plugin-search/preact';
import {
  SelectionLayer,
  SelectionPluginPackage,
  SelectionPluginConfig,
} from '@embedpdf/plugin-selection/preact';
import {
  TilingLayer,
  TilingPluginPackage,
  TilingPluginConfig,
} from '@embedpdf/plugin-tiling/preact';
import { ThumbnailPluginPackage, ThumbnailPluginConfig } from '@embedpdf/plugin-thumbnail/preact';
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  AnnotationPluginConfig,
} from '@embedpdf/plugin-annotation/preact';
import { PrintPluginPackage, PrintPluginConfig } from '@embedpdf/plugin-print/preact';
import {
  FullscreenPluginPackage,
  FullscreenPluginConfig,
} from '@embedpdf/plugin-fullscreen/preact';
import { BookmarkPluginPackage, BookmarkPluginConfig } from '@embedpdf/plugin-bookmark/preact';
import { ExportPluginPackage, ExportPluginConfig } from '@embedpdf/plugin-export/preact';
import {
  GlobalPointerProvider,
  PagePointerProvider,
  InteractionManagerPluginPackage,
  InteractionManagerPluginConfig,
} from '@embedpdf/plugin-interaction-manager/preact';
import { PanPluginPackage, PanPluginConfig } from '@embedpdf/plugin-pan/preact';
import {
  MarqueeCapture,
  CapturePluginPackage,
  CapturePluginConfig,
} from '@embedpdf/plugin-capture/preact';
import { HistoryPluginPackage, HistoryPluginConfig } from '@embedpdf/plugin-history/preact';
import {
  RedactionLayer,
  RedactionPluginPackage,
  RedactionPluginConfig,
} from '@embedpdf/plugin-redaction/preact';
import {
  AttachmentPluginPackage,
  AttachmentPluginConfig,
} from '@embedpdf/plugin-attachment/preact';

import { SchemaToolbar } from '@/ui/schema-toolbar';
import { SchemaSidebar } from '@/ui/schema-sidebar';
import { SchemaMenu } from '@/ui/schema-menu';
import { SchemaModal } from '@/ui/schema-modal';
import { ThumbnailsSidebar } from '@/components/thumbnails-sidebar';
import { SearchSidebar } from '@/components/search-sidebar';
import { OutlineSidebar } from '@/components/outline-sidebar';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { HintLayer } from '@/components/hint-layer';
import { CommentSidebar } from '@/components/comment-sidebar';
import { CustomZoomToolbar } from '@/components/custom-zoom-toolbar';
import { AnnotationSidebar } from '@/components/annotation-sidebar';
import { SchemaSelectionMenu } from '@/ui/schema-selection-menu';
import { SchemaOverlay } from '@/ui/schema-overlay';
import { PrintModal } from '@/components/print-modal';
import { PageControls } from '@/components/page-controls';

import {
  commands as defaultCommands,
  viewerUISchema as defaultUISchema,
  englishTranslations,
  paramResolvers as defaultParamResolvers,
  dutchTranslations,
  germanTranslations,
  frenchTranslations,
  spanishTranslations,
  simplifiedChineseTranslations,
} from '@/config';
import { ThemeConfig } from '@/config/theme';
import { IconsConfig } from '@/config/icon-registry';
import { TabBar, TabBarVisibility } from '@/components/tab-bar';
import { EmptyState } from '@/components/empty-state';
import { DocumentPasswordPrompt } from '@/components/document-password-prompt';
import { ModeSelectButton } from './mode-select-button';

// ============================================================================
// Main Configuration Interface - Uses actual plugin config types directly
// ============================================================================

export interface PDFViewerConfig {
  // === Document Source (optional) ===
  /** URL or path to the PDF document. If not provided, viewer loads with no document. */
  src?: string;

  // === Engine Options ===
  /** Use web worker for PDF processing. Default: true */
  worker?: boolean;
  /** Custom URL for the WASM file */
  wasmUrl?: string;
  /** Enable debug logging. Default: false */
  log?: boolean;

  // === Appearance ===
  /** Theme configuration */
  theme?: ThemeConfig;
  /** Custom icons */
  icons?: IconsConfig;
  /**
   * Tab bar visibility for multi-document support
   * - 'always': Always show the tab bar
   * - 'multiple': Show only when more than 1 document is open (default)
   * - 'never': Never show the tab bar
   */
  tabBar?: TabBarVisibility;

  // === Global Feature Control ===
  /**
   * Globally disable features by category. This applies to both UI and commands.
   * Can be overridden by plugin-specific disabledCategories (ui.disabledCategories, commands.disabledCategories).
   *
   * Categories are hierarchical:
   * - 'annotation' - disables all annotation features
   * - 'annotation-highlight' - disables only highlight annotations
   * - 'annotation-markup' - disables highlight, underline, strikeout, squiggly
   * - 'redaction' - disables all redaction features
   * - 'zoom' - disables all zoom features
   * - 'document-print' - disables only print functionality
   *
   * @example
   * // Disable all annotation and redaction features
   * disabledCategories: ['annotation', 'redaction']
   *
   * // Disable only specific annotation types
   * disabledCategories: ['annotation-highlight', 'annotation-strikeout']
   */
  disabledCategories?: string[];

  // === Plugin Configurations (uses actual plugin types - no duplication!) ===
  // All plugin configs are Partial<> so users can override just the settings they need.
  // Defaults are merged in at runtime.

  // Core plugins
  /** Document manager options (initialDocuments) */
  documentManager?: Partial<DocumentManagerPluginConfig>;
  /** Commands options (commands, disabledCategories) */
  commands?: Partial<CommandsPluginConfig>;
  /** i18n options (defaultLocale, locales, paramResolvers) */
  i18n?: Partial<I18nPluginConfig>;
  /** UI schema options (schema, disabledCategories) */
  ui?: Partial<UIPluginConfig>;

  // Viewport & Navigation
  /** Viewport options (viewportGap, scrollEndDelay) */
  viewport?: Partial<ViewportPluginConfig>;
  /** Scroll options (defaultStrategy, defaultPageGap, defaultBufferSize) */
  scroll?: Partial<ScrollPluginConfig>;
  /** Zoom options (defaultZoomLevel, minZoom, maxZoom, zoomStep) */
  zoom?: Partial<ZoomPluginConfig>;
  /** Spread/layout options (defaultSpreadMode) */
  spread?: Partial<SpreadPluginConfig>;
  /** Rotation options (defaultRotation) */
  rotation?: Partial<RotatePluginConfig>;
  /** Pan mode options (defaultMode: 'never' | 'mobile' | 'always') */
  pan?: Partial<PanPluginConfig>;

  // Rendering
  /** Render options (withForms, withAnnotations) */
  render?: Partial<RenderPluginConfig>;
  /** Tiling options (tileSize, overlapPx, extraRings) */
  tiling?: Partial<TilingPluginConfig>;
  /** Thumbnail options (width, gap, buffer, labelHeight, etc.) */
  thumbnails?: Partial<ThumbnailPluginConfig>;

  // Content features
  /** Annotation options (tools, colorPresets, autoCommit, author, etc.) */
  annotations?: Partial<AnnotationPluginConfig>;
  /** Search options (flags, showAllResults) */
  search?: Partial<SearchPluginConfig>;
  /** Selection options (menuHeight) */
  selection?: Partial<SelectionPluginConfig>;
  /** Bookmark options */
  bookmarks?: Partial<BookmarkPluginConfig>;
  /** Attachment options */
  attachments?: Partial<AttachmentPluginConfig>;

  // Tools
  /** Capture options (scale, imageType, withAnnotations) */
  capture?: Partial<CapturePluginConfig>;
  /** Redaction options (drawBlackBoxes) */
  redaction?: Partial<RedactionPluginConfig>;
  /** Print options */
  print?: Partial<PrintPluginConfig>;
  /** Export options (defaultFileName) */
  export?: Partial<ExportPluginConfig>;
  /** Fullscreen options (targetElement) */
  fullscreen?: Partial<FullscreenPluginConfig>;

  // Infrastructure
  /** History/undo options */
  history?: Partial<HistoryPluginConfig>;
  /** Interaction manager options (exclusionRules) */
  interactionManager?: Partial<InteractionManagerPluginConfig>;
}

// Default configurations for all plugins
// Even plugins with no defaults get an empty object for future-proofing
const DEFAULTS = {
  // Core plugins
  documentManager: {} as DocumentManagerPluginConfig,
  commands: { commands: defaultCommands } as CommandsPluginConfig,
  i18n: {
    defaultLocale: 'en',
    locales: [
      englishTranslations,
      dutchTranslations,
      germanTranslations,
      frenchTranslations,
      spanishTranslations,
      simplifiedChineseTranslations,
    ],
    paramResolvers: defaultParamResolvers,
  } as I18nPluginConfig,
  ui: { schema: defaultUISchema } as UIPluginConfig,

  // Viewport & Navigation
  viewport: { viewportGap: 10 } as ViewportPluginConfig,
  scroll: { defaultStrategy: ScrollStrategy.Vertical } as ScrollPluginConfig,
  zoom: { defaultZoomLevel: ZoomMode.FitPage } as ZoomPluginConfig,
  spread: { defaultSpreadMode: SpreadMode.None } as SpreadPluginConfig,
  rotation: { defaultRotation: Rotation.Degree0 } as RotatePluginConfig,
  pan: {} as PanPluginConfig,

  // Rendering
  render: { defaultImageType: 'image/png' } as RenderPluginConfig,
  tiling: { tileSize: 768, overlapPx: 2.5, extraRings: 0 } as TilingPluginConfig,
  thumbnails: { width: 150, gap: 10, buffer: 3, labelHeight: 30 } as ThumbnailPluginConfig,

  // Content features
  annotations: {} as AnnotationPluginConfig,
  search: {} as SearchPluginConfig,
  selection: {} as SelectionPluginConfig,
  bookmarks: {} as BookmarkPluginConfig,
  attachments: {} as AttachmentPluginConfig,

  // Tools
  capture: { scale: 2, imageType: 'image/png' } as CapturePluginConfig,
  redaction: { drawBlackBoxes: true } as RedactionPluginConfig,
  print: {} as PrintPluginConfig,
  export: { defaultFileName: 'document.pdf' } as ExportPluginConfig,
  fullscreen: {} as FullscreenPluginConfig,

  // Infrastructure
  history: {} as HistoryPluginConfig,
  interactionManager: {} as InteractionManagerPluginConfig,
};

// Props for the PDFViewer Component
interface PDFViewerProps {
  config: PDFViewerConfig;
  onRegistryReady?: (registry: PluginRegistry) => void;
}

// Removed: menuItems and components are now in config files
// See: snippet/src/config/commands.ts and snippet/src/config/ui-schema.ts

// Note: Modal rendering is now handled by renderModal() from useSchemaRenderer

// Viewer Layout Component
interface ViewerLayoutProps {
  documentId: string;
  tabBarVisibility?: TabBarVisibility;
}

function ViewerLayout({ documentId, tabBarVisibility = 'multiple' }: ViewerLayoutProps) {
  const { renderToolbar, renderSidebar, renderModal, renderOverlays } =
    useSchemaRenderer(documentId);
  const { translate } = useTranslations(documentId);

  const selectionMenu = useSelectionMenu('selection', documentId);
  const annotationMenu = useSelectionMenu('annotation', documentId);
  const redactionMenu = useSelectionMenu('redaction', documentId);

  // Get document states for tab bar
  const documentStates = useOpenDocuments();
  const { activeDocumentId } = useActiveDocument();

  return (
    <>
      {/* Tab Bar for multi-document support */}
      <TabBar
        documentStates={documentStates}
        activeDocumentId={activeDocumentId}
        visibility={tabBarVisibility}
      />

      {/* Main Toolbar */}
      {renderToolbar('top', 'main')}

      {/* Secondary Toolbar (annotation/redaction/shapes) */}
      {renderToolbar('top', 'secondary')}

      {/* Document Content Area */}
      <div id="document-content" className="bg-bg-surface flex flex-1 overflow-hidden">
        {/* Left Sidebars */}
        {renderSidebar('left', 'main')}

        {/* Main Viewer */}
        <div className="flex-1 overflow-hidden">
          <DocumentContent documentId={documentId}>
            {({ documentState, isLoading, isError, isLoaded }) => (
              <>
                {isLoading && (
                  <div className="flex h-full items-center justify-center">
                    <LoadingIndicator size="lg" text={translate('document.loading')} />
                  </div>
                )}
                {isError && <DocumentPasswordPrompt documentState={documentState} />}
                {isLoaded && (
                  <div className="relative h-full w-full">
                    <GlobalPointerProvider documentId={documentId}>
                      <Viewport className="bg-bg-app" documentId={documentId}>
                        <ZoomGestureWrapper documentId={documentId}>
                          <Scroller
                            documentId={documentId}
                            renderPage={({ pageIndex }) => (
                              <Rotate
                                documentId={documentId}
                                pageIndex={pageIndex}
                                style={{ backgroundColor: '#fff' }}
                              >
                                <PagePointerProvider documentId={documentId} pageIndex={pageIndex}>
                                  <RenderLayer
                                    documentId={documentId}
                                    pageIndex={pageIndex}
                                    scale={0.5}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  <TilingLayer
                                    documentId={documentId}
                                    pageIndex={pageIndex}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  <SearchLayer documentId={documentId} pageIndex={pageIndex} />
                                  <MarqueeZoom documentId={documentId} pageIndex={pageIndex} />
                                  <MarqueeCapture documentId={documentId} pageIndex={pageIndex} />
                                  <SelectionLayer
                                    documentId={documentId}
                                    pageIndex={pageIndex}
                                    selectionMenu={selectionMenu}
                                  />
                                  <RedactionLayer
                                    documentId={documentId}
                                    pageIndex={pageIndex}
                                    selectionMenu={redactionMenu}
                                  />
                                  <AnnotationLayer
                                    documentId={documentId}
                                    pageIndex={pageIndex}
                                    selectionMenu={annotationMenu}
                                  />
                                  <HintLayer />
                                </PagePointerProvider>
                              </Rotate>
                            )}
                          />
                        </ZoomGestureWrapper>
                      </Viewport>
                    </GlobalPointerProvider>
                    {/* Overlays (floating components like page controls) */}
                    {renderOverlays()}
                  </div>
                )}
              </>
            )}
          </DocumentContent>
        </div>

        {/* Right Sidebars */}
        {renderSidebar('right', 'main')}
      </div>

      {/* Modals */}
      {renderModal()}
    </>
  );
}

const logger = new AllLogger([new ConsoleLogger(), new PerfLogger()]);

export function PDFViewer({ config, onRegistryReady }: PDFViewerProps) {
  const { engine, isLoading } = usePdfiumEngine({
    ...(config.wasmUrl && { wasmUrl: config.wasmUrl }),
    worker: config.worker,
    logger: config.log ? logger : undefined,
  });

  // Memoize UIProvider props to prevent unnecessary remounts
  const uiComponents: UIComponents = useMemo(
    () => ({
      'thumbnails-sidebar': ThumbnailsSidebar,
      'annotation-sidebar': AnnotationSidebar,
      'zoom-toolbar': CustomZoomToolbar,
      'search-sidebar': SearchSidebar,
      'outline-sidebar': OutlineSidebar,
      'comment-sidebar': CommentSidebar,
      'print-modal': PrintModal,
      'page-controls': PageControls,
      'mode-select-button': ModeSelectButton,
    }),
    [],
  );

  const uiRenderers = useMemo(
    () => ({
      toolbar: SchemaToolbar,
      sidebar: SchemaSidebar,
      modal: SchemaModal,
      overlay: SchemaOverlay,
      menu: SchemaMenu,
      selectionMenu: SchemaSelectionMenu,
    }),
    [],
  );

  if (!engine || isLoading)
    return (
      <>
        <style>{styles}</style>
        <div className="flex h-full w-full items-center justify-center">
          <LoadingIndicator size="lg" text="Initializing PDF engine..." />
        </div>
      </>
    );

  return (
    <>
      <style>{styles}</style>
      <EmbedPDF
        logger={config.log ? logger : undefined}
        onInitialized={async (registry) => {
          // Call the callback if provided
          if (onRegistryReady && registry) {
            onRegistryReady(registry);
          }
        }}
        engine={engine}
        plugins={[
          // Core plugins
          createPluginRegistration(DocumentManagerPluginPackage, {
            ...DEFAULTS.documentManager,
            ...(config.src && { initialDocuments: [{ url: config.src }] }),
            ...config.documentManager,
          }),
          createPluginRegistration(CommandsPluginPackage, {
            ...DEFAULTS.commands,
            // Use root disabledCategories as default, but allow plugin-specific override
            ...(config.disabledCategories && { disabledCategories: config.disabledCategories }),
            ...config.commands,
          }),
          createPluginRegistration(I18nPluginPackage, { ...DEFAULTS.i18n, ...config.i18n }),
          createPluginRegistration(UIPluginPackage, {
            ...DEFAULTS.ui,
            // Use root disabledCategories as default, but allow plugin-specific override
            ...(config.disabledCategories && { disabledCategories: config.disabledCategories }),
            ...config.ui,
          }),

          // Viewport & Navigation
          createPluginRegistration(ViewportPluginPackage, {
            ...DEFAULTS.viewport,
            ...config.viewport,
          }),
          createPluginRegistration(ScrollPluginPackage, { ...DEFAULTS.scroll, ...config.scroll }),
          createPluginRegistration(ZoomPluginPackage, { ...DEFAULTS.zoom, ...config.zoom }),
          createPluginRegistration(SpreadPluginPackage, { ...DEFAULTS.spread, ...config.spread }),
          createPluginRegistration(RotatePluginPackage, {
            ...DEFAULTS.rotation,
            ...config.rotation,
          }),
          createPluginRegistration(PanPluginPackage, { ...DEFAULTS.pan, ...config.pan }),

          // Rendering
          createPluginRegistration(RenderPluginPackage, { ...DEFAULTS.render, ...config.render }),
          createPluginRegistration(TilingPluginPackage, { ...DEFAULTS.tiling, ...config.tiling }),
          createPluginRegistration(ThumbnailPluginPackage, {
            ...DEFAULTS.thumbnails,
            ...config.thumbnails,
          }),

          // Content features
          createPluginRegistration(AnnotationPluginPackage, {
            ...DEFAULTS.annotations,
            ...config.annotations,
          }),
          createPluginRegistration(SearchPluginPackage, { ...DEFAULTS.search, ...config.search }),
          createPluginRegistration(SelectionPluginPackage, {
            ...DEFAULTS.selection,
            ...config.selection,
          }),
          createPluginRegistration(BookmarkPluginPackage, {
            ...DEFAULTS.bookmarks,
            ...config.bookmarks,
          }),
          createPluginRegistration(AttachmentPluginPackage, {
            ...DEFAULTS.attachments,
            ...config.attachments,
          }),

          // Tools
          createPluginRegistration(CapturePluginPackage, {
            ...DEFAULTS.capture,
            ...config.capture,
          }),
          createPluginRegistration(RedactionPluginPackage, {
            ...DEFAULTS.redaction,
            ...config.redaction,
          }),
          createPluginRegistration(PrintPluginPackage, { ...DEFAULTS.print, ...config.print }),
          createPluginRegistration(ExportPluginPackage, { ...DEFAULTS.export, ...config.export }),
          createPluginRegistration(FullscreenPluginPackage, {
            ...DEFAULTS.fullscreen,
            ...config.fullscreen,
          }),

          // Infrastructure
          createPluginRegistration(HistoryPluginPackage, {
            ...DEFAULTS.history,
            ...config.history,
          }),
          createPluginRegistration(InteractionManagerPluginPackage, {
            ...DEFAULTS.interactionManager,
            ...config.interactionManager,
          }),
        ]}
      >
        {({ pluginsReady, activeDocumentId }) => (
          <>
            {pluginsReady ? (
              <>
                {activeDocumentId ? (
                  <UIProvider
                    documentId={activeDocumentId}
                    components={uiComponents}
                    renderers={uiRenderers}
                    className="relative flex h-full w-full select-none flex-col"
                  >
                    <ViewerLayout documentId={activeDocumentId} tabBarVisibility={config.tabBar} />
                  </UIProvider>
                ) : (
                  <EmptyState />
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <LoadingIndicator size="lg" text="Initializing plugins..." />
              </div>
            )}
          </>
        )}
      </EmbedPDF>
    </>
  );
}
