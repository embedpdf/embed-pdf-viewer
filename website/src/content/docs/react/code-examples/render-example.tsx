'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useState } from 'react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import {
  RenderLayer,
  RenderPluginPackage,
  useRenderCapability,
} from '@embedpdf/plugin-render/react'
import { Loader2, Image, Download } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
]

const ExportToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: renderCapability } = useRenderCapability()
  const [isExporting, setIsExporting] = useState(false)

  const exportPageAsPng = () => {
    if (!renderCapability || isExporting) return
    setIsExporting(true)

    const render = renderCapability.forDocument(documentId)

    const renderTask = render.renderPage({
      pageIndex: 0,
      options: {
        scaleFactor: 2.0,
        withAnnotations: true,
        imageType: 'image/png',
      },
    })

    renderTask.wait(
      (blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'page-1.png'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setIsExporting(false)
      },
      (error) => {
        console.error('Failed to export page:', error)
        setIsExporting(false)
      },
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={exportPageAsPng}
        disabled={!renderCapability || isExporting}
        className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Image size={16} />
            Export Page 1 as PNG
          </>
        )}
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <Download size={14} />
        <span className="hidden sm:inline">
          Renders at 2x resolution with annotations
        </span>
        <span className="sm:hidden">2x resolution</span>
      </div>
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
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* Toolbar */}
                  <ExportToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ pageIndex }) => (
                          <RenderLayer
                            documentId={activeDocumentId}
                            pageIndex={pageIndex}
                          />
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
