'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF, useCapability } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { PdfEngine } from '@embedpdf/models'
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
import type { ScrollPlugin } from '@embedpdf/plugin-scroll'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Loader2, ChevronLeft, ChevronRight, Play } from 'lucide-react'

// The page to scroll to when the document loads
const INITIAL_PAGE = 3

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
]

/**
 * This component scrolls to a specific page when the document layout is ready.
 * It uses the `onLayoutReady` event from the scroll capability.
 */
const ScrollToPageOnLoad = ({
  documentId,
  initialPage,
}: {
  documentId: string
  initialPage: number
}) => {
  const { provides: scrollCapability } = useCapability<ScrollPlugin>('scroll')

  useEffect(() => {
    if (!scrollCapability) return

    // Subscribe to the layoutReady event
    const unsubscribe = scrollCapability.onLayoutReady((event) => {
      // Only scroll on the initial layout (not on tab switches)
      if (event.documentId === documentId && event.isInitial) {
        scrollCapability.forDocument(documentId).scrollToPage({
          pageNumber: initialPage,
          behavior: 'instant', // Use 'instant' for initial load
        })
      }
    })

    return unsubscribe
  }, [scrollCapability, documentId, initialPage])

  return null
}

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
    <div className="flex items-center justify-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => scroll?.scrollToPreviousPage()}
        disabled={state.currentPage <= 1}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Previous Page"
      >
        <ChevronLeft size={18} />
      </button>

      <form onSubmit={handleGoToPage} className="flex items-center gap-2">
        <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
          Page
        </span>
        <input
          type="number"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          min={1}
          max={state.totalPages}
          className="h-8 w-14 rounded-md border-0 bg-white px-2 text-center font-mono text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600"
        />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          of {state.totalPages}
        </span>
      </form>

      <button
        onClick={() => scroll?.scrollToNextPage()}
        disabled={state.currentPage >= state.totalPages}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Next Page"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

const ViewerWithInitialPage = ({ engine }: { engine: PdfEngine }) => {
  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoaded }) =>
              isLoaded && (
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* This component handles scrolling to the initial page */}
                  <ScrollToPageOnLoad
                    documentId={activeDocumentId}
                    initialPage={INITIAL_PAGE}
                  />

                  <PageNavigation documentId={activeDocumentId} />

                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
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

export const PDFViewerWithInitialPage = () => {
  const { engine, isLoading: isEngineLoading } = usePdfiumEngine()
  const [showViewer, setShowViewer] = useState(false)

  if (!showViewer) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] flex-col items-center justify-center gap-4">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Click the button below to load the PDF viewer.
            <br />
            It will automatically scroll to{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              page {INITIAL_PAGE}
            </span>{' '}
            on load.
          </p>
          <button
            onClick={() => setShowViewer(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Play size={16} />
            Load Viewer & Scroll to Page {INITIAL_PAGE}
          </button>
        </div>
      </div>
    )
  }

  if (isEngineLoading || !engine) {
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

  return <ViewerWithInitialPage engine={engine} />
}
