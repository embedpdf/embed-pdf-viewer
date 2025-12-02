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
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        Scroll
      </span>
      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Scroll buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={scrollToTop}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ChevronsUp size={14} />
          <span className="hidden sm:inline">Top</span>
        </button>
        <button
          onClick={scrollToMiddle}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <AlignCenterVertical size={14} />
          <span className="hidden sm:inline">Middle</span>
        </button>
        <button
          onClick={scrollToBottom}
          disabled={!viewport}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ChevronsDown size={14} />
          <span className="hidden sm:inline">Bottom</span>
        </button>
      </div>

      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Scroll activity indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full transition-colors duration-200 ${
            scrollActivity.isScrolling
              ? 'animate-pulse bg-green-500'
              : 'bg-gray-300 dark:bg-gray-600'
          } `}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
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
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500">
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
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* Toolbar */}
                  <ScrollToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-[#e5e7eb]"
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
