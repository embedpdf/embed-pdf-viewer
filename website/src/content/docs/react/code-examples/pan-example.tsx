'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'

// Import essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPlugin,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/react'

// Import Pan plugin
import { usePan, PanPluginPackage } from '@embedpdf/plugin-pan/react'

// 1. Register the plugins you need, including dependencies for Pan
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage), // Required for Pan
  createPluginRegistration(PanPluginPackage, {
    // Optional: Set when pan mode should be the default interaction
    defaultMode: 'mobile',
  }),
]

// 2. Create a toolbar to toggle pan mode
export const PanToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: pan, isPanning } = usePan(documentId)

  if (!pan) {
    return null
  }

  return (
    <div className="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <button
        onClick={pan.togglePan}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-150 ${
          isPanning
            ? 'border-blue-500 bg-blue-100 text-blue-700'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
        }`}
        title="Toggle Pan Tool"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="icon icon-tabler icons-tabler-outline icon-tabler-hand-stop"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
          <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
          <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
          <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
        </svg>
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
    <div style={{ height: '500px' }} className="select-none">
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
                    <PanToolbar documentId={activeDocumentId} />
                    <div className="relative flex w-full flex-1 overflow-hidden">
                      <GlobalPointerProvider documentId={activeDocumentId}>
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
                                className="pointer-events-none"
                              />
                            )}
                          />
                        </Viewport>
                      </GlobalPointerProvider>
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
