'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  LockModeType,
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
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react'
import {
  useZoom,
  ZoomPluginPackage,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react'
import {
  FormPluginPackage,
  useFormCapability,
} from '@embedpdf/plugin-form/react'
import { Loader2, ZoomIn, ZoomOut, Download } from 'lucide-react'
import { useEffect, useState } from 'react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: '/form.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ExportPluginPackage, {
    defaultFileName: 'form.pdf',
  }),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(AnnotationPluginPackage, {
    locked: { type: LockModeType.Include, categories: ['form'] },
  }),
  createPluginRegistration(FormPluginPackage),
]

const ZoomToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: zoom } = useZoom(documentId)
  const { provides: exportApi } = useExport(documentId)

  if (!zoom) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-1.5">
        <button
          onClick={zoom.zoomOut}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>

        <button
          onClick={zoom.zoomIn}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <button
        onClick={() => exportApi?.download()}
        disabled={!exportApi}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={16} />
        Download PDF
      </button>
    </div>
  )
}

const FormStateHeader = ({ documentId }: { documentId: string }) => {
  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Form State (JSON)
      </h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Fill the form on the left to see the state update here.
      </p>
    </div>
  )
}

const FormStateViewer = ({ documentId }: { documentId: string }) => {
  const { provides: formCapability } = useFormCapability()
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!formCapability) return

    const scope = formCapability.forDocument(documentId)

    setFormValues(scope.getFormValues())

    const unsubReady = scope.onFormReady(() =>
      setFormValues(scope.getFormValues()),
    )
    const unsubChange = scope.onFieldValueChange(() =>
      setFormValues(scope.getFormValues()),
    )

    return () => {
      unsubReady()
      unsubChange()
    }
  }, [formCapability, documentId])

  return (
    <div className="flex h-full min-h-[240px] flex-col overflow-hidden border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:border-l lg:border-t-0">
      <FormStateHeader documentId={documentId} />
      <div className="flex-1 overflow-auto p-4">
        {Object.keys(formValues).length > 0 ? (
          <pre className="text-xs text-gray-800 dark:text-gray-300">
            {JSON.stringify(formValues, null, 2)}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Loading form data...
          </div>
        )}
      </div>
    </div>
  )
}

export const FormViewer = () => {
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
                  <ZoomToolbar documentId={activeDocumentId} />
                  <div className="flex flex-col lg:h-[550px] lg:flex-row">
                    {/* Left side: PDF Viewer */}
                    <div className="relative h-[420px] sm:h-[550px] lg:h-auto lg:flex-1">
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

                    {/* Right side: JSON Viewer */}
                    <div className="w-full lg:w-1/3 lg:min-w-[250px] lg:max-w-[400px]">
                      <FormStateViewer documentId={activeDocumentId} />
                    </div>
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
