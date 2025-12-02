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
import { Loader2, Type, Square, Trash2, Check, AlertCircle } from 'lucide-react'

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

  const isMarkTextActive = state.activeType === RedactionMode.RedactSelection
  const isMarkAreaActive = state.activeType === RedactionMode.MarqueeRedact

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        Redact
      </span>
      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Mode buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => provides?.toggleRedactSelection()}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
            isMarkTextActive
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } `}
        >
          <Type size={14} />
          <span className="hidden sm:inline">Mark Text</span>
        </button>
        <button
          onClick={() => provides?.toggleMarqueeRedact()}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
            isMarkAreaActive
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          } `}
        >
          <Square size={14} />
          <span className="hidden sm:inline">Mark Area</span>
        </button>
      </div>

      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Pending count and apply */}
      <div className="flex items-center gap-2">
        {state.pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertCircle size={14} />
            {state.pendingCount} pending
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            No marks pending
          </span>
        )}
        <button
          onClick={handleApplyAll}
          disabled={state.pendingCount === 0 || isCommitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCommitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <Check size={14} />
              Apply All
            </>
          )}
        </button>
      </div>

      {/* Hint text */}
      {(isMarkTextActive || isMarkAreaActive) && (
        <span className="hidden animate-pulse text-xs text-blue-600 lg:inline dark:text-blue-400">
          {isMarkTextActive
            ? 'Select text to mark for redaction'
            : 'Draw a rectangle to mark for redaction'}
        </span>
      )}
    </div>
  )
}

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
        className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        style={{
          position: 'absolute',
          top: rect.size.height + 8,
          left: 0,
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() =>
            provides?.commitPending(context.item.page, context.item.id)
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
        >
          <Check size={12} />
          Apply
        </button>
        <button
          onClick={() =>
            provides?.removePending(context.item.page, context.item.id)
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Trash2 size={12} />
          Remove
        </button>
      </div>
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
                <div
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                  style={{ userSelect: 'none' }}
                >
                  {/* Toolbar */}
                  <RedactionToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[450px] sm:h-[550px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-[#e5e7eb]"
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
                </div>
              )
            }
          </DocumentContent>
        )
      }
    </EmbedPDF>
  )
}
