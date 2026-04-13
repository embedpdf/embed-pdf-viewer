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
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react'
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
import {
  FormPluginPackage,
  useFormCapability,
} from '@embedpdf/plugin-form/react'
import { Download, Loader2, Wand2, Trash2, ZoomIn, ZoomOut } from 'lucide-react'

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

const FormAutoFillToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: formCapability } = useFormCapability()
  const { provides: zoom } = useZoom(documentId)
  const { provides: exportApi } = useExport(documentId)

  const handleFillDemoData = () => {
    if (!formCapability) return
    const scope = formCapability.forDocument(documentId)

    const demoData: Record<string, string> = {
      First_Name: 'Jane',
      Last_Name: 'Doe',
      Email_Address: 'jane.doe@example.com',
      Phone_Number: '+1 (555) 123-4567',
      Home_Address: '123 Main Street',
      City: 'San Francisco',
      State: 'CA',
      Postal_Code: '94102',
      Department: 'Design',
      Employment_Type: 'Contract',
      Office_Location: 'San Francisco',
      Start_Date: '2026-04-01',
      Programming_Languages: 'TypeScript, Rust, Go',
      Framework_Tools: 'React, Node.js, Docker',
      Comments:
        'I would like to have a standing desk and a dual monitor setup.',
      Equipment_Laptop: 'Yes',
      Equipment_Monitor: 'Yes',
      Equipment_Keyboard: 'Yes',
      Equipment_Desk: 'Yes',
      Access_Repository: 'Yes',
      Access_Cloud: 'Yes',
      Access_Internal: 'Yes',
      Access_VPN: 'Yes',
      Terms: 'Yes',
      Preferred_Shift: '4f803c06-508d-4232-bd84-82452b6561f1',
      Work_Arrangement: 'd43ec6d3-9e8c-403f-98d7-e2c818070ac4',
    }

    scope.setFormValues(demoData)
  }

  const handleClearForm = () => {
    if (!formCapability) return
    const scope = formCapability.forDocument(documentId)

    const emptyData: Record<string, string> = {
      First_Name: '',
      Last_Name: '',
      Email_Address: '',
      Phone_Number: '',
      Home_Address: '',
      City: '',
      State: '',
      Postal_Code: '',
      Department: 'Engineering',
      Employment_Type: 'Full-time',
      Office_Location: 'New York',
      Start_Date: '',
      Programming_Languages: '',
      Framework_Tools: '',
      Comments: '',
      Equipment_Laptop: 'Off',
      Equipment_Monitor: 'Off',
      Equipment_Keyboard: 'Off',
      Equipment_Desk: 'Off',
      Access_Repository: 'Off',
      Access_Cloud: 'Off',
      Access_Internal: 'Off',
      Access_VPN: 'Off',
      Terms: 'Off',
      Preferred_Shift: '1a5963ac-8d1e-4c83-9a8b-da53700e46c1',
      Work_Arrangement: 'e424be12-71f7-4458-b1a3-a71a0b100729',
    }

    scope.setFormValues(emptyData)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleFillDemoData}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        >
          <Wand2 size={16} />
          Auto Fill Data
        </button>

        <button
          onClick={handleClearForm}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Trash2 size={16} />
          Clear Form
        </button>
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
          onClick={() => exportApi?.download()}
          disabled={!exportApi}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} />
          Download PDF
        </button>
      </div>
    </div>
  )
}

export const FormImportViewer = () => {
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
                  <FormAutoFillToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer */}
                  <div className="relative h-[420px] sm:h-[550px]">
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
