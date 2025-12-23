'use client'
import {
  PDFViewer,
  PDFViewerRef,
  SpreadPlugin,
  SpreadMode,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect, useState } from 'react'
import { File, BookOpen, Book } from 'lucide-react'

interface SpreadExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function SpreadExample({
  themePreference = 'light',
}: SpreadExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [currentMode, setCurrentMode] = useState<SpreadMode>(SpreadMode.None)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  const setSpreadMode = async (mode: SpreadMode) => {
    const registry = await viewerRef.current?.registry
    const spreadPlugin = registry?.getPlugin<SpreadPlugin>('spread')?.provides()

    // Set mode for the active document
    const docSpread = spreadPlugin?.forDocument('spread-doc')
    docSpread?.setSpreadMode(mode)

    // In a real app, you might sync this with an event listener
    setCurrentMode(mode)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
        <span className="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          Layout Mode:
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setSpreadMode(SpreadMode.None)}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              currentMode === SpreadMode.None
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            <File size={16} />
            Single Page
          </button>
          <button
            onClick={() => setSpreadMode(SpreadMode.Odd)}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              currentMode === SpreadMode.Odd
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            <BookOpen size={16} />
            Two-Page (Odd)
          </button>
          <button
            onClick={() => setSpreadMode(SpreadMode.Even)}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              currentMode === SpreadMode.Even
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            <Book size={16} />
            Two-Page (Even)
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            spread: {
              // Set initial spread mode
              defaultSpreadMode: SpreadMode.None,
            },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'spread-doc',
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
