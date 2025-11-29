'use client'

import {
  createPluginRegistration,
  PluginBatchRegistrations,
} from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useMemo } from 'react'

// Import the essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react'

// Import Zoom and Interaction Manager plugins
import {
  useZoom,
  ZoomPluginPackage,
  MarqueeZoom,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'

interface PDFViewerProps {
  withMarqueeZoom?: boolean
}

interface ZoomToolbarProps {
  documentId: string
  withMarqueeZoom?: boolean
}

export const ZoomToolbar = ({
  documentId,
  withMarqueeZoom = false,
}: ZoomToolbarProps) => {
  const { provides: zoom, state } = useZoom(documentId)

  if (!zoom) {
    return null
  }

  return (
    <div className="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {/* Zoom Level Display */}
      <div className="flex items-center gap-2">
        <span className="tracking-wide text-xs font-medium uppercase text-gray-600">
          Zoom
        </span>
        <div className="min-w-[60px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-800">
          {Math.round(state.currentZoomLevel * 100)}%
        </div>
      </div>

      <div className="h-6 w-px bg-gray-200"></div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          onClick={zoom.zoomOut}
          title="Zoom Out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M7 10l6 0" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          onClick={zoom.zoomIn}
          title="Zoom In"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M7 10l6 0" />
            <path d="M10 7l0 6" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
        <button
          className="ml-1 flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
          title="Reset Zoom to Fit Page"
        >
          Reset
        </button>
      </div>

      {/* Conditionally render Marquee Zoom toggle */}
      {withMarqueeZoom && (
        <>
          <div className="h-6 w-px bg-gray-200"></div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
            onClick={zoom.toggleMarqueeZoom}
            title="Toggle Area Zoom"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M15 13v4" />
              <path d="M13 15h4" />
              <path d="M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
              <path d="M22 22l-3 -3" />
              <path d="M6 18h-1a2 2 0 0 1 -2 -2v-1" />
              <path d="M3 11v-1" />
              <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
              <path d="M10 3h1" />
              <path d="M15 3h1a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

export const PDFViewer = ({ withMarqueeZoom = false }: PDFViewerProps) => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(() => {
    const basePlugins: PluginBatchRegistrations = [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
    ]

    if (withMarqueeZoom) {
      basePlugins.push(
        createPluginRegistration(InteractionManagerPluginPackage),
      )
    }

    return basePlugins
  }, [withMarqueeZoom])

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>
  }

  return (
    <div style={{ height: '500px' }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <div className="flex h-full flex-col">
                    <ZoomToolbar
                      documentId={activeDocumentId}
                      withMarqueeZoom={withMarqueeZoom}
                    />
                    <div className="flex-grow" style={{ position: 'relative' }}>
                      <Viewport
                        documentId={activeDocumentId}
                        style={{
                          backgroundColor: '#f1f3f5',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                        }}
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ width, height, pageIndex }) => {
                            const pageLayers = (
                              <>
                                <RenderLayer
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                />
                                <TilingLayer
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                />
                                {withMarqueeZoom && (
                                  <MarqueeZoom
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  />
                                )}
                              </>
                            )

                            if (withMarqueeZoom) {
                              return (
                                <PagePointerProvider
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                >
                                  {pageLayers}
                                </PagePointerProvider>
                              )
                            }

                            return (
                              <div
                                style={{
                                  width,
                                  height,
                                  position: 'relative',
                                }}
                              >
                                {pageLayers}
                              </div>
                            )
                          }}
                        />
                      </Viewport>
                    </div>
                  </div>
                )
              }
            </DocumentContent>
          )
        }
      </EmbedPDF>
    </div>
  )
}
