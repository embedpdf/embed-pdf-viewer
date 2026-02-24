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
  useSpread,
  SpreadPluginPackage,
  SpreadMode,
} from '@embedpdf/plugin-spread/react'
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react'
import { Loader2, FileText, BookOpen, Book } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(SpreadPluginPackage, {
    defaultSpreadMode: SpreadMode.None,
  }),
]

const SpreadToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: spread, spreadMode } = useSpread(documentId)

  if (!spread) return null

  const modes = [
    { label: 'Single', value: SpreadMode.None, icon: FileText },
    { label: 'Odd Spread', value: SpreadMode.Odd, icon: BookOpen },
    { label: 'Even Spread', value: SpreadMode.Even, icon: Book },
  ]

  return (
    <div className="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Layout
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
      <div className="flex items-center gap-1.5">
        {modes.map((mode) => {
          const Icon = mode.icon
          const isActive = spreadMode === mode.value
          return (
            <button
              key={mode.value}
              onClick={() => spread.setSpreadMode(mode.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all ${
                isActive
                  ? 'bg-blue-500 text-white ring-1 ring-blue-600'
                  : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100'
              } `}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          )
        })}
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
                  <SpreadToolbar documentId={activeDocumentId} />

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
