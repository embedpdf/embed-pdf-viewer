'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useEffect, useState } from 'react'

// Import essential plugins
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

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage, {
    // Optional: Set the page to open to
    initialPage: 10,
  }),
  createPluginRegistration(RenderPluginPackage),
]

// 2. Create a page navigation component using the new hook structure
export const PageNavigation = ({ documentId }: { documentId: string }) => {
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
    <div className="mb-4 mt-4 flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <button
        onClick={() => scroll?.scrollToPreviousPage()}
        disabled={state.currentPage <= 1}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
        title="Previous Page"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <form onSubmit={handleGoToPage} className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Page</span>
        <input
          type="number"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          min={1}
          max={state.totalPages}
          className="h-8 w-16 rounded-md border-gray-300 text-center text-sm shadow-sm"
        />
        <span className="text-sm font-medium text-gray-600">
          of {state.totalPages}
        </span>
      </form>
      <button
        onClick={() => scroll?.scrollToNextPage()}
        disabled={state.currentPage >= state.totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
        title="Next Page"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}

// 3. Create the main viewer component
export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

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
                    <PageNavigation documentId={activeDocumentId} />
                    <div className="relative flex w-full flex-1 overflow-hidden">
                      <Viewport
                        documentId={activeDocumentId}
                        className="flex-grow bg-gray-100"
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
    </div>
  )
}
