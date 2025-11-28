'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { useState } from 'react'

// Import essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'

// Import Render plugin
import {
  RenderLayer,
  RenderPluginPackage,
  useRenderCapability,
} from '@embedpdf/plugin-render/react'

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage), // Register the render plugin
]

// 2. Create a toolbar to demonstrate the useRenderCapability hook
export const ExportToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: renderCapability } = useRenderCapability()
  const [isExporting, setIsExporting] = useState(false)

  const exportPageAsPng = () => {
    if (!renderCapability || isExporting) return
    setIsExporting(true)

    const render = renderCapability.forDocument(documentId)

    // Use the capability to render page 1 at 2x resolution
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
        // Create a temporary link to trigger the download
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
    <div className="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <button
        className="rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
        onClick={exportPageAsPng}
        disabled={!renderCapability || isExporting}
      >
        {isExporting ? 'Exporting...' : 'Export Page 1 as PNG (2x Res)'}
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
    <div style={{ height: '500px' }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <div className="flex h-full flex-col">
                    <ExportToolbar documentId={activeDocumentId} />
                    <div className="relative flex w-full flex-1 overflow-hidden">
                      <Viewport
                        documentId={activeDocumentId}
                        className="flex-grow bg-gray-100"
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
    </div>
  )
}
