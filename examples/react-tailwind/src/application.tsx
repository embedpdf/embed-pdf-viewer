import { useRef } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { createPluginRegistration } from '@embedpdf/core';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/react';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentTabs,
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
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { TabBar } from './components/tab-bar';
import { ViewerToolbar } from './components/viewer-toolbar';
import { LoadingSpinner } from './components/loading-spinner';
import { DocumentPasswordPrompt } from './components/document-password-prompt';
import { ConsoleLogger } from '@embedpdf/models';

const logger = new ConsoleLogger();

export default function DocumentViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = usePdfiumEngine({
    logger,
  });

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
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmbedPDF
          engine={engine}
          logger={logger}
          plugins={[
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
              defaultSpreadMode: SpreadMode.Odd,
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
          ]}
        >
          {({ pluginsReady, registry }) => (
            <>
              {pluginsReady ? (
                <DocumentTabs>
                  {({ documentStates, activeDocumentId, actions }) => (
                    <div className="flex h-full flex-col">
                      <TabBar
                        documentStates={documentStates}
                        activeDocumentId={activeDocumentId}
                        onSelect={actions.select}
                        onClose={actions.close}
                        onOpenFile={() =>
                          registry
                            ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                            ?.provides()
                            ?.openFileDialog()
                        }
                      />

                      {activeDocumentId && <ViewerToolbar documentId={activeDocumentId} />}

                      {/* Document Content Area */}
                      {activeDocumentId && (
                        <div className="flex-1 overflow-hidden bg-white">
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
                                  <div className="h-full w-full">
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
                                                <MarqueeZoom
                                                  documentId={activeDocumentId}
                                                  pageIndex={pageIndex}
                                                />
                                                <SelectionLayer
                                                  documentId={activeDocumentId}
                                                  pageIndex={pageIndex}
                                                />
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
                      )}
                    </div>
                  )}
                </DocumentTabs>
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
