import { useMemo, useRef, useState } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { createPluginRegistration } from '@embedpdf/core';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/react';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
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
import { ViewManagerPluginPackage } from '@embedpdf/plugin-view-manager/react';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { CapturePluginPackage, MarqueeCapture } from '@embedpdf/plugin-capture/react';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationPluginPackage, AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import { TabBar } from './components/tab-bar';
import { ViewerToolbar, ViewMode } from './components/viewer-toolbar';
import { LoadingSpinner } from './components/loading-spinner';
import { DocumentPasswordPrompt } from './components/document-password-prompt';
import { SearchSidebar } from './components/search-sidebar';
import { ThumbnailsSidebar } from './components/thumbnails-sidebar';
import { PageControls } from './components/page-controls';
import { ConsoleLogger } from '@embedpdf/models';
import { SplitViewLayout } from './components/split-view-layout';

const logger = new ConsoleLogger();

// Type for tracking sidebar state per document
type SidebarState = {
  search: boolean;
  thumbnails: boolean;
};

export default function DocumentViewer() {
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
      createPluginRegistration(FullscreenPluginPackage, {
        targetElement: '#document-content',
      }),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: 120,
        paddingY: 10,
      }),
      createPluginRegistration(ViewManagerPluginPackage, {
        defaultViewCount: 1,
      }),
    ],
    [], // Empty dependency array since these never change
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
      <div className="flex flex-1 select-none flex-col overflow-hidden">
        <EmbedPDF engine={engine} logger={logger} plugins={plugins}>
          {({ pluginsReady, registry }) => (
            <>
              {pluginsReady ? (
                <SplitViewLayout
                  renderView={({
                    view,
                    activeDocumentId: documentId,
                    addDocument,
                    setActiveDocument,
                  }) => (
                    <div className="flex h-full flex-col">
                      <TabBar
                        currentView={view}
                        onSelect={(documentId) => setActiveDocument(documentId)}
                        onClose={(docId) =>
                          registry
                            ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                            ?.provides()
                            ?.closeDocument(docId)
                        }
                        onOpenFile={() => {
                          const openTask = registry
                            ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                            ?.provides()
                            ?.openFileDialog();
                          openTask?.wait(
                            (result) => {
                              addDocument(result.documentId);
                              setActiveDocument(result.documentId);
                            },
                            (error) => {
                              console.error('Open file failed:', error);
                            },
                          );
                        }}
                      />

                      {documentId && (
                        <ViewerToolbar
                          documentId={documentId}
                          onToggleSearch={() => toggleSidebar(documentId, 'search')}
                          onToggleThumbnails={() => toggleSidebar(documentId, 'thumbnails')}
                          isSearchOpen={getSidebarState(documentId).search}
                          isThumbnailsOpen={getSidebarState(documentId).thumbnails}
                          mode={getToolbarMode(documentId)}
                          onModeChange={(mode) => setToolbarMode(documentId, mode)}
                        />
                      )}

                      {/* Document Content Area */}
                      {documentId && (
                        <div id="document-content" className="flex flex-1 overflow-hidden bg-white">
                          {/* Thumbnails Sidebar - Left */}
                          {getSidebarState(documentId).thumbnails && (
                            <ThumbnailsSidebar
                              documentId={documentId}
                              onClose={() => toggleSidebar(documentId, 'thumbnails')}
                            />
                          )}

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
                                  {isError && (
                                    <DocumentPasswordPrompt documentState={documentState} />
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
                                                <PagePointerProvider
                                                  documentId={documentId}
                                                  pageIndex={pageIndex}
                                                >
                                                  <RenderLayer
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                    scale={1}
                                                    style={{ pointerEvents: 'none' }}
                                                  />
                                                  {/*<TilingLayer
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                    style={{ pointerEvents: 'none' }}
                                                  />*/}
                                                  <SearchLayer
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <MarqueeZoom
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <MarqueeCapture
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <SelectionLayer
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <RedactionLayer
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
                                                  <AnnotationLayer
                                                    documentId={documentId}
                                                    pageIndex={pageIndex}
                                                  />
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

                          {/* Search Sidebar - Right */}
                          {getSidebarState(documentId).search && (
                            <SearchSidebar
                              documentId={documentId}
                              onClose={() => toggleSidebar(documentId, 'search')}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                />
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
