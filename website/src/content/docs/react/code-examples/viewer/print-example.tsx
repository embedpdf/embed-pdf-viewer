'use client'
import {
  PDFViewer,
  PDFViewerRef,
  PrintPlugin,
  ignore,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { Printer } from 'lucide-react'

interface PrintExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function PrintExample({
  themePreference = 'light',
}: PrintExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  const handlePrint = async () => {
    if (isPrinting) return

    const registry = await viewerRef.current?.registry
    const printPlugin = registry?.getPlugin<PrintPlugin>('print')?.provides()

    // Get print capability for the specific document
    const docPrint = printPlugin?.forDocument('ebook')

    if (!docPrint) return

    setIsPrinting(true)

    // Trigger print and wait for dialog to open
    docPrint.print().wait(
      () => setIsPrinting(false), // Success
      (err) => {
        console.error('Print failed', err)
        setIsPrinting(false)
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
          >
            <Printer size={18} />
            {isPrinting ? 'Preparing...' : 'Print Document'}
          </button>

          {isPrinting && (
            <span className="animate-pulse text-sm text-gray-500 dark:text-gray-400">
              Generating print version...
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
