import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import styles from '../styles/index.css';
import { EmbedPDF } from '@embedpdf/core/preact';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
import { usePdfiumEngine } from '@embedpdf/engines/preact';
import { AllLogger, ConsoleLogger, PerfLogger, Rotation } from '@embedpdf/models';
import {
  Viewport,
  ViewportPluginConfig,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/preact';
import {
  Scroller,
  ScrollPluginConfig,
  ScrollPluginPackage,
  ScrollStrategy,
} from '@embedpdf/plugin-scroll/preact';
import {
  SpreadMode,
  SpreadPluginConfig,
  SpreadPluginPackage,
} from '@embedpdf/plugin-spread/preact';
import {
  UIProvider,
  useSchemaRenderer,
  UIPluginPackage,
  UIComponents,
  useSelectionMenu,
} from '@embedpdf/plugin-ui/preact';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/preact';
import { CommandsPluginPackage } from '@embedpdf/plugin-commands/preact';
import { I18nPluginPackage } from '@embedpdf/plugin-i18n/preact';
import {
  MarqueeZoom,
  ZoomMode,
  ZoomPluginConfig,
  ZoomPluginPackage,
} from '@embedpdf/plugin-zoom/preact';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/preact';
import { Rotate, RotatePluginConfig, RotatePluginPackage } from '@embedpdf/plugin-rotate/preact';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/preact';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/preact';
import {
  TilingLayer,
  TilingPluginConfig,
  TilingPluginPackage,
} from '@embedpdf/plugin-tiling/preact';
import { ThumbnailPluginConfig, ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/preact';
import { AnnotationLayer, AnnotationPluginPackage } from '@embedpdf/plugin-annotation/preact';
import { PrintPluginPackage } from '@embedpdf/plugin-print/preact';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/preact';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark/preact';
import { ExportPluginPackage } from '@embedpdf/plugin-export/preact';
import {
  GlobalPointerProvider,
  PagePointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/preact';
import { PanPluginPackage } from '@embedpdf/plugin-pan/preact';
import { MarqueeCapture, CapturePluginPackage } from '@embedpdf/plugin-capture/preact';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/preact';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/preact';
import { AttachmentPluginPackage } from '@embedpdf/plugin-attachment/preact';

import { SchemaToolbar } from '@/ui/schema-toolbar';
import { SchemaSidebar } from '@/ui/schema-sidebar';
import { SchemaMenu } from '@/ui/schema-menu';
import { SchemaModal } from '@/ui/schema-modal';
// Custom components for schema-driven UI
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
  commands,
  viewerUISchema,
  englishTranslations,
  paramResolvers,
  dutchTranslations,
  germanTranslations,
  frenchTranslations,
} from '@/config';
import { ThemeConfig } from '@/config/theme';
import { IconsConfig } from '@/config/icon-registry';

export { ScrollStrategy, ZoomMode, SpreadMode, Rotation };

// **Enhanced Configuration Interface**
export interface PluginConfigs {
  viewport?: ViewportPluginConfig;
  scroll?: ScrollPluginConfig;
  zoom?: ZoomPluginConfig;
  spread?: SpreadPluginConfig;
  rotate?: RotatePluginConfig;
  tiling?: TilingPluginConfig;
  thumbnail?: ThumbnailPluginConfig;
}

export interface PDFViewerConfig {
  src: string;
  worker?: boolean;
  wasmUrl?: string;
  plugins?: PluginConfigs;
  log?: boolean;
  /**
   * Theme configuration for the viewer
   * @example
   * // Use system preference (auto light/dark)
   * theme: { preference: 'system' }
   *
   * // Force dark mode
   * theme: { preference: 'dark' }
   *
   * // Custom brand colors with system preference
   * theme: {
   *   preference: 'system',
   *   themes: {
   *     light: { accent: { primary: '#8b5cf6' } },
   *     dark: { accent: { primary: '#a78bfa' } }
   *   }
   * }
   */
  theme?: ThemeConfig;
  /**
   * Custom icons configuration
   * @example
   * icons: {
   *   myCustomIcon: {
   *     path: 'M5 12h14M12 5l7 7-7 7',
   *     stroke: 'primary'
   *   },
   *   twoToneIcon: {
   *     paths: [
   *       { d: 'M3 3h18v18H3z', fill: 'secondary' },
   *       { d: 'M3 3h18v18H3z', stroke: 'primary' }
   *     ]
   *   }
   * }
   */
  icons?: IconsConfig;
}

// **Default Plugin Configurations**
const DEFAULT_PLUGIN_CONFIGS: Required<PluginConfigs> = {
  viewport: {
    viewportGap: 10,
  },
  scroll: {
    defaultStrategy: ScrollStrategy.Vertical,
  },
  zoom: {
    defaultZoomLevel: ZoomMode.FitPage,
  },
  spread: {
    defaultSpreadMode: SpreadMode.None,
  },
  rotate: {
    defaultRotation: Rotation.Degree0,
  },
  tiling: {
    tileSize: 768,
    overlapPx: 2.5,
    extraRings: 0,
  },
  thumbnail: {
    width: 150,
    gap: 10,
    buffer: 3,
    labelHeight: 30,
  },
};

// **Utility function to merge configurations**
function mergePluginConfigs(userConfigs: PluginConfigs = {}): Required<PluginConfigs> {
  return {
    viewport: { ...DEFAULT_PLUGIN_CONFIGS.viewport, ...userConfigs.viewport },
    scroll: { ...DEFAULT_PLUGIN_CONFIGS.scroll, ...userConfigs.scroll },
    zoom: { ...DEFAULT_PLUGIN_CONFIGS.zoom, ...userConfigs.zoom },
    spread: { ...DEFAULT_PLUGIN_CONFIGS.spread, ...userConfigs.spread },
    rotate: { ...DEFAULT_PLUGIN_CONFIGS.rotate, ...userConfigs.rotate },
    tiling: { ...DEFAULT_PLUGIN_CONFIGS.tiling, ...userConfigs.tiling },
    thumbnail: { ...DEFAULT_PLUGIN_CONFIGS.thumbnail, ...userConfigs.thumbnail },
  };
}

// **Props for the PDFViewer Component**
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

  // **Merge user configurations with defaults**
  const pluginConfigs = mergePluginConfigs(config.plugins);

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
          createPluginRegistration(DocumentManagerPluginPackage, {
            initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
          }),
          createPluginRegistration(CommandsPluginPackage, {
            commands,
            //disabledCategories: ['annotation', 'navigation'],
          }),
          createPluginRegistration(I18nPluginPackage, {
            defaultLocale: 'en',
            locales: [
              englishTranslations,
              dutchTranslations,
              germanTranslations,
              frenchTranslations,
            ],
            paramResolvers,
          }),
          createPluginRegistration(UIPluginPackage, {
            schema: viewerUISchema,
            //disabledCategories: ['selection', 'annotation', 'redaction'],
          }),
          createPluginRegistration(ViewportPluginPackage, pluginConfigs.viewport),
          createPluginRegistration(ScrollPluginPackage, pluginConfigs.scroll),
          createPluginRegistration(ZoomPluginPackage, pluginConfigs.zoom),
          createPluginRegistration(SpreadPluginPackage, pluginConfigs.spread),
          createPluginRegistration(RenderPluginPackage),
          createPluginRegistration(RotatePluginPackage, pluginConfigs.rotate),
          createPluginRegistration(SearchPluginPackage),
          createPluginRegistration(SelectionPluginPackage),
          createPluginRegistration(TilingPluginPackage, pluginConfigs.tiling),
          createPluginRegistration(ThumbnailPluginPackage, pluginConfigs.thumbnail),
          createPluginRegistration(AnnotationPluginPackage),
          createPluginRegistration(PrintPluginPackage),
          createPluginRegistration(FullscreenPluginPackage),
          createPluginRegistration(BookmarkPluginPackage),
          createPluginRegistration(ExportPluginPackage),
          createPluginRegistration(InteractionManagerPluginPackage),
          createPluginRegistration(PanPluginPackage),
          createPluginRegistration(CapturePluginPackage, {
            scale: 2,
            imageType: 'image/png',
          }),
          createPluginRegistration(HistoryPluginPackage),
          createPluginRegistration(RedactionPluginPackage, {
            drawBlackBoxes: true,
          }),
          createPluginRegistration(AttachmentPluginPackage),
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
