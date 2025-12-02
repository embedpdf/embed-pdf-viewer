'use client'

import { createPluginRegistration, GlobalStoreState } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  Command,
  CommandsPluginPackage,
  useCommand,
} from '@embedpdf/plugin-commands/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  SCROLL_PLUGIN_ID,
  ScrollPlugin,
  ScrollPluginPackage,
  ScrollState,
  Scroller,
  useScroll,
} from '@embedpdf/plugin-scroll/react'
import {
  Viewport,
  VIEWPORT_PLUGIN_ID,
  ViewportPluginPackage,
  ViewportState,
} from '@embedpdf/plugin-viewport/react'
import {
  ZOOM_PLUGIN_ID,
  ZoomMode,
  ZoomPluginPackage,
  ZoomState,
} from '@embedpdf/plugin-zoom/react'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  type LucideIcon,
} from 'lucide-react'

export type State = GlobalStoreState<{
  [ZOOM_PLUGIN_ID]: ZoomState
  [VIEWPORT_PLUGIN_ID]: ViewportState
  [SCROLL_PLUGIN_ID]: ScrollState
}>

// Define Commands
const myCommands: Record<string, Command<State>> = {
  'nav.prev': {
    id: 'nav.prev',
    label: 'Previous Page',
    shortcuts: ['arrowleft', 'k'],
    action: ({ registry, documentId }) => {
      registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
        ?.forDocument(documentId)
        .scrollToPreviousPage()
    },
    disabled: ({ state, documentId }) => {
      const scrollState = state.plugins.scroll.documents[documentId]
      return scrollState ? scrollState.currentPage <= 1 : true
    },
  },
  'nav.next': {
    id: 'nav.next',
    label: 'Next Page',
    shortcuts: ['arrowright', 'j'],
    action: ({ registry, documentId }) => {
      registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
        ?.forDocument(documentId)
        .scrollToNextPage()
    },
    disabled: ({ state, documentId }) => {
      const scrollState = state.plugins.scroll.documents[documentId]
      return scrollState
        ? scrollState.currentPage >= scrollState.totalPages
        : true
    },
  },
  'doc.alert': {
    id: 'doc.alert',
    label: 'Show Info',
    shortcuts: ['ctrl+i', 'meta+i'],
    action: ({ state, documentId }) => {
      const page = state.plugins.scroll.documents[documentId]?.currentPage
      if (!page) return
      alert(`You are currently reading page ${page}`)
    },
  },
}

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
  createPluginRegistration(CommandsPluginPackage, {
    commands: myCommands,
  }),
]

// Shortcut badge component
const ShortcutBadge = ({ shortcut }: { shortcut: string }) => {
  const formatted = shortcut
    .replace('arrowleft', '←')
    .replace('arrowright', '→')
    .replace('ctrl+', '⌃')
    .replace('meta+', '⌘')
    .toUpperCase()

  return (
    <kbd className="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
      {formatted}
    </kbd>
  )
}

// Command Button Component
const CommandButton = ({
  commandId,
  documentId,
  icon: Icon,
  showLabel = true,
}: {
  commandId: string
  documentId: string
  icon?: LucideIcon
  showLabel?: boolean
}) => {
  const command = useCommand(commandId, documentId)

  if (!command) return null

  return (
    <button
      onClick={command.execute}
      disabled={command.disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      title={
        command.shortcuts
          ? `Shortcut: ${command.shortcuts.join(', ')}`
          : undefined
      }
    >
      {Icon && <Icon size={14} />}
      {showLabel && <span className="hidden sm:inline">{command.label}</span>}
      {command.shortcuts && command.shortcuts[0] && (
        <ShortcutBadge shortcut={command.shortcuts[0]} />
      )}
    </button>
  )
}

// Toolbar
const ViewerToolbar = ({ documentId }: { documentId: string }) => {
  const { state } = useScroll(documentId)

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Keyboard size={14} />
        <span className="tracking-wide hidden uppercase sm:inline">
          Commands
        </span>
      </div>
      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Navigation */}
      <div className="flex items-center gap-1">
        <CommandButton
          commandId="nav.prev"
          documentId={documentId}
          icon={ChevronLeft}
          showLabel={false}
        />

        {/* Page indicator */}
        <div className="min-w-[80px] rounded-md bg-gray-100 px-2 py-1 text-center dark:bg-gray-800">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {state.currentPage}{' '}
            <span className="text-gray-400 dark:text-gray-500">/</span>{' '}
            {state.totalPages}
          </span>
        </div>

        <CommandButton
          commandId="nav.next"
          documentId={documentId}
          icon={ChevronRight}
          showLabel={false}
        />
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <CommandButton
        commandId="doc.alert"
        documentId={documentId}
        icon={Info}
      />

      {/* Hint */}
      <span className="hidden text-[10px] text-gray-400 lg:inline dark:text-gray-500">
        Use keyboard shortcuts to navigate
      </span>
    </div>
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
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoading: docLoading, isLoaded }) => (
              <>
                {docLoading && (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex h-[400px] items-center justify-center">
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-sm">Loading document...</span>
                      </div>
                    </div>
                  </div>
                )}
                {isLoaded && (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    {/* Toolbar */}
                    <ViewerToolbar documentId={activeDocumentId} />

                    {/* PDF Viewer Area */}
                    <div className="relative h-[400px] sm:h-[500px]">
                      <Viewport
                        documentId={activeDocumentId}
                        className="absolute inset-0 bg-[#e5e7eb]"
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
                )}
              </>
            )}
          </DocumentContent>
        )
      }
    </EmbedPDF>
  )
}
