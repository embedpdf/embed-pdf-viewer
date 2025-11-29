'use client'

import { useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react'
import {
  ViewportPluginPackage,
  Viewport,
} from '@embedpdf/plugin-viewport/react'
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react'
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react'
import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/react'
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react'

interface TabBarProps {
  documentStates: any[]
  activeDocumentId: string | null
  actions: {
    select: (id: string) => void
    close: (id: string) => void
  }
}

function TabBar({ documentStates, activeDocumentId, actions }: TabBarProps) {
  const { provides } = useDocumentManagerCapability()

  const handleOpenFile = () => {
    provides?.openFileDialog()
  }

  return (
    <div className="flex items-end gap-0.5 border-b border-gray-200 bg-gray-100 px-2 pt-2">
      <div className="flex flex-1 items-end gap-0.5 overflow-x-auto">
        {documentStates.map((doc) => (
          <div
            key={doc.id}
            onClick={() => actions.select(doc.id)}
            role="tab"
            tabIndex={0}
            aria-selected={activeDocumentId === doc.id}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                actions.select(doc.id)
              }
            }}
            className={`group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all ${
              activeDocumentId === doc.id
                ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
            }`}
          >
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="min-w-0 flex-1 truncate">
              {doc.name ?? `Document ${doc.id.slice(0, 8)}`}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                actions.close(doc.id)
              }}
              aria-label={`Close ${doc.name ?? 'document'}`}
              className={`flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50 ${
                activeDocumentId === doc.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
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
        <button
          onClick={handleOpenFile}
          className="mb-2 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
          aria-label="Open File"
          title="Open File"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          { url: 'https://snippet.embedpdf.com/ebook.pdf' },
          {
            url: 'https://snippet.embedpdf.com/ebook.pdf',
            autoActivate: false,
          },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
    ],
    [],
  )

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>
  }

  return (
    <div
      style={{
        height: '500px',
        display: 'flex',
        flexDirection: 'column',
        marginTop: '10px',
      }}
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ pluginsReady, activeDocumentId }) => (
          <>
            {pluginsReady ? (
              <div className="flex h-full flex-col">
                <DocumentContext>
                  {({
                    documentStates,
                    activeDocumentId: activeId,
                    actions,
                  }) => (
                    <>
                      <TabBar
                        documentStates={documentStates}
                        activeDocumentId={activeId}
                        actions={actions}
                      />
                      {activeId && (
                        <DocumentContent documentId={activeId}>
                          {({ isLoaded }) =>
                            isLoaded && (
                              <div className="flex-1 overflow-hidden">
                                <Viewport
                                  documentId={activeId}
                                  style={{
                                    backgroundColor: '#f1f3f5',
                                    height: '100%',
                                  }}
                                >
                                  <Scroller
                                    documentId={activeId}
                                    renderPage={({
                                      width,
                                      height,
                                      pageIndex,
                                    }) => (
                                      <div
                                        style={{
                                          width,
                                          height,
                                          position: 'relative',
                                        }}
                                      >
                                        <RenderLayer
                                          documentId={activeId}
                                          pageIndex={pageIndex}
                                        />
                                        <TilingLayer
                                          documentId={activeId}
                                          pageIndex={pageIndex}
                                        />
                                      </div>
                                    )}
                                  />
                                </Viewport>
                              </div>
                            )
                          }
                        </DocumentContent>
                      )}
                      {!activeId && (
                        <div className="flex flex-1 items-center justify-center text-gray-500">
                          No document open. Click the + button to open a file.
                        </div>
                      )}
                    </>
                  )}
                </DocumentContext>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div>Initializing plugins...</div>
              </div>
            )}
          </>
        )}
      </EmbedPDF>
    </div>
  )
}
