'use client'
import {
  PDFViewer,
  PDFViewerRef,
  ScrollPlugin,
  type ScrollCapability,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface ScrollExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function ScrollExample({
  themePreference = 'light',
}: ScrollExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [scroll, setScroll] = useState<ScrollCapability | null>(null)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Get scroll capability once and subscribe to page changes
  useEffect(() => {
    const cleanups: (() => void)[] = []

    viewerRef.current?.registry?.then((registry) => {
      const scrollCapability = registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
      if (!scrollCapability) return

      setScroll(scrollCapability)

      cleanups.push(
        scrollCapability.onLayoutReady((event) => {
          setCurrentPage(event.pageNumber)
          setTotalPages(event.totalPages)
        }),
      )

      cleanups.push(
        scrollCapability.onPageChange((event) => {
          setCurrentPage(event.pageNumber)
          setTotalPages(event.totalPages)
        }),
      )
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  // Get scoped API for the document
  const doc = scroll?.forDocument('ebook')

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => doc?.scrollToPreviousPage()}
            disabled={currentPage <= 1}
            className="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="font-mono text-sm font-medium">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => doc?.scrollToNextPage()}
            disabled={currentPage >= totalPages}
            className="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'ebook',
                },
              ],
            },
            scroll: {
              defaultPageGap: 20,
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
