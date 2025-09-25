'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationTool,
  useAnnotationCapability,
} from '@embedpdf/plugin-annotation/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react'
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
import { useEffect, useState } from 'react'
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models'

// 1. Register plugins, including Annotation and its dependencies
const plugins = [
  createPluginRegistration(LoaderPluginPackage, {
    loadingOptions: {
      type: 'url',
      pdfFile: {
        id: 'example-pdf',
        url: 'https://snippet.embedpdf.com/ebook.pdf',
      },
    },
  }),
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
export const AnnotationToolbar = () => {
  const { provides: annotationApi } = useAnnotationCapability()
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [canDelete, setCanDelete] = useState(false)

  useEffect(() => {
    if (!annotationApi) return

    const unsub1 = annotationApi.onActiveToolChange((tool) => {
      setActiveTool(tool?.id ?? null)
    })
    const unsub2 = annotationApi.onStateChange((state) => {
      setCanDelete(!!state.selectedUid)
    })

    return () => {
      unsub1()
      unsub2()
    }
  }, [annotationApi])

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
              activeTool === tool.id ? null : tool.id,
            )
          }
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            activeTool === tool.id
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
        disabled={!canDelete}
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
          const annotation = registry
            .getPlugin<AnnotationPlugin>('annotation')
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
        <AnnotationToolbar />
        <div className="flex-grow" style={{ position: 'relative' }}>
          <Viewport
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              backgroundColor: '#f1f3f5',
            }}
          >
            <Scroller
              renderPage={({ width, height, pageIndex, scale, rotation }) => (
                <PagePointerProvider
                  pageIndex={pageIndex}
                  pageWidth={width}
                  pageHeight={height}
                  rotation={rotation}
                  scale={scale}
                >
                  {/* Base layers */}
                  <RenderLayer
                    pageIndex={pageIndex}
                    style={{ pointerEvents: 'none' }}
                  />
                  <SelectionLayer pageIndex={pageIndex} scale={scale} />

                  {/* Annotation Layer on top */}
                  <AnnotationLayer
                    pageIndex={pageIndex}
                    scale={scale}
                    pageWidth={width}
                    pageHeight={height}
                    rotation={rotation}
                  />
                </PagePointerProvider>
              )}
            />
          </Viewport>
        </div>
      </EmbedPDF>
    </div>
  )
}
