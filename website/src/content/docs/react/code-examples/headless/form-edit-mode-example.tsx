'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  LockModeType,
  useAnnotation,
} from '@embedpdf/plugin-annotation/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
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
import {
  useZoom,
  ZoomPluginPackage,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react'
import { FormPluginPackage } from '@embedpdf/plugin-form/react'
import { Loader2, Lock, LockOpen, ZoomIn, ZoomOut } from 'lucide-react'

const fillModeLock = {
  type: LockModeType.Include,
  categories: ['form'],
}

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: '/form.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(AnnotationPluginPackage, {
    locked: fillModeLock,
  }),
  createPluginRegistration(FormPluginPackage),
]

const isFillMode = (locked: { type: string; categories?: string[] }) =>
  locked.type === LockModeType.Include && locked.categories?.includes('form')

const ModeToolbar = ({ documentId }: { documentId: string }) => {
  const { state, provides } = useAnnotation(documentId)
  const { provides: zoom } = useZoom(documentId)
  const fillMode = isFillMode(state.locked)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            fillMode
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          }`}
        >
          {fillMode ? <Lock size={14} /> : <LockOpen size={14} />}
          {fillMode ? 'Fill Mode' : 'Design Mode'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => zoom?.zoomOut()}
            disabled={!zoom}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>

          <button
            onClick={() => zoom?.zoomIn()}
            disabled={!zoom}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <button
          onClick={() =>
            provides?.setLocked(
              fillMode ? { type: LockModeType.None } : fillModeLock,
            )
          }
          disabled={!provides}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {fillMode ? <LockOpen size={16} /> : <Lock size={16} />}
          {fillMode ? 'Switch to Design Mode' : 'Switch to Fill Mode'}
        </button>
      </div>
    </div>
  )
}

export const FormEditModeViewer = () => {
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
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <ModeToolbar documentId={activeDocumentId} />

                  <div
                    className="relative h-[420px] sm:h-[550px]"
                    style={{ userSelect: 'none' }}
                  >
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
                            <AnnotationLayer
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
