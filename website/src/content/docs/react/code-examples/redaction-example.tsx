'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import {
  RedactionLayer,
  RedactionMode,
  RedactionPluginPackage,
  useRedaction,
  RedactionSelectionMenuProps,
} from '@embedpdf/plugin-redaction/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
} from '@embedpdf/plugin-selection/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { useState } from 'react'

// 1. Register plugins, including Redaction and its dependencies
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(RedactionPluginPackage, {
    drawBlackBoxes: true,
  }),
]

// 2. Create a toolbar to manage redaction
const RedactionToolbar = ({ documentId }: { documentId: string }) => {
  const { state, provides } = useRedaction(documentId)
  const [isCommitting, setIsCommitting] = useState(false)

  const handleApplyAll = () => {
    if (!provides || isCommitting) return
    setIsCommitting(true)
    provides.commitAllPending().wait(
      () => setIsCommitting(false),
      () => setIsCommitting(false),
    )
  }

  return (
    <div className="mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <button
        onClick={() => provides?.toggleRedactSelection()}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          state.activeType === RedactionMode.RedactSelection
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        Mark Text
      </button>
      <button
        onClick={() => provides?.toggleMarqueeRedact()}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          state.activeType === RedactionMode.MarqueeRedact
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        Mark Area
      </button>
      <div className="h-6 w-px bg-gray-200"></div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">
          {state.pendingCount} marks pending
        </span>
        <button
          onClick={handleApplyAll}
          disabled={state.pendingCount === 0 || isCommitting}
          className="rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {isCommitting ? 'Applying...' : 'Apply All'}
        </button>
      </div>
    </div>
  )
}

// 3. Define a custom menu for selected redaction marks
const RedactionMenu = ({
  documentId,
  context,
  selected,
  menuWrapperProps,
  rect,
}: RedactionSelectionMenuProps & { documentId: string }) => {
  const { provides } = useRedaction(documentId)
  if (!selected) return null

  return (
    <div {...menuWrapperProps}>
      <div
        className="flex cursor-default gap-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
        style={{
          position: 'absolute',
          top: rect.size.height + 10,
          left: 0,
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() =>
            provides?.commitPending(context.item.page, context.item.id)
          }
          className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 active:bg-red-700"
        >
          Apply
        </button>
        <button
          onClick={() =>
            provides?.removePending(context.item.page, context.item.id)
          }
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 active:bg-gray-300"
        >
          Remove
        </button>
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
    <div
      style={{
        height: '600px',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <>
                    <RedactionToolbar documentId={activeDocumentId} />
                    <div
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <Viewport
                        documentId={activeDocumentId}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: '#f1f3f5',
                        }}
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ width, height, pageIndex }) => (
                            <PagePointerProvider
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            >
                              <RenderLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                style={{ pointerEvents: 'none' }}
                              />
                              <SelectionLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                              <RedactionLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                selectionMenu={(props) => (
                                  <RedactionMenu
                                    documentId={activeDocumentId}
                                    {...props}
                                  />
                                )}
                              />
                            </PagePointerProvider>
                          )}
                        />
                      </Viewport>
                    </div>
                  </>
                )
              }
            </DocumentContent>
          )
        }
      </EmbedPDF>
    </div>
  )
}
