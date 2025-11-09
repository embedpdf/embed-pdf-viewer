'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  DocumentContext,
  DocumentContent,
  DocumentManagerPlugin,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  CapturePluginPackage,
  MarqueeCapture,
  CaptureAreaEvent,
  useCapture,
} from '@embedpdf/plugin-capture/react'
import { useEffect, useState } from 'react'

// 1. Register plugins, including Capture and its dependencies
const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage), // Required for marquee selection
  createPluginRegistration(CapturePluginPackage, {
    scale: 2.0, // Render captured image at 2x resolution
    imageType: 'image/png',
  }),
]

// 2. Create a toolbar to activate capture mode
const CaptureToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: capture, state } = useCapture(documentId)

  return (
    <div className="mb-4 mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <button
        onClick={() => capture?.toggleMarqueeCapture()}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          state.isMarqueeCaptureActive
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        {state.isMarqueeCaptureActive ? 'Cancel Capture' : 'Capture Area'}
      </button>
    </div>
  )
}

// 3. Create a component to display the captured image
const CaptureResult = ({ documentId }: { documentId: string }) => {
  const { provides: capture } = useCapture(documentId)
  const [captureResult, setCaptureResult] = useState<CaptureAreaEvent | null>(
    null,
  )
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!capture) return

    const unsubscribe = capture.onCaptureArea((result) => {
      setCaptureResult(result)
      // If there's a previous image, revoke its URL to free up memory
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
      const newUrl = URL.createObjectURL(result.blob)
      setImageUrl(newUrl)
    })

    return () => {
      unsubscribe()
      // Revoke the URL when the component unmounts
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [capture, imageUrl])

  if (!captureResult || !imageUrl) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-500">
          Click &quot;Capture Area&quot; and drag a rectangle on the PDF to
          create a snapshot.
        </p>
      </div>
    )
  }

  const downloadImage = () => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `capture-page-${captureResult.pageIndex + 1}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <h3 className="text-md font-medium text-gray-800">Capture Result</h3>
      <p className="text-sm text-gray-500">
        Captured from page {captureResult.pageIndex + 1} at{' '}
        {captureResult.scale}x resolution.
      </p>
      <img
        src={imageUrl}
        alt="Captured area from PDF"
        className="mt-2 max-w-full rounded border border-gray-200"
      />
      <button
        onClick={downloadImage}
        className="mt-3 rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-600"
      >
        Download Image
      </button>
    </div>
  )
}

// 4. Create the main viewer component
export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>
  }

  return (
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
      <DocumentContext>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded }) =>
                isLoaded && (
                  <div
                    style={{
                      height: '500px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <CaptureToolbar documentId={activeDocumentId} />
                    <div
                      className="flex-grow"
                      style={{ position: 'relative', overflow: 'hidden' }}
                    >
                      <Viewport
                        documentId={activeDocumentId}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
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
                              <RenderLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                              <MarqueeCapture
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                            </PagePointerProvider>
                          )}
                        />
                      </Viewport>
                    </div>
                    <CaptureResult documentId={activeDocumentId} />
                  </div>
                )
              }
            </DocumentContent>
          )
        }
      </DocumentContext>
    </EmbedPDF>
  )
}
