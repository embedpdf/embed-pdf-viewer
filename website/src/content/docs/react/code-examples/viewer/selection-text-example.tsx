'use client'
import {} from '@embedpdf/models'
import {
  PDFViewer,
  PDFViewerRef,
  SelectionPlugin,
  ignore,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'

interface SelectionTextExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function SelectionTextExample({
  themePreference = 'light',
}: SelectionTextExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [selectedText, setSelectedText] = useState<string>('')

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Subscribe to selection changes
  useEffect(() => {
    const cleanups: (() => void)[] = []

    viewerRef.current?.registry?.then((registry) => {
      const selectionPlugin = registry
        .getPlugin<SelectionPlugin>('selection')
        ?.provides()

      const docSelection = selectionPlugin?.forDocument('ebook')

      if (!docSelection) return

      cleanups.push(
        docSelection.onSelectionChange((currentSelection) => {
          if (currentSelection) {
            // Fetch text when selection exists
            docSelection.getSelectedText().wait((lines) => {
              setSelectedText(lines.join(' '))
            }, ignore)
          } else {
            setSelectedText('')
          }
        }),
      )
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Text Display */}
      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <span className="tracking-wider text-xs font-medium uppercase text-gray-500">
          Selected Text
        </span>
        <div className="min-h-[3rem] text-sm text-gray-800 dark:text-gray-200">
          {selectedText || (
            <span className="italic text-gray-400">
              Select text in the PDF to see it here...
            </span>
          )}
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
