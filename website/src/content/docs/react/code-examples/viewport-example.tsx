'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  Viewport,
  ViewportPluginPackage,
  useViewportCapability,
  useViewportScrollActivity,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  Loader2,
  ChevronsUp,
  ChevronsDown,
  AlignCenterVertical,
} from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage, {
    viewportGap: 20,
  }),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
]

const ScrollToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: viewportCapability } = useViewportCapability()
  const scrollActivity = useViewportScrollActivity(documentId)

  const viewport = viewportCapability?.forDocument(documentId)

  const scrollToTop = () => {
    viewport?.scrollTo({ x: 0, y: 0, behavior: 'smooth' })
  }

  const scrollToMiddle = () => {
    if (!viewport) return
    const metrics = viewport.getMetrics()
    viewport.scrollTo({
      y: metrics.scrollHeight / 2,
      x: 0,
      behavior: 'smooth',
      center: true,
    })
  }

  const scrollToBottom = () => {
    if (!viewport) return
    const metrics = viewport.getMetrics()
    viewport.scrollTo({ y: metrics.scrollHeight, x: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Scroll
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Scroll buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={scrollToTop}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <ChevronsUp size={14} />
          <span className="hidden sm:inline">Top</span>
        </button>
        <button
          onClick={scrollToMiddle}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <AlignCenterVertical size={14} />
          <span className="hidden sm:inline">Middle</span>
        </button>
        <button
          onClick={scrollToBottom}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <ChevronsDown size={14} />
          <span className="hidden sm:inline">Bottom</span>
        </button>
      </div>

      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Scroll activity indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full transition-colors duration-200 ${
            scrollActivity.isScrolling
              ? 'animate-pulse bg-green-500'
              : 'bg-gray-300 dark:bg-gray-600'
          } `}
        />
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {scrollActivity.isScrolling ? 'Scrolling...' : 'Idle'}
        </span>
      </div>
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

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
                  <ScrollToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ width, height, pageIndex }) => (
                          <div style={{ width, height, position: 'relative' }}>
                            <RenderLayer
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
