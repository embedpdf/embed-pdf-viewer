'use client'
import {
  PDFViewer,
  PDFViewerRef,
  SelectionPlugin,
  type SelectionScope,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { Copy, X } from 'lucide-react'

interface SelectionExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function SelectionExample({
  themePreference = 'light',
}: SelectionExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [selection, setSelection] = useState<SelectionScope | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Get selection capability once and subscribe to changes
  useEffect(() => {
    const cleanups: (() => void)[] = []

    viewerRef.current?.registry?.then((registry) => {
      const selectionPlugin = registry
        .getPlugin<SelectionPlugin>('selection')
        ?.provides()

      const docSelection = selectionPlugin?.forDocument('ebook')

      if (!docSelection) return

      setSelection(docSelection)

      // Subscribe to selection changes
      cleanups.push(
        docSelection.onSelectionChange((currentSelection) => {
          setHasSelection(!!currentSelection)
        }),
      )
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  const handleCopy = () => {
    selection?.copyToClipboard()
    setLastAction('Copied to clipboard!')
    setTimeout(() => setLastAction(null), 2000)
  }

  const handleClear = () => {
    selection?.clear()
    setLastAction('Selection cleared')
    setTimeout(() => setLastAction(null), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!hasSelection}
              className="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
            >
              <Copy size={16} />
              Copy
            </button>
            <button
              onClick={handleClear}
              disabled={!hasSelection}
              className="flex items-center gap-2 rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <X size={16} />
              Clear
            </button>
          </div>
          {lastAction && (
            <span className="animate-fade-in text-sm text-green-600 dark:text-green-400">
              {lastAction}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Select text in the PDF to enable buttons
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
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
