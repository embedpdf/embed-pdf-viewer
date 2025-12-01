'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPlugin,
  DocumentManagerPluginPackage,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  ScrollPluginPackage,
  ScrollStrategy,
  Scroller,
} from '@embedpdf/plugin-scroll/react'
import {
  ViewContext,
  ViewManagerPlugin,
  ViewManagerPluginPackage,
  useAllViews,
  useViewManagerCapability,
} from '@embedpdf/plugin-view-manager/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react'
import { Loader2, FileText, X, Plus, Columns2, FolderOpen } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewManagerPluginPackage, { defaultViewCount: 2 }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(ScrollPluginPackage, {
    defaultStrategy: ScrollStrategy.Vertical,
  }),
  createPluginRegistration(RenderPluginPackage),
]

// Toolbar to manage views
const Toolbar = () => {
  const { provides: viewManager } = useViewManagerCapability()
  const views = useAllViews()

  if (!viewManager) return null

  const canAddView = views.length < 3
  const canRemoveView = views.length > 1

  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Columns2 size={14} className="text-gray-400" />
        <span className="tracking-wide text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          Split View
        </span>
        <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {views.length} {views.length === 1 ? 'pane' : 'panes'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => viewManager.createView()}
          disabled={!canAddView}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Add Pane</span>
        </button>
      </div>
    </div>
  )
}

// Layout component handling grid logic
const Layout = () => {
  const views = useAllViews()

  const gridClass =
    views.length === 1
      ? 'grid-cols-1'
      : views.length === 2
        ? 'grid-cols-2'
        : 'grid-cols-3'

  return (
    <div
      className={`grid h-full ${gridClass} gap-1 bg-gray-200 p-1 dark:bg-gray-800`}
    >
      {views.map((view) => (
        <ViewPane key={view.id} viewId={view.id} />
      ))}
    </div>
  )
}

// Empty state for a view
const EmptyViewState = ({ onOpenFile }: { onOpenFile: () => void }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-gray-400 dark:text-gray-500">
    <FolderOpen size={32} strokeWidth={1.5} />
    <p className="text-center text-xs">No document</p>
    <button
      onClick={onOpenFile}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
    >
      <Plus size={12} />
      Open File
    </button>
  </div>
)

// Individual View Pane
const ViewPane = ({ viewId }: { viewId: string }) => {
  const { provides: viewManager } = useViewManagerCapability()
  const { provides: docManager } = useDocumentManagerCapability()
  const views = useAllViews()

  const handleOpenFile = async (focusFirst: boolean = true) => {
    if (!docManager || !viewManager) return

    // Focus this view first so the document opens here
    if (focusFirst) {
      viewManager.setFocusedView(viewId)
    }

    try {
      const task = docManager.openFileDialog()
      const result = await task.toPromise()

      // Add to this specific view
      viewManager.addDocumentToView(viewId, result.documentId)
      viewManager.setViewActiveDocument(viewId, result.documentId)
    } catch (e) {
      // User cancelled or error
    }
  }

  const handleRemoveView = () => {
    if (viewManager && views.length > 1) {
      viewManager.removeView(viewId)
    }
  }

  return (
    <ViewContext viewId={viewId}>
      {({
        documentIds,
        activeDocumentId,
        setActiveDocument,
        isFocused,
        focus,
        removeDocument,
      }) => (
        <div
          onClick={focus}
          className={`flex flex-col overflow-hidden bg-white transition-all dark:bg-gray-900 ${
            isFocused
              ? 'ring-2 ring-inset ring-blue-500'
              : 'ring-1 ring-inset ring-gray-200 dark:ring-gray-700'
          } `}
        >
          {/* Tab Bar */}
          <div className="flex min-h-[36px] items-center gap-1 border-b border-gray-200 bg-gray-50 px-1 py-1 dark:border-gray-700 dark:bg-gray-800/50">
            {/* Document Tabs */}
            <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
              {documentIds.map((docId) => {
                const isActive = activeDocumentId === docId
                return (
                  <div
                    key={docId}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveDocument(docId)
                    }}
                    className={`group flex min-w-0 max-w-[120px] cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-all ${
                      isActive
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-300'
                    } `}
                  >
                    <FileText size={12} className="flex-shrink-0" />
                    <span className="truncate">{docId}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeDocument(docId)
                      }}
                      className={`flex-shrink-0 rounded p-0.5 transition-all hover:bg-gray-200 dark:hover:bg-gray-600 ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 hover:!opacity-100 group-hover:opacity-60'} `}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}

              {documentIds.length === 0 && (
                <span className="px-2 py-1 text-[11px] italic text-gray-400 dark:text-gray-500">
                  Empty pane
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="ml-1 flex flex-shrink-0 items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenFile(false)
                }}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                title="Open file in this pane"
              >
                <Plus size={14} />
              </button>
              {views.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveView()
                  }}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  title="Close this pane"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="relative flex-1 bg-gray-100 dark:bg-gray-800">
            {activeDocumentId ? (
              <Viewport
                documentId={activeDocumentId}
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: '#e5e7eb',
                }}
              >
                <Scroller
                  documentId={activeDocumentId}
                  renderPage={({ pageIndex, width, height }) => (
                    <div style={{ width, height, position: 'relative' }}>
                      <RenderLayer
                        documentId={activeDocumentId}
                        pageIndex={pageIndex}
                      />
                    </div>
                  )}
                />
              </Viewport>
            ) : (
              <EmptyViewState onOpenFile={() => handleOpenFile(false)} />
            )}
          </div>
        </div>
      )}
    </ViewContext>
  )
}

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
    <EmbedPDF
      engine={engine}
      plugins={plugins}
      onInitialized={async (registry) => {
        const docPlugin = registry
          .getPlugin<DocumentManagerPlugin>('document-manager')
          ?.provides()
        const viewPlugin = registry
          .getPlugin<ViewManagerPlugin>('view-manager')
          ?.provides()

        if (docPlugin && viewPlugin) {
          const views = viewPlugin.getAllViews()

          // Open first document and add to first view
          const { documentId: doc1 } = await docPlugin
            .openDocumentUrl({
              url: 'https://snippet.embedpdf.com/ebook.pdf',
            })
            .toPromise()

          if (views[0]) {
            viewPlugin.addDocumentToView(views[0].id, doc1)
            viewPlugin.setViewActiveDocument(views[0].id, doc1)
          }

          // Open second document and add to second view
          const { documentId: doc2 } = await docPlugin
            .openDocumentUrl({
              url: 'https://snippet.embedpdf.com/ebook.pdf',
            })
            .toPromise()

          if (views[1]) {
            viewPlugin.addDocumentToView(views[1].id, doc2)
            viewPlugin.setViewActiveDocument(views[1].id, doc2)
          }
        }
      }}
    >
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <Toolbar />
        <div className="h-[400px] sm:h-[500px]">
          <Layout />
        </div>
      </div>
    </EmbedPDF>
  )
}
