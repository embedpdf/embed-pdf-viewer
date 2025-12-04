'use client'

import { useMemo } from 'react'
import { createPluginRegistration, DocumentState } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
  useDocumentManagerCapability,
  TabActions,
  useOpenDocuments,
} from '@embedpdf/plugin-document-manager/react'
import {
  ViewportPluginPackage,
  Viewport,
} from '@embedpdf/plugin-viewport/react'
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react'
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react'
import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/react'
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react'
import { Loader2, FileText, X, Plus, FolderOpen } from 'lucide-react'

interface TabBarProps {
  activeDocumentId: string | null
}

function TabBar({ activeDocumentId }: TabBarProps) {
  const { provides } = useDocumentManagerCapability()
  const documentStates = useOpenDocuments()

  const handleOpenFile = () => {
    provides?.openFileDialog()
  }

  const handleSelect = (documentId: string) => {
    provides?.setActiveDocument(documentId)
  }

  const handleClose = (documentId: string) => {
    provides?.closeDocument(documentId)
  }

  return (
    <div className="flex items-center gap-1 border-b border-gray-300 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
      {/* Tabs */}
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {documentStates.map((doc) => {
          const isActive = activeDocumentId === doc.id
          return (
            <div
              key={doc.id}
              onClick={() => handleSelect(doc.id)}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(doc.id)
                }
              }}
              className={`group relative flex min-w-[100px] max-w-[180px] cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
              } `}
            >
              <FileText size={14} className="flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {doc.name ?? `Document ${doc.id.slice(0, 6)}`}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose(doc.id)
                }}
                aria-label={`Close ${doc.name ?? 'document'}`}
                className={`flex-shrink-0 rounded p-0.5 transition-all hover:bg-gray-200 dark:hover:bg-gray-600 ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 hover:!opacity-100 group-hover:opacity-60'} `}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add button */}
      <button
        onClick={handleOpenFile}
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        aria-label="Open File"
        title="Open File"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

function EmptyState() {
  const { provides } = useDocumentManagerCapability()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
      <FolderOpen size={40} strokeWidth={1.5} />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          No document open
        </p>
        <p className="mt-1 text-xs">
          Click the + button or drop a file to open
        </p>
      </div>
      <button
        onClick={() => provides?.openFileDialog()}
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
      >
        <Plus size={14} />
        Open File
      </button>
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          { url: 'https://snippet.embedpdf.com/ebook.pdf' },
          {
            url: 'https://snippet.embedpdf.com/ebook.pdf',
            autoActivate: false,
          },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
    ],
    [],
  )

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
      {({ pluginsReady, activeDocumentId }) => (
        <>
          {pluginsReady ? (
            <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              {/* Tab Bar */}
              <TabBar activeDocumentId={activeDocumentId} />

              {/* Document Content */}
              {activeDocumentId ? (
                <DocumentContent documentId={activeDocumentId}>
                  {({ isLoading: docLoading, isLoaded }) => (
                    <>
                      {docLoading && (
                        <div className="flex h-[400px] items-center justify-center sm:h-[500px]">
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-sm">Loading document...</span>
                          </div>
                        </div>
                      )}
                      {isLoaded && (
                        <div className="relative h-[400px] sm:h-[500px]">
                          <Viewport
                            documentId={activeDocumentId}
                            className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                          >
                            <Scroller
                              documentId={activeDocumentId}
                              renderPage={({ width, height, pageIndex }) => (
                                <div
                                  style={{
                                    width,
                                    height,
                                    position: 'relative',
                                  }}
                                >
                                  <RenderLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  />
                                  <TilingLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  />
                                </div>
                              )}
                            />
                          </Viewport>
                        </div>
                      )}
                    </>
                  )}
                </DocumentContent>
              ) : (
                <div className="h-[400px] sm:h-[500px]">
                  <EmptyState />
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="flex h-[400px] items-center justify-center">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Initializing plugins...</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </EmbedPDF>
  )
}
