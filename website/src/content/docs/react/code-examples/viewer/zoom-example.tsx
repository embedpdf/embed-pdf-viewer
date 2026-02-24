'use client'
import {
  PDFViewer,
  PDFViewerRef,
  ZoomPlugin,
  ZoomMode,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react'

interface ZoomExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function ZoomExample({
  themePreference = 'light',
}: ZoomExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  const getZoomPlugin = async () => {
    const registry = await viewerRef.current?.registry
    return registry?.getPlugin<ZoomPlugin>('zoom')?.provides()
  }

  const handleZoomIn = async () => {
    const zoom = await getZoomPlugin()
    // Zoom in on the active document
    zoom?.forDocument('zoom-doc').zoomIn()
  }

  const handleZoomOut = async () => {
    const zoom = await getZoomPlugin()
    zoom?.forDocument('zoom-doc').zoomOut()
  }

  const handleFitWidth = async () => {
    const zoom = await getZoomPlugin()
    zoom?.forDocument('zoom-doc').requestZoom(ZoomMode.FitWidth)
  }

  const handleFitPage = async () => {
    const zoom = await getZoomPlugin()
    zoom?.forDocument('zoom-doc').requestZoom(ZoomMode.FitPage)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
        <span className="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          External Controls:
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleZoomIn}
            className="rounded p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={handleZoomOut}
            className="rounded p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <div className="mx-2 h-6 w-px self-center bg-gray-300 dark:bg-gray-600" />
          <button
            onClick={handleFitWidth}
            className="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Fit Width
          </button>
          <button
            onClick={handleFitPage}
            className="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Fit Page
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            zoom: {
              // Set initial zoom level
              defaultZoomLevel: ZoomMode.FitPage,
            },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'zoom-doc',
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
