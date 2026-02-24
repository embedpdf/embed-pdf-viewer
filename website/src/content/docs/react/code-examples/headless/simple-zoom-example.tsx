'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useMemo } from 'react'
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
import {
  useZoom,
  ZoomPluginPackage,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react'
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface ZoomToolbarProps {
  documentId: string
}

const ZoomToolbar = ({ documentId }: ZoomToolbarProps) => {
  const { provides: zoom, state } = useZoom(documentId)

  if (!zoom) return null

  const zoomPercentage = Math.round(state.currentZoomLevel * 100)

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Zoom
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={zoom.zoomOut}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>

        {/* Zoom level indicator */}
        <div className="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600">
          <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">
            {zoomPercentage}%
          </span>
        </div>

        <button
          onClick={zoom.zoomIn}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>

        <button
          onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
          className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Reset Zoom to Fit Page"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Reset</span>
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
        initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
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
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading PDF Engine...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoaded }) =>
              isLoaded && (
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* Toolbar */}
                  <ZoomToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ width, height, pageIndex }) => (
                          <div
                            style={{
                              width,
                              height,
                              position: 'relative',
                            }}
                          >
                            <RenderLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                            <TilingLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                          </div>
                        )}
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
  )
}
