'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Rotation } from '@embedpdf/models'

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
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  PagePointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/react'

// Import Rotate plugin
import {
  useRotate,
  Rotate,
  RotatePluginPackage,
} from '@embedpdf/plugin-rotate/react'

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(RotatePluginPackage, {
    defaultRotation: Rotation.Degree0,
  }),
]

// 2. Create a toolbar to control rotation
export const RotateToolbar = ({ documentId }: { documentId: string }) => {
  const { rotation, provides: rotate } = useRotate(documentId)

  if (!rotate) {
    return null
  }

  return (
    <div className="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="tracking-wide text-xs font-medium uppercase text-gray-600">
          Rotation
        </span>
        <div className="min-w-[60px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-800">
          {rotation * 90}°
        </div>
      </div>
      <div className="h-6 w-px bg-gray-200"></div>
      <div className="flex items-center gap-1">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          onClick={rotate.rotateBackward}
          title="Rotate Counter-Clockwise"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" />
          </svg>
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          onClick={rotate.rotateForward}
          title="Rotate Clockwise"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />
          </svg>
        </button>
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
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <div className="flex h-full flex-col">
                    <RotateToolbar documentId={activeDocumentId} />
                    <div className="flex-grow" style={{ position: 'relative' }}>
                      <Viewport
                        documentId={activeDocumentId}
                        style={{
                          backgroundColor: '#f1f3f5',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                        }}
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ pageIndex }) => (
                            <Rotate
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            >
                              <PagePointerProvider
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              >
                                <RenderLayer
                                  documentId={activeDocumentId}
                                  pageIndex={pageIndex}
                                />
                              </PagePointerProvider>
                            </Rotate>
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
