'use client'
import {
  PDFViewer,
  PDFViewerRef,
  ScrollPlugin,
  type ScrollCapability,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'

interface ScrollInitialPageExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function ScrollInitialPageExample({
  themePreference = 'light',
}: ScrollInitialPageExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [status, setStatus] = useState('Loading...')

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Subscribe to layout ready event to perform initial scroll
  useEffect(() => {
    const cleanups: (() => void)[] = []

    viewerRef.current?.registry?.then((registry) => {
      const scrollCapability = registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
      if (!scrollCapability) return

      cleanups.push(
        scrollCapability.onLayoutReady((event) => {
          // Check if this is the initial layout for our document
          if (event.documentId === 'ebook' && event.isInitial) {
            setStatus('Layout ready! Jumping to page 3...')

            // Wait a brief tick to ensure UI is ready, then scroll
            setTimeout(() => {
              scrollCapability.forDocument('ebook').scrollToPage({
                pageNumber: 3,
                behavior: 'instant', // Instant jump without animation
              })
              setStatus('Scrolled to Page 3')
            }, 0)
          }
        }),
      )
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Status Bar */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
        </div>
        <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
          {status}
        </span>
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
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
