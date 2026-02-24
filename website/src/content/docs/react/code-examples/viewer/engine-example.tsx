'use client'
import {
  DocumentManagerPlugin,
  PDFViewer,
  PDFViewerRef,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect, useCallback } from 'react'

interface EngineExampleProps {
  themePreference?: 'light' | 'dark'
}

interface DocumentMetadata {
  title?: string | null
  author?: string | null
  subject?: string | null
  creator?: string | null
  producer?: string | null
  creationDate?: Date | null
  modificationDate?: Date | null
}

export default function EngineExample({
  themePreference = 'light',
}: EngineExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isReady, setIsReady] = useState(false)
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  const getDocumentInfo = useCallback(async () => {
    const registry = await viewerRef.current?.registry
    if (!registry) return

    setIsLoading(true)

    try {
      const documentManager = registry
        .getPlugin<DocumentManagerPlugin>('document-manager')
        ?.provides()
      const engine = registry.getEngine()

      if (engine && documentManager) {
        const document = documentManager.getActiveDocument()
        if (document) {
          // Get page count directly from the document
          setPageCount(document.pageCount)

          // Get metadata using the engine
          const meta = await engine.getMetadata(document).toPromise()
          setMetadata(meta)
        }
      }
    } catch (error) {
      console.error('Error getting document info:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleReady = useCallback(() => {
    setIsReady(true)
  }, [])

  const formatDate = (date?: Date | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {isReady ? 'Engine ready' : 'Loading...'}
            </span>
          </div>

          <button
            onClick={getDocumentInfo}
            disabled={!isReady || isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Get Document Info'}
          </button>
        </div>

        {/* Metadata Display */}
        {metadata && (
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-600 dark:bg-gray-700 sm:grid-cols-3">
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Title
              </span>
              <p className="truncate text-gray-900 dark:text-gray-100">
                {metadata.title || '—'}
              </p>
            </div>
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Author
              </span>
              <p className="truncate text-gray-900 dark:text-gray-100">
                {metadata.author || '—'}
              </p>
            </div>
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Pages
              </span>
              <p className="text-gray-900 dark:text-gray-100">
                {pageCount ?? '—'}
              </p>
            </div>
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Creator
              </span>
              <p className="truncate text-gray-900 dark:text-gray-100">
                {metadata.creator || '—'}
              </p>
            </div>
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Created
              </span>
              <p className="text-gray-900 dark:text-gray-100">
                {formatDate(metadata.creationDate)}
              </p>
            </div>
            <div>
              <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Modified
              </span>
              <p className="text-gray-900 dark:text-gray-100">
                {formatDate(metadata.modificationDate)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Viewer Container */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          onReady={handleReady}
          config={{
            src: 'https://snippet.embedpdf.com/ebook.pdf',
            theme: { preference: themePreference },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
