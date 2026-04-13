'use client'
import { PDFViewer, PDFViewerRef, PanPlugin } from '@embedpdf/react-pdf-viewer'
import { useEffect, useRef, useState } from 'react'
import { Hand, MousePointer2 } from 'lucide-react'

interface PanExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function PanExample({
  themePreference = 'light',
}: PanExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isPanMode, setIsPanMode] = useState(false)

  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let cleanup: (() => void) | undefined

    const setupListener = async () => {
      const registry = await viewer.registry
      const panPlugin = registry?.getPlugin<PanPlugin>('pan')?.provides()
      const docPan = panPlugin?.forDocument('pan-doc')

      if (docPan) {
        setIsPanMode(docPan.isPanMode())
        cleanup = docPan.onPanModeChange((isActive) => {
          setIsPanMode(isActive)
        })
      }
    }

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

      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            pan: {
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
