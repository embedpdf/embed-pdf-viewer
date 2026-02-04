'use client'
import {
  PDFViewer,
  PDFViewerRef,
  ExportPlugin,
} from '@embedpdf/react-pdf-viewer'
import { useEffect, useRef, useState } from 'react'
import { Download, CloudUpload, Loader2, Check } from 'lucide-react'
import { ignore } from '@embedpdf/models'

interface ExportExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function ExportExample({
  themePreference = 'light',
}: ExportExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle')

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  const getExportScope = async () => {
    const registry = await viewerRef.current?.registry
    if (!registry) return null

    const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides()

    if (exportPlugin) {
      return exportPlugin.forDocument('ebook')
    }
    return null
  }

  const handleDownload = async () => {
    const scope = await getExportScope()
    scope?.download()
  }

  const handleSaveToServer = async () => {
    const scope = await getExportScope()
    if (!scope) return

    setIsSaving(true)

    // 1. Get the raw PDF buffer (includes all annotations/changes)
    const arrayBuffer = await scope.saveAsCopy().toPromise()

    const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
    const file = new File([blob], 'saved-document.pdf')

    // 3. Mock Upload (Replace with your actual API call)
    // await fetch('/api/documents/upload', { method: 'POST', body: formData })
    await new Promise((resolve) => setTimeout(resolve, 1500)) // Fake delay

    console.log(`Successfully prepared ${file.size} bytes for upload.`)
    setSaveStatus('success')
    setTimeout(() => setSaveStatus('idle'), 3000)
    setIsSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          <Download size={16} />
          Download PDF
        </button>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

        <button
          onClick={handleSaveToServer}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saveStatus === 'success' ? (
            <Check size={16} />
          ) : (
            <CloudUpload size={16} />
          )}
          {isSaving
            ? 'Saving...'
            : saveStatus === 'success'
              ? 'Saved!'
              : 'Save to Server'}
        </button>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'ebook',
                },
              ],
            },
            export: {
              defaultFileName: 'my-ebook.pdf',
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
