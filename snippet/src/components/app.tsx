import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import styles from '../styles/index.css';
import { EmbedPDF } from '@embedpdf/core/preact';
import { createPluginRegistration } from '@embedpdf/core';
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
  commands,
  viewerUISchema,
  englishTranslations,
  paramResolvers,
  dutchTranslations,
  germanTranslations,
  frenchTranslations,
} from '../config';
import { SchemaToolbar } from '../ui/schema-toolbar';
import { SchemaPanel } from '../ui/schema-panel';
import { SchemaMenu } from '../ui/schema-menu';
// Custom components for schema-driven UI
import { ThumbnailsSidebar } from './thumbnails-sidebar';
import { SearchSidebar } from './search-sidebar';
import { OutlineSidebar } from './outline-sidebar';
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
import { LoadingIndicator } from './ui/loading-indicator';
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
import { Capture } from './capture';
import { HintLayer } from './hint-layer';
import { AnnotationMenu } from './annotation-menu';
import { CommentSidebar } from './comment-sidebar';
import { RedactionMenu } from './redaction-menu';
import { CustomZoomToolbar } from './custom-zoom-toolbar';
import { AnnotationSidebar } from './annotation-sidebar';
import { SchemaSelectionMenu } from '@/ui/schema-selection-menu';
import { LocaleSwitcher } from './locale-switcher';

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
}

// Removed: menuItems and components are now in config files
// See: snippet/src/config/commands.ts and snippet/src/config/ui-schema.ts

// Viewer Layout Component
function ViewerLayout({ documentId }: { documentId: string }) {
  const { renderToolbar, renderPanel } = useSchemaRenderer(documentId);

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
      <div id="document-content" className="flex flex-1 overflow-hidden bg-white">
        {/* Left Panels */}
        {renderPanel('left', 'main')}

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
                    <div className="text-red-500">Error loading document</div>
                  </div>
                )}
                {isLoaded && (
                  <div className="relative h-full w-full">
                    <GlobalPointerProvider documentId={documentId}>
                      <Viewport className="bg-gray-100" documentId={documentId}>
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
                  </div>
                )}
              </>
            )}
          </DocumentContent>
        </div>

        {/* Right Panels */}
        {renderPanel('right', 'main')}
      </div>
    </>
  );
}

// Legacy menuItems removed - now in config/commands.ts
// Legacy components removed - now in config/ui-schema.ts

const logger = new AllLogger([new ConsoleLogger(), new PerfLogger()]);

export function PDFViewer({ config }: PDFViewerProps) {
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
    }),
    [],
  );

  const uiRenderers = useMemo(
    () => ({
      toolbar: SchemaToolbar,
      panel: SchemaPanel,
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
          registry
            ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
            ?.provides()
            ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
        }}
        engine={engine}
        plugins={[
          createPluginRegistration(DocumentManagerPluginPackage),
          createPluginRegistration(CommandsPluginPackage, { commands }),
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
            //disabledCategories: ['annotation', 'redaction'],
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
