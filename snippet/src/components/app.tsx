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
} from '@embedpdf/plugin-document-manager/preact';
import { CommandsPluginPackage, CommandsPluginConfig } from '@embedpdf/plugin-commands/preact';
import { I18nPluginPackage, I18nPluginConfig } from '@embedpdf/plugin-i18n/preact';
import {
  MarqueeZoom,
  ZoomMode,
  ZoomPluginPackage,
  ZoomPluginConfig,
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
} from '@/config';
import { ThemeConfig } from '@/config/theme';
import { IconsConfig } from '@/config/icon-registry';

// ============================================================================
// Main Configuration Interface - Uses actual plugin config types directly
// ============================================================================

export interface PDFViewerConfig {
  // === Required ===
  /** URL or path to the PDF document */
  src: string;

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

  // === Plugin Configurations (uses actual plugin types - no duplication!) ===
  // Core plugins
  /** Document manager options (initialDocuments) */
  documentManager?: DocumentManagerPluginConfig;
  /** Commands options (commands, disabledCategories) */
  commands?: CommandsPluginConfig;
  /** i18n options (defaultLocale, locales, paramResolvers) */
  i18n?: I18nPluginConfig;
  /** UI schema options (schema, disabledCategories) */
  ui?: UIPluginConfig;

  // Viewport & Navigation
  /** Viewport options (viewportGap, scrollEndDelay) */
  viewport?: ViewportPluginConfig;
  /** Scroll options (defaultStrategy, defaultPageGap, defaultBufferSize) */
  scroll?: ScrollPluginConfig;
  /** Zoom options (defaultZoomLevel, minZoom, maxZoom, zoomStep) */
  zoom?: ZoomPluginConfig;
  /** Spread/layout options (defaultSpreadMode) */
  spread?: SpreadPluginConfig;
  /** Rotation options (defaultRotation) */
  rotation?: RotatePluginConfig;
  /** Pan mode options (defaultMode: 'never' | 'mobile' | 'always') */
  pan?: PanPluginConfig;

  // Rendering
  /** Render options (withForms, withAnnotations) */
  render?: RenderPluginConfig;
  /** Tiling options (tileSize, overlapPx, extraRings) */
  tiling?: TilingPluginConfig;
  /** Thumbnail options (width, gap, buffer, labelHeight, etc.) */
  thumbnails?: ThumbnailPluginConfig;

  // Content features
  /** Annotation options (tools, colorPresets, autoCommit, author, etc.) */
  annotations?: AnnotationPluginConfig;
  /** Search options (flags, showAllResults) */
  search?: SearchPluginConfig;
  /** Selection options (menuHeight) */
  selection?: SelectionPluginConfig;
  /** Bookmark options */
  bookmarks?: BookmarkPluginConfig;
  /** Attachment options */
  attachments?: AttachmentPluginConfig;

  // Tools
  /** Capture options (scale, imageType, withAnnotations) */
  capture?: CapturePluginConfig;
  /** Redaction options (drawBlackBoxes) */
  redaction?: RedactionPluginConfig;
  /** Print options */
  print?: PrintPluginConfig;
  /** Export options (defaultFileName) */
  export?: ExportPluginConfig;
  /** Fullscreen options (targetElement) */
  fullscreen?: FullscreenPluginConfig;

  // Infrastructure
  /** History/undo options */
  history?: HistoryPluginConfig;
  /** Interaction manager options (exclusionRules) */
  interactionManager?: InteractionManagerPluginConfig;
}

// Default configurations for all plugins
// Even plugins with no defaults get an empty object for future-proofing
const DEFAULTS = {
  // Core plugins
  documentManager: {} as DocumentManagerPluginConfig,
  commands: { commands: defaultCommands } as CommandsPluginConfig,
  i18n: {
    defaultLocale: 'en',
    locales: [englishTranslations, dutchTranslations, germanTranslations, frenchTranslations],
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
  render: {} as RenderPluginConfig,
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
function ViewerLayout({ documentId }: { documentId: string }) {
  const { renderToolbar, renderSidebar, renderModal, renderOverlays } =
    useSchemaRenderer(documentId);

  const selectionMenu = useSelectionMenu('selection', documentId);
  const annotationMenu = useSelectionMenu('annotation', documentId);
  const redactionMenu = useSelectionMenu('redaction', documentId);

  return (
    <>
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
                    <LoadingIndicator size="lg" text="Loading document..." />
                  </div>
                )}
                {isError && (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-state-error">Error loading document</div>
                  </div>
                )}
                {isLoaded && (
                  <div className="relative h-full w-full">
                    <GlobalPointerProvider documentId={documentId}>
                      <Viewport className="bg-bg-app" documentId={documentId}>
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
            initialDocuments: [{ url: config.src }],
            ...config.documentManager,
          }),
          createPluginRegistration(CommandsPluginPackage, {
            ...DEFAULTS.commands,
            ...config.commands,
          }),
          createPluginRegistration(I18nPluginPackage, { ...DEFAULTS.i18n, ...config.i18n }),
          createPluginRegistration(UIPluginPackage, { ...DEFAULTS.ui, ...config.ui }),

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
                    <ViewerLayout documentId={activeDocumentId} />
                  </UIProvider>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <LoadingIndicator size="lg" text="No document loaded" />
                  </div>
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
