'use client'
import {
  PDFViewer,
  PDFViewerRef,
  DocumentManagerPlugin,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { FileUp, Globe, Layers } from 'lucide-react'

export default function DocumentLoadingExample() {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [docList, setDocList] = useState<{ id: string; name: string }[]>([])

  // Helper to access the plugin
  const getDocManager = async () => {
    const registry = await viewerRef.current?.registry
    return registry
      ?.getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides()
  }

  // Sync state with viewer events
  useEffect(() => {
    const sync = async () => {
      const docManager = await getDocManager()
      if (!docManager) return

      const updateList = () => {
        const docs = docManager.getOpenDocuments()
        setDocList(docs.map((d) => ({ id: d.id, name: d.name || 'Untitled' })))
        setActiveDocId(docManager.getActiveDocumentId())
      }

      // Listen for any document changes
      const unsub1 = docManager.onDocumentOpened(updateList)
      const unsub2 = docManager.onDocumentClosed(updateList)
      const unsub3 = docManager.onActiveDocumentChanged((e) =>
        setActiveDocId(e.currentDocumentId),
      )

      // Initial fetch
      updateList()

      return () => {
        unsub1()
        unsub2()
        unsub3()
      }
    }
    sync()
  }, [])

  const handleUrlLoad = async () => {
    const docManager = await getDocManager()
    docManager?.openDocumentUrl({
      url: 'https://snippet.embedpdf.com/ebook.pdf',
      documentId: 'ebook-demo', // Optional: fixed ID
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const docManager = await getDocManager()

    docManager?.openDocumentBuffer({
      buffer,
      name: file.name,
      autoActivate: true,
    })

    // Reset input
    e.target.value = ''
  }

  const handleSwitch = async (id: string) => {
    const docManager = await getDocManager()
    docManager?.setActiveDocument(id)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Control Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        {/* Load Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleUrlLoad}
            className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            <Globe size={16} /> Load URL
          </button>

          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600">
            <FileUp size={16} /> Upload Local
            <input
              type="file"
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* Document Switcher */}
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-gray-500" />
          <select
            value={activeDocId || ''}
            onChange={(e) => handleSwitch(e.target.value)}
            className="rounded-md border-gray-300 bg-white py-1.5 text-sm dark:bg-gray-700"
            disabled={docList.length === 0}
          >
            <option value="" disabled>
              Select Document...
            </option>
            {docList.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: 'light' },
            // Enable built-in tab bar
            tabBar: 'always',
            documentManager: {
              maxDocuments: 5,
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
