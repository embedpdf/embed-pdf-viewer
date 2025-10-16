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
import { TabBar } from './components/tab-bar';
import { ViewerToolbar } from './components/viewer-toolbar';

export default function DocumentViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = usePdfiumEngine();

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (isLoading || !engine) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden" ref={containerRef}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmbedPDF
          engine={engine}
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
          ]}
        >
          {({ pluginsReady, registry }) => (
            <>
              {pluginsReady ? (
                <DocumentTabs>
                  {({ documentStates, activeDocumentId, actions }) => (
                    <div className="flex h-full flex-col">
                      <TabBar
                        documentStates={documentStates as any}
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
                              <div className="flex h-full items-center justify-center">
                                {isLoading && (
                                  <div className="flex items-center gap-2 text-gray-600">
                                    <svg
                                      className="h-5 w-5 animate-spin"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      />
                                    </svg>
                                    <span>Loading document...</span>
                                  </div>
                                )}
                                {isError && (
                                  <div className="rounded-lg bg-red-50 p-4 text-red-800">
                                    <p className="font-medium">Error loading document</p>
                                    <p className="mt-1 text-sm">{documentState.error}</p>
                                  </div>
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
                                          renderPage={({
                                            width,
                                            height,
                                            scale,
                                            rotation,
                                            pageIndex,
                                          }) => (
                                            <Rotate
                                              documentId={activeDocumentId}
                                              pageSize={{ width, height }}
                                            >
                                              <PagePointerProvider
                                                documentId={activeDocumentId}
                                                pageIndex={pageIndex}
                                                pageWidth={width}
                                                pageHeight={height}
                                                rotation={rotation}
                                                scale={scale}
                                              >
                                                <div
                                                  style={{
                                                    width,
                                                    height,
                                                    position: 'relative',
                                                    backgroundColor: 'red',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: `${150 * scale}px`,
                                                    color: 'rgba(255, 255, 255, 0.5)',
                                                    fontWeight: 'bold',
                                                    userSelect: 'none',
                                                  }}
                                                >
                                                  {pageIndex + 1}
                                                </div>
                                                <MarqueeZoom
                                                  documentId={activeDocumentId}
                                                  pageIndex={pageIndex}
                                                  scale={scale}
                                                />
                                              </PagePointerProvider>
                                            </Rotate>
                                          )}
                                        />
                                      </Viewport>
                                    </GlobalPointerProvider>
                                  </div>
                                )}
                              </div>
                            )}
                          </DocumentContent>
                        </div>
                      )}
                    </div>
                  )}
                </DocumentTabs>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Initializing plugins...</span>
                  </div>
                </div>
              )}
            </>
          )}
        </EmbedPDF>
      </div>
    </div>
  );
}
