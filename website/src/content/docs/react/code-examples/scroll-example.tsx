'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useEffect, useState } from 'react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import {
  Scroller,
  ScrollPluginPackage,
  useScroll,
} from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage, {
    initialPage: 10,
  }),
  createPluginRegistration(RenderPluginPackage),
]

const PageNavigation = ({ documentId }: { documentId: string }) => {
  const { provides: scroll, state } = useScroll(documentId)
  const [pageInput, setPageInput] = useState(String(state.currentPage))

  useEffect(() => {
    setPageInput(String(state.currentPage))
  }, [state.currentPage])

  const handleGoToPage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const pageNumber = parseInt(pageInput, 10)
    if (pageNumber >= 1 && pageNumber <= state.totalPages) {
      scroll?.scrollToPage({ pageNumber })
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      {/* Previous button */}
      <button
        onClick={() => scroll?.scrollToPreviousPage()}
        disabled={state.currentPage <= 1}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title="Previous Page"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Page input */}
      <form onSubmit={handleGoToPage} className="flex items-center gap-2">
        <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          Page
        </span>
        <input
          type="number"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          min={1}
          max={state.totalPages}
          className="h-8 w-14 rounded-md border-0 bg-gray-100 px-2 text-center font-mono text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300"
        />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          of {state.totalPages}
        </span>
      </form>

      {/* Next button */}
      <button
        onClick={() => scroll?.scrollToNextPage()}
        disabled={state.currentPage >= state.totalPages}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title="Next Page"
      >
        <ChevronRight size={18} />
      </button>
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
                  {/* Navigation Toolbar */}
                  <PageNavigation documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-[#e5e7eb]"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ pageIndex }) => (
                          <RenderLayer
                            documentId={activeDocumentId}
                            pageIndex={pageIndex}
                          />
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
