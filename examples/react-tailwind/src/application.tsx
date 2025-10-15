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
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { ZoomToolbar } from './components/zoom-toolbar';

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
          ]}
        >
          {({ pluginsReady, registry }) => (
            <>
              {pluginsReady ? (
                <DocumentTabs>
                  {({ documentStates, activeDocumentId, actions }) => (
                    <div className="flex h-full flex-col">
                      {/* Tab Bar */}
                      <div className="flex items-center border-b border-gray-200 bg-gray-50">
                        {/* Document Tabs */}
                        <div className="flex flex-1 overflow-x-auto">
                          {documentStates.map((document) => (
                            <div
                              key={document.id}
                              onClick={() => actions.select(document.id)}
                              role="tab"
                              tabIndex={0}
                              aria-selected={activeDocumentId === document.id}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  actions.select(document.id);
                                }
                              }}
                              className={`group relative flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                                activeDocumentId === document.id
                                  ? 'border-blue-500 bg-white text-blue-600'
                                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-800'
                              } `}
                            >
                              {/* Document Icon */}
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                />
                              </svg>

                              {/* Document Name */}
                              <span className="max-w-[150px] truncate">
                                {document.document?.name ?? `Document ${document.id.slice(0, 8)}`}
                              </span>

                              {/* Close Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  actions.close(document.id);
                                }}
                                aria-label={`Close ${document.document?.name ?? 'document'}`}
                                className="ml-2 rounded p-0.5 opacity-0 transition-opacity hover:bg-gray-200 group-hover:opacity-100"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Zoom Controls - add this before the Open File button */}
                        {activeDocumentId && (
                          <div className="border-l border-gray-200 px-3 py-2">
                            <ZoomToolbar documentId={activeDocumentId} />
                          </div>
                        )}

                        {/* Open File Button */}
                        <button
                          onClick={() =>
                            registry
                              ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                              ?.provides()
                              ?.openFileDialog()
                          }
                          className="flex items-center gap-2 border-l border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          <span>Open File</span>
                        </button>
                      </div>

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
                                                  fontSize: `${72 * scale}px`,
                                                  color: 'rgba(255, 255, 255, 0.5)',
                                                  fontWeight: 'bold',
                                                  userSelect: 'none',
                                                }}
                                              >
                                                {pageIndex + 1}
                                              </div>
                                            </PagePointerProvider>
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
