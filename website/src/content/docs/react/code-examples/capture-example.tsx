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
  DocumentContent,
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
import { Camera, Download, Loader2 } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(CapturePluginPackage, {
    scale: 2.0,
    imageType: 'image/png',
  }),
]

const CaptureToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: capture, state } = useCapture(documentId)

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <button
        onClick={() => capture?.toggleMarqueeCapture()}
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
          state.isMarqueeCaptureActive
            ? 'bg-blue-500 text-white shadow-sm'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
        } `}
      >
        <Camera size={16} />
        {state.isMarqueeCaptureActive ? 'Cancel' : 'Capture Area'}
      </button>

      {state.isMarqueeCaptureActive && (
        <span className="animate-pulse text-xs text-gray-500 dark:text-gray-400">
          Click and drag to select an area
        </span>
      )}
    </div>
  )
}

/**
 * Transparency grid component - like Photoshop's transparency background
 */
const TransparencyGrid = ({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div
    className={`relative ${className}`}
    style={{
      // Checkerboard pattern using CSS
      backgroundImage: `
        linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
        linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
        linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)
      `,
      backgroundSize: '16px 16px',
      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
      backgroundColor: '#f3f4f6',
    }}
  >
    {children}
  </div>
)

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
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      setImageUrl(URL.createObjectURL(result.blob))
    })

    return () => {
      unsubscribe()
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [capture, imageUrl])

  if (!captureResult || !imageUrl) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-6 dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Camera size={20} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Click &quot;Capture Area&quot; and drag to select a region
          </p>
        </div>
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
    <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Captured Image
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Page {captureResult.pageIndex + 1} · {captureResult.scale}x
            resolution
          </p>
        </div>
        <button
          onClick={downloadImage}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <Download size={14} />
          Download
        </button>
      </div>

      {/* Image with transparency grid background */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <TransparencyGrid className="flex items-center justify-center p-4">
          <img
            src={imageUrl}
            alt="Captured area"
            className="h-auto max-w-full rounded shadow-lg"
            style={{
              // Add a subtle shadow to make the image "pop" off the grid
              boxShadow:
                '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            }}
          />
        </TransparencyGrid>
      </div>
    </div>
  )
}

/**
 * PDFViewer Demo for Capture Plugin
 */
export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500">
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
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <CaptureToolbar documentId={activeDocumentId} />

                  <div className="relative h-[400px] sm:h-[500px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-[#e5e7eb]"
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
    </EmbedPDF>
  )
}
