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
  DocumentManagerPlugin,
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

// 1. Register plugins, including Annotation and its dependencies
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  // Dependencies for Annotation Plugin
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage), // Optional, for undo/redo
  // The Annotation Plugin
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
]

// 2. Create a toolbar to control annotation tools
export const AnnotationToolbar = ({ documentId }: { documentId: string }) => {
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
    { id: 'stampCheckmark', name: 'Checkmark (stamp)' },
    { id: 'stampCross', name: 'Cross (stamp)' },
    { id: 'ink', name: 'Pen' },
    { id: 'square', name: 'Square' },
    { id: 'highlight', name: 'Highlight' },
  ]

  return (
    <div className="mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() =>
            annotationApi?.setActiveTool(
              state.activeToolId === tool.id ? null : tool.id,
            )
          }
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            state.activeToolId === tool.id
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {tool.name}
        </button>
      ))}
      <div className="h-6 w-px bg-gray-200"></div>
      <button
        onClick={handleDelete}
        disabled={!state.selectedUid}
        className="rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
      >
        Delete Selected
      </button>
    </div>
  )
}

// 3. Create the main viewer component
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
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={async (registry) => {
          registry
            .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
            ?.provides()
            ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })

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
                  <>
                    <AnnotationToolbar documentId={activeDocumentId} />
                    <div className="flex-grow" style={{ position: 'relative' }}>
                      <Viewport
                        documentId={activeDocumentId}
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'absolute',
                          backgroundColor: '#f1f3f5',
                        }}
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ pageIndex }) => (
                            <PagePointerProvider
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            >
                              {/* Base layers */}
                              <RenderLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                style={{ pointerEvents: 'none' }}
                              />
                              <SelectionLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />

                              {/* Annotation Layer on top */}
                              <AnnotationLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
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
