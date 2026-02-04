'use client'

import { useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF, useDocumentPermissions } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  useActiveDocument,
  useOpenDocuments,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react'
import {
  ViewportPluginPackage,
  Viewport,
} from '@embedpdf/plugin-viewport/react'
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react'
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react'
import {
  PrintPluginPackage,
  PrintFrame,
  usePrintCapability,
} from '@embedpdf/plugin-print/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react'
import {
  Loader2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Printer,
  Copy,
  FileText,
} from 'lucide-react'

// Permission indicator component
const PermissionIndicator = ({
  allowed,
  label,
}: {
  allowed: boolean
  label: string
}) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-gray-600 dark:text-gray-400">{label}</span>
    {allowed ? (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
        <ShieldCheck size={12} /> Allowed
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        <ShieldOff size={12} /> Denied
      </span>
    )}
  </div>
)

// Permission status panel
const PermissionStatus = ({ documentId }: { documentId: string }) => {
  const { canPrint, canCopyContents, canModifyContents, canModifyAnnotations } =
    useDocumentPermissions(documentId)

  return (
    <div className="absolute right-4 top-4 z-10 w-56 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
      <div className="mb-2 flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
        <Shield size={14} className="text-blue-500" />
        Effective Permissions
      </div>

      <div className="space-y-0.5 text-xs">
        <PermissionIndicator allowed={canPrint} label="Print" />
        <PermissionIndicator allowed={canCopyContents} label="Copy Text" />
        <PermissionIndicator
          allowed={canModifyContents}
          label="Modify Content"
        />
        <PermissionIndicator
          allowed={canModifyAnnotations}
          label="Annotations"
        />
      </div>
    </div>
  )
}

// Tab bar component
const TabBar = () => {
  const { provides } = useDocumentManagerCapability()
  const documents = useOpenDocuments()
  const { activeDocumentId } = useActiveDocument()

  // Custom names for our demo documents
  const getDocumentName = (docName: string | undefined, index: number) => {
    const names = ['Full Access', 'Print Disabled', 'Read-Only']
    return names[index] || docName || `Document ${index + 1}`
  }

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
      {documents.map((doc, index) => {
        const isActive = activeDocumentId === doc.id
        const name = getDocumentName(doc.name, index)

        return (
          <button
            key={doc.id}
            onClick={() => provides?.setActiveDocument(doc.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-700 dark:text-white dark:ring-gray-600'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <FileText size={12} />
            {name}
          </button>
        )
      })}
    </div>
  )
}

// Toolbar with print and copy buttons
const Toolbar = () => {
  const { activeDocumentId } = useActiveDocument()
  const { canPrint, canCopyContents } = useDocumentPermissions(
    activeDocumentId || '',
  )
  const { provides: printCapability } = usePrintCapability()
  const { provides: selectionCapability } = useSelectionCapability()

  const handlePrint = () => {
    if (canPrint && printCapability) {
      printCapability.print()
    }
  }

  const handleCopy = () => {
    if (canCopyContents && selectionCapability) {
      selectionCapability.copyToClipboard()
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Switch tabs to see how permissions affect the toolbar
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={!canCopyContents}
          onClick={handleCopy}
          title={
            canCopyContents
              ? 'Copy selected text'
              : 'Copying is disabled for this document'
          }
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            canCopyContents
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
          }`}
        >
          <Copy size={12} />
          Copy
        </button>

        <button
          disabled={!canPrint}
          onClick={handlePrint}
          title={
            canPrint
              ? 'Print document'
              : 'Printing is disabled for this document'
          }
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${
            canPrint
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'
          }`}
        >
          <Printer size={12} />
          Print
        </button>
      </div>
    </div>
  )
}

export const SecurityExample = () => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          // Document 1: Full Access - ignores all PDF restrictions
          {
            url: 'https://snippet.embedpdf.com/ebook.pdf',
            name: 'Full Access',
            permissions: {
              enforceDocumentPermissions: false, // Ignore PDF restrictions, allow everything
            },
          },
          // Document 2: Print Disabled - only printing is blocked
          {
            url: 'https://snippet.embedpdf.com/ebook.pdf',
            name: 'Print Disabled',
            autoActivate: false,
            permissions: {
              enforceDocumentPermissions: false,
              overrides: {
                print: false,
                printHighQuality: false,
              },
            },
          },
          // Document 3: Read-Only - most actions blocked
          {
            url: 'https://snippet.embedpdf.com/ebook.pdf',
            name: 'Read-Only',
            autoActivate: false,
            permissions: {
              enforceDocumentPermissions: false,
              overrides: {
                print: false,
                printHighQuality: false,
                copyContents: false,
                modifyContents: false,
                modifyAnnotations: false,
              },
            },
          },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(PrintPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
    ],
    [],
  )

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[500px] items-center justify-center">
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
        <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          {pluginsReady ? (
            <>
              <PrintFrame />
              <TabBar />
              <Toolbar />
              <div
                className="relative h-[450px]"
                style={{ userSelect: 'none' }}
              >
                {activeDocumentId ? (
                  <DocumentContent documentId={activeDocumentId}>
                    {({ isLoaded }) => (
                      <>
                        {isLoaded && (
                          <>
                            <PermissionStatus documentId={activeDocumentId} />
                            <Viewport
                              documentId={activeDocumentId}
                              className="absolute inset-0 bg-gray-100 dark:bg-gray-800"
                            >
                              <Scroller
                                documentId={activeDocumentId}
                                renderPage={({ width, height, pageIndex }) => (
                                  <PagePointerProvider
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  >
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
                                        className="pointer-events-none"
                                      />
                                      <SelectionLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                      />
                                    </div>
                                  </PagePointerProvider>
                                )}
                              />
                            </Viewport>
                          </>
                        )}
                      </>
                    )}
                  </DocumentContent>
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    No document loaded
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-[500px] items-center justify-center">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}
    </EmbedPDF>
  )
}
