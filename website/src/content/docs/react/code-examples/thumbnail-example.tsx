'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import {
  Scroller,
  ScrollPluginPackage,
  useScroll,
} from '@embedpdf/plugin-scroll/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  ThumbnailsPane,
  ThumbImg,
  ThumbnailPluginPackage,
} from '@embedpdf/plugin-thumbnail/react'
import { Loader2 } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ThumbnailPluginPackage, {
    width: 120,
    paddingY: 10,
  }),
]

const ThumbnailSidebar = ({ documentId }: { documentId: string }) => {
  const { state, provides } = useScroll(documentId)

  return (
    <div className="h-full w-[140px] flex-shrink-0 border-r border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <ThumbnailsPane documentId={documentId}>
        {(m) => {
          const isActive = state.currentPage === m.pageIndex + 1
          return (
            <div
              key={m.pageIndex}
              className="absolute flex w-full cursor-pointer flex-col items-center px-2"
              style={{
                height: m.wrapperHeight,
                top: m.top,
              }}
              onClick={() => {
                provides?.scrollToPage?.({
                  pageNumber: m.pageIndex + 1,
                })
              }}
            >
              {/* Thumbnail image container */}
              <div
                className={`overflow-hidden rounded-md transition-all ${
                  isActive
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900'
                    : 'ring-1 ring-gray-300 hover:ring-gray-400 dark:ring-gray-700 dark:hover:ring-gray-600'
                } `}
                style={{
                  width: m.width,
                  height: m.height,
                }}
              >
                <ThumbImg
                  documentId={documentId}
                  meta={m}
                  className="h-full w-full object-contain"
                />
              </div>
              {/* Page number label */}
              <div
                className="mt-1 flex items-center justify-center"
                style={{ height: m.labelHeight }}
              >
                <span
                  className={`text-xs font-medium ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300'
                  } `}
                >
                  {m.pageIndex + 1}
                </span>
              </div>
            </div>
          )
        }}
      </ThumbnailsPane>
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
                  <div className="flex h-[400px] sm:h-[500px]">
                    {/* Thumbnail Sidebar */}
                    <ThumbnailSidebar documentId={activeDocumentId} />

                    {/* PDF Viewer Area */}
                    <div className="relative flex-1">
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
                </div>
              )
            }
          </DocumentContent>
        )
      }
    </EmbedPDF>
  )
}
