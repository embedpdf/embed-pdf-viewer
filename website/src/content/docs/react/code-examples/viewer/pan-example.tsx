'use client'
import { PDFViewer, PDFViewerRef, PanPlugin } from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect, useState } from 'react'
import { Hand, MousePointer2 } from 'lucide-react'

interface PanExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function PanExample({
  themePreference = 'light',
}: PanExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isPanMode, setIsPanMode] = useState(false)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Sync state with plugin events
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let cleanup: (() => void) | undefined

    const setupListener = async () => {
      const registry = await viewer.registry
      const panPlugin = registry.getPlugin<PanPlugin>('pan')?.provides()

      // Get capability for specific document
      const docPan = panPlugin?.forDocument('pan-doc')

      // Set initial state
      if (docPan) {
        setIsPanMode(docPan.isPanMode())

        // Listen for changes
        cleanup = docPan.onPanModeChange((isActive) => {
          setIsPanMode(isActive)
        })
      }
    }

    // Call setup when viewer is likely ready, or just try immediately
    // In a real app, you might wait for an onReady event
    setupListener()

    return () => cleanup?.()
  }, [])

  const togglePanMode = async () => {
    const registry = await viewerRef.current?.registry
    const panPlugin = registry?.getPlugin<PanPlugin>('pan')?.provides()
    panPlugin?.forDocument('pan-doc').togglePan()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
        <span className="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          Interaction Mode:
        </span>
        <button
          onClick={togglePanMode}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            !isPanMode
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <MousePointer2 size={16} />
          Select Text
        </button>
        <button
          onClick={togglePanMode}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            isPanMode
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <Hand size={16} />
          Pan (Hand Tool)
        </button>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            pan: {
              // Enable pan by default on mobile devices
              defaultMode: 'mobile',
            },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'pan-doc',
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
