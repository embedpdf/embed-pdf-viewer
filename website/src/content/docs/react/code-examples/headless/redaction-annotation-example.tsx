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
  AnnotationLayer,
  AnnotationPluginPackage,
  AnnotationSelectionMenuProps,
  isRedact,
  useAnnotation,
} from '@embedpdf/plugin-annotation/react'
import {
  RedactionLayer,
  RedactionMode,
  RedactionPluginPackage,
  useRedaction,
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
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import { useState } from 'react'
import { Loader2, Check, AlertCircle, Crosshair, Trash2 } from 'lucide-react'

// Color options for redaction annotations
const REDACTION_COLORS = [
  { name: 'Red', value: '#E44234' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Purple', value: '#9333EA' },
]

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(AnnotationPluginPackage),
  createPluginRegistration(RedactionPluginPackage, {
    // Enable annotation mode - redactions are stored as REDACT annotations
    useAnnotationMode: true,
  }),
]

const AnnotationMenu = ({
  documentId,
  context,
  selected,
  menuWrapperProps,
  rect,
}: AnnotationSelectionMenuProps & { documentId: string }) => {
  const { provides: annotationApi } = useAnnotation(documentId)
  if (!selected) return null

  return (
    <div {...menuWrapperProps}>
      <div
        className="flex gap-1 rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        style={{
          position: 'absolute',
          top: rect.size.height + 8,
          left: 0,
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() =>
            annotationApi?.deleteAnnotation(
              context.pageIndex,
              context.annotation.object.id,
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  )
}

const RedactionToolbar = ({ documentId }: { documentId: string }) => {
  const { state, provides } = useRedaction(documentId)
  const { state: annotationState, provides: annotationApi } =
    useAnnotation(documentId)
  const [isCommitting, setIsCommitting] = useState(false)

  // Get selected REDACT annotation from state
  const selectedRedact = (() => {
    if (!annotationState.selectedUid) return null
    const tracked = annotationState.byUid[annotationState.selectedUid]
    if (!tracked) return null
    if (!isRedact(tracked)) return null
    return tracked.object
  })()

  const selectedAnnotationId = selectedRedact?.id ?? null
  const selectedColor = selectedRedact?.strokeColor ?? null

  const handleApplyAll = () => {
    if (!provides || isCommitting) return
    setIsCommitting(true)
    provides.commitAllPending().wait(
      () => setIsCommitting(false),
      () => setIsCommitting(false),
    )
  }

  const handleColorChange = (color: string) => {
    if (!annotationApi || !selectedRedact) return

    // Update both strokeColor (mark border) and color (overlay fill)
    annotationApi.updateAnnotation(
      selectedRedact.pageIndex,
      selectedRedact.id,
      {
        strokeColor: color,
        color: color,
      },
    )
  }

  // In annotation mode, use the unified toggleRedact() method
  const isRedactActive = state.activeType === RedactionMode.Redact

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Annotation Mode
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Unified redact mode button */}
      <button
        onClick={() => provides?.toggleRedact()}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all ${
          isRedactActive
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100'
        }`}
      >
        <Crosshair size={14} />
        <span className="hidden sm:inline">Redact</span>
      </button>

      {/* Color picker - visible when annotation is selected */}
      {selectedAnnotationId && (
        <>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Color:
            </span>
            {REDACTION_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => handleColorChange(c.value)}
                className={`h-5 w-5 rounded-full transition-all ${
                  selectedColor === c.value
                    ? 'ring-2 ring-gray-800 ring-offset-1 dark:ring-gray-200'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>
        </>
      )}

      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Pending count and apply */}
      <div className="flex items-center gap-2">
        {state.pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertCircle size={14} />
            {state.pendingCount} pending
          </span>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            No marks pending
          </span>
        )}
        <button
          onClick={handleApplyAll}
          disabled={state.pendingCount === 0 || isCommitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm ring-1 ring-red-600 transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
      {isRedactActive && (
        <span className="hidden animate-pulse text-xs text-blue-600 dark:text-blue-400 lg:inline">
          Select text or draw a rectangle to mark for redaction
        </span>
      )}
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
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
                  className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                  style={{ userSelect: 'none' }}
                >
                  {/* Toolbar */}
                  <RedactionToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[450px] sm:h-[550px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
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
                              style={{ pointerEvents: 'none' }}
                            />
                            <SelectionLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                            {/* AnnotationLayer renders REDACT annotations */}
                            <AnnotationLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                              selectionMenu={(props) => (
                                <AnnotationMenu
                                  documentId={activeDocumentId}
                                  {...props}
                                />
                              )}
                            />
                            {/* RedactionLayer renders marquee/selection UI */}
                            <RedactionLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
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
