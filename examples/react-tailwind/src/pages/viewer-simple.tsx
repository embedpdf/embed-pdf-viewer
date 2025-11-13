import { useMemo, useRef, useState } from 'react';
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
import { TabBar } from '../components/tab-bar-2';
import { ViewerToolbar, ViewMode } from '../components/viewer-toolbar';
import { LoadingSpinner } from '../components/loading-spinner';
import { DocumentPasswordPrompt } from '../components/document-password-prompt';
import { SearchSidebar } from '../components/search-sidebar';
import { ThumbnailsSidebar } from '../components/thumbnails-sidebar';
import { PageControls } from '../components/page-controls';
import { ConsoleLogger } from '@embedpdf/models';
import { NavigationBar } from '../components/navigation-bar';
import { EmptyState } from '../components/empty-state';
import { CommandButton } from '../components/command-button';
import { commands } from '../config/commands';
import { SidebarState } from '../config/types';

const logger = new ConsoleLogger();

export function ViewerSimplePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = usePdfiumEngine({
    logger,
  });

  // Track sidebar state per document
  const [sidebarStates, setSidebarStates] = useState<Record<string, SidebarState>>({});

  // Track toolbar mode per document
  const [toolbarModes, setToolbarModes] = useState<Record<string, ViewMode>>({});

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
      createPluginRegistration(CommandsPluginPackage, {
        commands,
      }),
      createPluginRegistration(I18nPluginPackage),
    ],
    [],
  );

  const toggleSidebar = (documentId: string, sidebar: keyof SidebarState) => {
    setSidebarStates((prev) => ({
      ...prev,
      [documentId]: {
        ...(prev[documentId] || { search: false, thumbnails: false }),
        [sidebar]: !prev[documentId]?.[sidebar],
      },
    }));
  };

  const getSidebarState = (documentId: string): SidebarState => {
    return sidebarStates[documentId] || { search: false, thumbnails: false };
  };

  const getToolbarMode = (documentId: string): ViewMode => {
    return toolbarModes[documentId] || 'view';
  };

  const setToolbarMode = (documentId: string, mode: ViewMode) => {
    setToolbarModes((prev) => ({
      ...prev,
      [documentId]: mode,
    }));
  };

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (isLoading || !engine) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner message="Loading PDF engine..." />
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
          {({ pluginsReady }) => (
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
                        onOpenFile={actions.openFileDialog}
                      />

                      {activeDocumentId && (
                        <>
                          <ViewerToolbar
                            documentId={activeDocumentId}
                            onToggleSearch={() => toggleSidebar(activeDocumentId, 'search')}
                            onToggleThumbnails={() => toggleSidebar(activeDocumentId, 'thumbnails')}
                            isSearchOpen={getSidebarState(activeDocumentId).search}
                            isThumbnailsOpen={getSidebarState(activeDocumentId).thumbnails}
                            mode={getToolbarMode(activeDocumentId)}
                            onModeChange={(mode) => setToolbarMode(activeDocumentId, mode)}
                          />
                        </>
                      )}

                      {!activeDocumentId && <EmptyState />}

                      {/* Document Content Area */}
                      {activeDocumentId && (
                        <div id="document-content" className="flex flex-1 overflow-hidden bg-white">
                          {/* Thumbnails Sidebar - Left */}
                          {getSidebarState(activeDocumentId).thumbnails && (
                            <ThumbnailsSidebar
                              documentId={activeDocumentId}
                              onClose={() => toggleSidebar(activeDocumentId, 'thumbnails')}
                            />
                          )}

                          {/* Main Viewer */}
                          <div className="flex-1 overflow-hidden">
                            <DocumentContent documentId={activeDocumentId}>
                              {({ documentState, isLoading, isError, isLoaded }) => (
                                <>
                                  {isLoading && (
                                    <div className="flex h-full items-center justify-center">
                                      <LoadingSpinner message="Loading document..." />
                                    </div>
                                  )}
                                  {isError && (
                                    <DocumentPasswordPrompt documentState={documentState} />
                                  )}
                                  {isLoaded && (
                                    <div className="relative h-full w-full">
                                      <GlobalPointerProvider documentId={activeDocumentId}>
                                        <Viewport
                                          className="bg-gray-100"
                                          documentId={activeDocumentId}
                                        >
                                          <Scroller
                                            documentId={activeDocumentId}
                                            renderPage={({ pageIndex }) => (
                                              <Rotate
                                                documentId={activeDocumentId}
                                                pageIndex={pageIndex}
                                                style={{ backgroundColor: '#fff' }}
                                              >
                                                <PagePointerProvider
                                                  documentId={activeDocumentId}
                                                  pageIndex={pageIndex}
                                                >
                                                  <RenderLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                    scale={1}
                                                    style={{ pointerEvents: 'none' }}
                                                  />
                                                  <TilingLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                    style={{ pointerEvents: 'none' }}
                                                  />
                                                  <SearchLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <MarqueeZoom
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <MarqueeCapture
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <SelectionLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <RedactionLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <AnnotationLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                </PagePointerProvider>
                                              </Rotate>
                                            )}
                                          />
                                          {/* Page Controls */}
                                          <PageControls documentId={activeDocumentId} />
                                        </Viewport>
                                      </GlobalPointerProvider>
                                    </div>
                                  )}
                                </>
                              )}
                            </DocumentContent>
                          </div>

                          {/* Search Sidebar - Right */}
                          {getSidebarState(activeDocumentId).search && (
                            <SearchSidebar
                              documentId={activeDocumentId}
                              onClose={() => toggleSidebar(activeDocumentId, 'search')}
                            />
                          )}
                        </div>
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
