'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useEffect, useState } from 'react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  PagePointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
  SelectionRangeX,
} from '@embedpdf/plugin-selection/react'
import { ignore } from '@embedpdf/models'
import { Loader2, Copy, Check, Type } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
]

const SelectionToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: selectionCapability } = useSelectionCapability()
  const [hasSelection, setHasSelection] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selectionCapability) return
    const selection = selectionCapability.forDocument(documentId)
    const unsubscribe = selection.onSelectionChange(
      (selectionRange: SelectionRangeX | null) => {
        setHasSelection(!!selectionRange)
      },
    )
    return unsubscribe
  }, [selectionCapability, documentId])

  const handleCopy = () => {
    if (selectionCapability) {
      selectionCapability.forDocument(documentId).copyToClipboard()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <button
        onClick={handleCopy}
        disabled={!hasSelection}
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
          hasSelection
            ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600'
            : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
        } `}
        title="Copy Selected Text"
      >
        {copied ? (
          <>
            <Check size={14} className="text-white" />
            Copied!
          </>
        ) : (
          <>
            <Copy size={14} />
            Copy Text
          </>
        )}
      </button>

      <span className="text-xs text-gray-500 dark:text-gray-400">
        {hasSelection
          ? 'Text selected — click to copy'
          : 'Click and drag to select text'}
      </span>
    </div>
  )
}

const SelectedTextPanel = ({ documentId }: { documentId: string }) => {
  const { provides: selectionCapability } = useSelectionCapability()
  const [hasSelection, setHasSelection] = useState(false)
  const [selectedText, setSelectedText] = useState('')

  useEffect(() => {
    if (!selectionCapability) return
    const selection = selectionCapability.forDocument(documentId)
    const unsubscribe = selection.onSelectionChange(
      (selectionRange: SelectionRangeX | null) => {
        setHasSelection(!!selectionRange)
        if (!selectionRange) {
          setSelectedText('')
        }
      },
    )
    return unsubscribe
  }, [selectionCapability, documentId])

  useEffect(() => {
    if (!selectionCapability) return
    const selection = selectionCapability.forDocument(documentId)
    const unsubscribe = selection.onEndSelection(() => {
      const textTask = selection.getSelectedText()
      textTask.wait((textLines) => {
        setSelectedText(textLines.join('\n'))
      }, ignore)
    })
    return unsubscribe
  }, [selectionCapability, documentId])

  return (
    <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <div className="mb-2 flex items-center gap-2">
        <Type size={14} className="text-gray-400" />
        <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          Selected Text
        </span>
      </div>

      {hasSelection ? (
        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
          <p className="m-0 whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-200">
            {selectedText || (
              <span className="italic text-gray-400 dark:text-gray-500">
                Loading...
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Type size={20} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select text in the PDF to see it here
          </p>
        </div>
      )}
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading PDF Engine...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoaded }) =>
              isLoaded && (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* Toolbar */}
                  <SelectionToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div
                    className="relative h-[400px] sm:h-[500px]"
                    style={{ userSelect: 'none' }}
                  >
                    <Viewport
                      documentId={activeDocumentId}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: '#e5e7eb',
                      }}
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ pageIndex }) => (
                          <PagePointerProvider
                            documentId={activeDocumentId}
                            pageIndex={pageIndex}
                          >
                            <RenderLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                              scale={1}
                              className="pointer-events-none"
                            />
                            <SelectionLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                          </PagePointerProvider>
                        )}
                      />
                    </Viewport>
                  </div>

                  {/* Selected Text Panel */}
                  <SelectedTextPanel documentId={activeDocumentId} />
                </div>
              )
            }
          </DocumentContent>
        )
      }
    </EmbedPDF>
  )
}
