import { useMemo, useRef } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { createPluginRegistration } from '@embedpdf/core';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/react';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/react';
import {
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { ZoomMode, ZoomPluginPackage, MarqueeZoom } from '@embedpdf/plugin-zoom/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/react';
import { Rotate, RotatePluginPackage } from '@embedpdf/plugin-rotate/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { MarqueeCapture, CapturePluginPackage } from '@embedpdf/plugin-capture/react';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationPluginPackage, AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import { CommandsPluginPackage } from '@embedpdf/plugin-commands/react';
import { I18nPluginPackage } from '@embedpdf/plugin-i18n/react';
import { UIPluginPackage, UIProvider, useSchemaRenderer } from '@embedpdf/plugin-ui/react';
import { TabBar } from '../components/tab-bar-2';
import { LoadingSpinner } from '../components/loading-spinner';
import { DocumentPasswordPrompt } from '../components/document-password-prompt';
import { PageControls } from '../components/page-controls';
import { ConsoleLogger } from '@embedpdf/models';
import { NavigationBar } from '../components/navigation-bar';
import { EmptyState } from '../components/empty-state';
import { commands } from '../config/commands';
import { viewerUISchema } from '../config/ui-schema';
import { SchemaToolbar } from '../ui/schema-toolbar';
import { SchemaPanel } from '../ui/schema-panel';
import { SchemaMenu } from '../ui/schema-menu';
import { CustomZoomToolbar } from '../components/custom-zoom-toolbar';
import { ThumbnailsSidebar } from '../components/thumbnails-sidebar';
import { SearchSidebar } from '../components/search-sidebar';
import { OutlineSidebar } from '../components/outline-sidebar';
import {
  dutchTranslations,
  englishTranslations,
  germanTranslations,
  paramResolvers,
  spanishTranslations,
} from '../config';

const logger = new ConsoleLogger();

/**
 * Schema-Driven Viewer Page
 *
 * This viewer demonstrates the power of the UI plugin and schema-driven architecture.
 * Instead of hardcoding the toolbar components, the UI is defined declaratively
 * in the UI schema and rendered dynamically.
 *
 * Benefits:
 * - Declarative UI configuration
 * - Type-safe schema
 * - Easily customizable and extensible
 * - Consistent UI patterns
 * - Separation of concerns
 */
export function ViewerSchemaPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = usePdfiumEngine({
    logger,
  });

  // Memoize UIProvider props to prevent unnecessary remounts
  const uiComponents = useMemo(
    () => ({
      'zoom-toolbar': CustomZoomToolbar,
      'thumbnails-sidebar': ThumbnailsSidebar,
      'search-sidebar': SearchSidebar,
      'outline-sidebar': OutlineSidebar,
    }),
    [],
  );

  const uiRenderers = useMemo(
    () => ({
      toolbar: SchemaToolbar,
      panel: SchemaPanel,
      menu: SchemaMenu,
    }),
    [],
  );

  const plugins = useMemo(
    () => [
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap: 10,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultStrategy: ScrollStrategy.Vertical,
      }),
      createPluginRegistration(DocumentManagerPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(PanPluginPackage),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(RotatePluginPackage),
      createPluginRegistration(ExportPluginPackage),
      createPluginRegistration(PrintPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 2.5,
        extraRings: 0,
      }),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(SearchPluginPackage),
      createPluginRegistration(RedactionPluginPackage),
      createPluginRegistration(CapturePluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(AnnotationPluginPackage),
      createPluginRegistration(FullscreenPluginPackage),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: 120,
        paddingY: 10,
      }),
      // Commands plugin - provides command execution and state management
      createPluginRegistration(CommandsPluginPackage, {
        commands,
      }),
      createPluginRegistration(I18nPluginPackage, {
        defaultLocale: 'nl',
        locales: [englishTranslations, germanTranslations, spanishTranslations, dutchTranslations],
        paramResolvers,
      }),
      // UI plugin - provides schema-driven UI rendering
      createPluginRegistration(UIPluginPackage, {
        schema: viewerUISchema,
      }),
    ],
    [],
  );

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (isLoading || !engine) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden" ref={containerRef}>
      <NavigationBar />

      <div className="flex flex-1 select-none flex-col overflow-hidden">
        <EmbedPDF
          engine={engine}
          logger={logger}
          plugins={plugins}
          onInitialized={async (registry) => {
            registry
              ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
              ?.provides()
              ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
          }}
        >
          {({ pluginsReady, registry }) => (
            <>
              {pluginsReady ? (
                <DocumentContext>
                  {({ documentStates, activeDocumentId, actions }) => (
                    <div className="flex h-full flex-col">
                      <TabBar
                        documentStates={documentStates}
                        activeDocumentId={activeDocumentId}
                        onSelect={actions.select}
                        onClose={actions.close}
                        onOpenFile={() => {
                          registry
                            ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                            ?.provides()
                            ?.openFileDialog();
                        }}
                      />

                      {/* Schema-driven UI with UIProvider */}
                      {activeDocumentId ? (
                        <UIProvider
                          documentId={activeDocumentId}
                          components={uiComponents}
                          renderers={uiRenderers}
                        >
                          <ViewerLayout documentId={activeDocumentId} />
                        </UIProvider>
                      ) : (
                        <EmptyState />
                      )}
                    </div>
                  )}
                </DocumentContext>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <LoadingSpinner message="Initializing plugins..." />
                </div>
              )}
            </>
          )}
        </EmbedPDF>
      </div>
    </div>
  );
}

/**
 * Viewer Layout
 *
 * Main layout component that uses useSchemaRenderer to render toolbars and panels.
 * This component replaces the old SchemaToolbarRenderer and SchemaPanelRenderer.
 */
function ViewerLayout({ documentId }: { documentId: string }) {
  const { renderToolbar, renderPanel } = useSchemaRenderer(documentId);

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
                    <LoadingSpinner message="Loading document..." />
                  </div>
                )}
                {isError && <DocumentPasswordPrompt documentState={documentState} />}
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
                                  scale={1}
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
                                <SelectionLayer documentId={documentId} pageIndex={pageIndex} />
                                <RedactionLayer documentId={documentId} pageIndex={pageIndex} />
                                <AnnotationLayer documentId={documentId} pageIndex={pageIndex} />
                              </PagePointerProvider>
                            </Rotate>
                          )}
                        />
                        {/* Page Controls */}
                        <PageControls documentId={documentId} />
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
