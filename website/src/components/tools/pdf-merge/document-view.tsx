'use client'

import React, { useCallback } from 'react'
import { DocumentWithPages, DocumentPage } from './types'
import { VirtualScroller } from './virtual-scroller'
import { Button } from '../../button'
import { PdfEngine } from '@embedpdf/models'
import { X } from 'lucide-react'

interface DocumentViewProps {
  documents: Record<string, DocumentWithPages>
  onUpdatePages: (docId: string, updates: DocumentPage[]) => void
  onAddSelectedPages: () => void
  onCloseDocument: (docId: string) => void
  engine: PdfEngine
}

export const DocumentView: React.FC<DocumentViewProps> = ({
  documents,
  onUpdatePages,
  onAddSelectedPages,
  onCloseDocument,
  engine,
}) => {
  // Batch select/deselect all pages
  const handleBulkSelection = useCallback(
    (docId: string, shouldSelect: boolean) => {
      const doc = documents[docId]
      if (!doc) return

      // Create a single update with all pages
      const updatedPages = doc.pages.map((page) => ({
        ...page,
        selected: shouldSelect,
      }))

      // Send one batch update
      onUpdatePages(docId, updatedPages)
    },
    [documents, onUpdatePages],
  )

  if (Object.keys(documents).length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-700 shadow-lg">
          <svg
            className="h-6 w-6 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          Upload PDFs to get started
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Add PDF files to begin merging
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(documents).map(([docId, { doc, pages, fileName }]) => (
        <div key={docId} className="group relative">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-700 opacity-10 blur transition duration-300 group-hover:opacity-20 dark:opacity-30"></div>
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-md dark:bg-gray-900">
            <div className="p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-700 shadow-sm">
                    <svg
                      className="h-5 w-5 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-gray-900 dark:text-white">
                      {fileName || `Document ${docId.substring(0, 6)}`}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pages.length} page{pages.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleBulkSelection(docId, true)}
                      className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Select All
                    </Button>
                    <Button
                      onClick={() => handleBulkSelection(docId, false)}
                      className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Deselect All
                    </Button>
                  </div>
                  <Button
                    onClick={() => onCloseDocument(docId)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Close document"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <VirtualScroller
                items={pages}
                onUpdatePages={(updatedPages) =>
                  onUpdatePages(docId, updatedPages)
                }
                engine={engine}
                doc={doc}
              />

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={onAddSelectedPages}
                  className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-700 px-6 py-3 font-medium text-white transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:hover:shadow-purple-900/20"
                  disabled={!pages.some((page) => page.selected)}
                >
                  Add Selected Pages
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
