'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationTool,
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
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models'
import {
  Loader2,
  Check,
  X,
  Pencil,
  Square,
  Highlighter,
  Trash2,
} from 'lucide-react'

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
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
]

const AnnotationToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: annotationApi, state } = useAnnotation(documentId)

  const handleDelete = () => {
    const selection = annotationApi?.getSelectedAnnotation()
    if (selection) {
      annotationApi?.deleteAnnotation(
        selection.object.pageIndex,
        selection.object.id,
      )
    }
  }

  const tools = [
    { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
    { id: 'stampCross', name: 'Cross', icon: X },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'square', name: 'Square', icon: Square },
    { id: 'highlight', name: 'Highlight', icon: Highlighter },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Tool buttons */}
      <div className="flex items-center gap-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon
          const isActive = state.activeToolId === tool.id
          return (
            <button
              key={tool.id}
              onClick={() =>
                annotationApi?.setActiveTool(isActive ? null : tool.id)
              }
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all ${
                isActive
                  ? 'bg-blue-500 text-white ring-1 ring-blue-600'
                  : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100'
              } `}
              title={tool.name}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{tool.name}</span>
            </button>
          )
        })}
      </div>

      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={!state.selectedUid}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={14} />
        <span className="hidden sm:inline">Delete</span>
      </button>

      {/* Status hint */}
      {state.activeToolId && (
        <span className="hidden animate-pulse text-xs text-blue-600 dark:text-blue-400 lg:inline">
          Click on the PDF to add annotation
        </span>
      )}
      {state.selectedUid && !state.activeToolId && (
        <span className="hidden text-xs text-gray-500 dark:text-gray-400 lg:inline">
          Annotation selected — drag to move or click Delete
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
    <EmbedPDF
      engine={engine}
      plugins={plugins}
      onInitialized={async (registry) => {
        const annotation = registry
          .getPlugin<AnnotationPlugin>(AnnotationPlugin.id)
          ?.provides()
        annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
          id: 'stampCheckmark',
          name: 'Checkmark',
          interaction: {
            exclusive: false,
            cursor: 'crosshair',
          },
          matchScore: () => 0,
          defaults: {
            type: PdfAnnotationSubtype.STAMP,
            imageSrc: '/circle-checkmark.png',
            imageSize: { width: 30, height: 30 },
          },
        })

        annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
          id: 'stampCross',
          name: 'Cross',
          interaction: {
            exclusive: false,
            cursor: 'crosshair',
          },
          matchScore: () => 0,
          defaults: {
            type: PdfAnnotationSubtype.STAMP,
            imageSrc: '/circle-cross.png',
            imageSize: { width: 30, height: 30 },
          },
        })
      }}
    >
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
                  <AnnotationToolbar documentId={activeDocumentId} />

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
