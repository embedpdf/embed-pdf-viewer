'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'

// Import essential plugins
import {
  Viewport,
  ViewportPluginPackage,
  useViewportCapability,
  useViewportScrollActivity,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContext,
  DocumentContent,
  DocumentManagerPlugin,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage, {
    // Optional: Add some padding around the content
    viewportGap: 20,
  }),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
]

// 2. Create a toolbar for programmatic scrolling
export const ScrollToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: viewportCapability } = useViewportCapability()
  const scrollActivity = useViewportScrollActivity(documentId)

  const viewport = viewportCapability?.forDocument(documentId)

  const scrollToTop = () => {
    viewport?.scrollTo({ x: 0, y: 0, behavior: 'smooth' })
  }

  const scrollToMiddle = () => {
    if (!viewport) return
    const metrics = viewport.getMetrics()
    viewport.scrollTo({
      y: metrics.scrollHeight / 2,
      x: 0,
      behavior: 'smooth',
      center: true, // This will center the y-coordinate in the viewport
    })
  }

  const scrollToBottom = () => {
    if (!viewport) return
    const metrics = viewport.getMetrics()
    viewport.scrollTo({ y: metrics.scrollHeight, x: 0, behavior: 'smooth' })
  }

  return (
    <div className="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          onClick={scrollToTop}
          disabled={!viewport}
        >
          Scroll to Top
        </button>
        <button
          className="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          onClick={scrollToMiddle}
          disabled={!viewport}
        >
          Scroll to Middle
        </button>
        <button
          className="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          onClick={scrollToBottom}
          disabled={!viewport}
        >
          Scroll to Bottom
        </button>
      </div>
      <div className="h-6 w-px bg-gray-200"></div>
      <div className="flex items-center">
        <div
          className={`h-3 w-3 rounded-full transition-colors duration-200 ${
            scrollActivity.isScrolling ? 'bg-green-500' : 'bg-gray-300'
          }`}
        ></div>
        <span className="ml-2 min-w-[100px] text-sm font-medium text-gray-600">
          {scrollActivity.isScrolling ? 'Scrolling...' : 'Idle'}
        </span>
      </div>
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
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={async (registry) => {
          registry
            .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
            ?.provides()
            ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
        }}
      >
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <div className="flex h-full flex-col">
                    <ScrollToolbar documentId={activeDocumentId} />
                    <div className="relative flex w-full flex-1 overflow-hidden">
                      <Viewport
                        documentId={activeDocumentId}
                        className="flex-grow bg-gray-100"
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ width, height, pageIndex }) => (
                            <div
                              style={{ width, height, position: 'relative' }}
                            >
                              <RenderLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                            </div>
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
