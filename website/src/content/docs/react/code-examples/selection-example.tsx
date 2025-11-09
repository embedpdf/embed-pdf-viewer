'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useEffect, useState } from 'react'

// Import essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContext,
  DocumentContent,
  DocumentManagerPlugin,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  PagePointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/react'

// Import Selection plugin
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
  SelectionRangeX,
} from '@embedpdf/plugin-selection/react'
import { ignore } from '@embedpdf/models'

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage), // Required for Selection
  createPluginRegistration(SelectionPluginPackage),
]

// 2. Create a toolbar to interact with the selection
export const SelectionToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: selectionCapability } = useSelectionCapability()
  const [hasSelection, setHasSelection] = useState(false)

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
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <button
        onClick={handleCopy}
        disabled={!hasSelection}
        className="flex h-8 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        title="Copy Selected Text"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy Text
      </button>
    </div>
  )
}

// 3. Create the selected text display panel
export const SelectedTextPanel = ({ documentId }: { documentId: string }) => {
  const { provides: selectionCapability } = useSelectionCapability()
  const [hasSelection, setHasSelection] = useState(false)
  const [selectedText, setSelectedText] = useState('')

  // This effect updates the UI state
  useEffect(() => {
    if (!selectionCapability) return
    const selection = selectionCapability.forDocument(documentId)
    const unsubscribe = selection.onSelectionChange(
      (selectionRange: SelectionRangeX | null) => {
        setHasSelection(!!selectionRange)
        // If the selection is cleared, also clear the displayed text
        if (!selectionRange) {
          setSelectedText('')
        }
      },
    )
    return unsubscribe
  }, [selectionCapability, documentId])

  // This effect fetches the text content only when the selection is finished
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
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="m-0 text-xs font-medium uppercase text-gray-500">
        Selected Text:
      </p>
      <div className="mt-2">
        {hasSelection ? (
          <div className="m-0 w-full whitespace-pre-line break-words text-sm text-gray-800">
            {selectedText || 'Loading...'}
          </div>
        ) : (
          <p className="m-0 text-sm italic text-gray-400">
            Select text in the PDF to see it here
          </p>
        )}
      </div>
    </div>
  )
}

// 4. Create the main viewer component
export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>
  }

  return (
    <EmbedPDF
      engine={engine}
      plugins={plugins}
      onInitialized={async (registry) => {
        registry
          .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
          ?.provides()
          ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
      }}
    >
      <DocumentContext>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <>
                    <div style={{ height: '500px', userSelect: 'none' }}>
                      <div className="flex h-full flex-col gap-4">
                        <SelectionToolbar documentId={activeDocumentId} />
                        <div className="relative flex w-full flex-1 overflow-hidden">
                          <Viewport
                            documentId={activeDocumentId}
                            className="flex-grow bg-gray-100"
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
                      </div>
                    </div>
                    <SelectedTextPanel documentId={activeDocumentId} />
                  </>
                )
              }
            </DocumentContent>
          )
        }
      </DocumentContext>
    </EmbedPDF>
  )
}
