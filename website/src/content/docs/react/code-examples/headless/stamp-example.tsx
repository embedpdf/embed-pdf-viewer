'use client'

import { useEffect, useState } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  useAnnotation,
} from '@embedpdf/plugin-annotation/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
} from '@embedpdf/plugin-selection/react'
import {
  StampImg,
  StampPluginPackage,
  useActiveStamp,
  useStampCapability,
  useStampLibraries,
  useStampsByLibrary,
} from '@embedpdf/plugin-stamp/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import {
  useZoom,
  ZoomMode,
  ZoomPluginPackage,
} from '@embedpdf/plugin-zoom/react'
import {
  ignore,
  PdfAnnotationName,
  PdfAnnotationSubtype,
} from '@embedpdf/models'
import {
  Download,
  LibraryBig,
  Loader2,
  MousePointer2,
  Square,
  Stamp,
  ZoomIn,
  ZoomOut,
  Info,
} from 'lucide-react'

const CUSTOM_LIBRARY_ID = 'custom'
const SIDEBAR_CATEGORY = 'sidebar'
const STAMP_THUMB_WIDTH = 120

const unsupportedStampSourceTypes: PdfAnnotationSubtype[] = [
  PdfAnnotationSubtype.REDACT,
  PdfAnnotationSubtype.HIGHLIGHT,
  PdfAnnotationSubtype.SQUIGGLY,
  PdfAnnotationSubtype.UNDERLINE,
  PdfAnnotationSubtype.STRIKEOUT,
  PdfAnnotationSubtype.CARET,
  PdfAnnotationSubtype.WIDGET,
]

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
  createPluginRegistration(StampPluginPackage, {
    defaultLibrary: {
      id: CUSTOM_LIBRARY_ID,
      name: 'Custom Stamps',
      categories: ['custom', SIDEBAR_CATEGORY],
    },
  }),
]

function canCreateStampFromType(type?: PdfAnnotationSubtype) {
  return !!type && !unsupportedStampSourceTypes.includes(type)
}

function downloadPdf(filename: string, bytes: ArrayBuffer) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

function StampSidebar({
  documentId,
  selectedLibraryId,
  onSelectedLibraryIdChange,
}: {
  documentId: string
  selectedLibraryId: string
  onSelectedLibraryIdChange: (libraryId: string) => void
}) {
  const { libraries } = useStampLibraries()
  const { provides: stampCapability } = useStampCapability()
  const stamps = useStampsByLibrary(selectedLibraryId, SIDEBAR_CATEGORY)
  const activeStamp = useActiveStamp(documentId)

  useEffect(() => {
    if (
      selectedLibraryId !== 'all' &&
      !libraries.some((library) => library.id === selectedLibraryId)
    ) {
      onSelectedLibraryIdChange('all')
    }
  }, [libraries, onSelectedLibraryIdChange, selectedLibraryId])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-white dark:bg-gray-900 lg:w-[280px]">
      <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <LibraryBig className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Stamp Library
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Pick a stamp, then click the document to place it.
        </p>

        {libraries.length > 1 && (
          <select
            className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-blue-400"
            value={selectedLibraryId}
            onChange={(event) => onSelectedLibraryIdChange(event.target.value)}
          >
            <option value="all">All Stamps</option>
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-[240px] flex-1 overflow-y-auto p-4 lg:max-h-none">
        {stamps.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {stamps.map(({ library, stamp }) => {
              const isActive =
                activeStamp?.libraryId === library.id &&
                activeStamp.stamp.id === stamp.id

              return (
                <button
                  key={`${library.id}-${stamp.id}`}
                  onClick={() => {
                    stampCapability
                      ?.forDocument(documentId)
                      .activateStampPlacement(library.id, stamp)
                      .wait(() => {}, ignore)
                  }}
                  className={`group flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20 dark:ring-blue-400'
                      : 'dark:hover:bg-gray-750 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-900">
                    <StampImg
                      libraryId={library.id}
                      pageIndex={stamp.pageIndex}
                      width={STAMP_THUMB_WIDTH}
                      style={{
                        maxWidth: '80%',
                        maxHeight: '80%',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                  <div className="w-full">
                    <div className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                      {stamp.label ?? stamp.subject}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {library.name}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <Stamp className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p>No stamps available.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

function Toolbar({
  documentId,
  onSelectedLibraryIdChange,
}: {
  documentId: string
  onSelectedLibraryIdChange: (libraryId: string) => void
}) {
  const { provides: annotationApi, state } = useAnnotation(documentId)
  const { provides: stampCapability } = useStampCapability()
  const { provides: zoom } = useZoom(documentId)
  const { libraries } = useStampLibraries()
  const activeStamp = useActiveStamp(documentId)
  const [message, setMessage] = useState(
    'Draw a square, select it, and save it as a reusable stamp.',
  )

  const selectedAnnotation = annotationApi?.getSelectedAnnotation()
  const canCreateStamp = canCreateStampFromType(selectedAnnotation?.object.type)
  const customLibrary = libraries.find(
    (library) => library.id === CUSTOM_LIBRARY_ID,
  )
  const customStampCount = customLibrary?.stamps.length ?? 0

  const handleCreateStamp = () => {
    if (!stampCapability || !selectedAnnotation || !canCreateStamp) return

    setMessage('Creating a stamp from the selected annotation...')

    stampCapability
      .forDocument(documentId)
      .createStampFromAnnotation(
        selectedAnnotation.object,
        {
          name: PdfAnnotationName.Custom,
          subject: `Custom Stamp ${customStampCount + 1}`,
          categories: ['custom', SIDEBAR_CATEGORY],
        },
        CUSTOM_LIBRARY_ID,
      )
      .wait(
        () => {
          onSelectedLibraryIdChange(CUSTOM_LIBRARY_ID)
          setMessage(
            'Saved the selected annotation into the Custom Stamps library.',
          )
        },
        () => {
          setMessage('Could not create a stamp from the selected annotation.')
        },
      )
  }

  const handleExportCustomLibrary = () => {
    if (!stampCapability) return

    setMessage('Exporting the custom library PDF...')

    stampCapability.exportLibrary(CUSTOM_LIBRARY_ID).wait(
      (exported) => {
        downloadPdf(`${exported.name}.pdf`, exported.pdf)
        setMessage('Downloaded the custom library as a PDF.')
      },
      () => {
        setMessage('Could not export the custom stamp library.')
      },
    )
  }

  return (
    <div className="flex flex-col border-b border-gray-300 dark:border-gray-700">
      {/* Main Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-100 px-3 py-2 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => annotationApi?.setActiveTool(null)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              !state.activeToolId
                ? 'bg-slate-700 text-white dark:bg-slate-600 dark:text-white'
                : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600'
            }`}
          >
            <MousePointer2 size={16} />
            Select
          </button>

          <button
            onClick={() =>
              annotationApi?.setActiveTool(
                state.activeToolId === 'square' ? null : 'square',
              )
            }
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              state.activeToolId === 'square'
                ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600'
            }`}
          >
            <Square size={16} />
            Square
          </button>

          <div className="mx-1 hidden h-5 w-px bg-gray-300 dark:bg-gray-600 sm:block"></div>

          <button
            onClick={handleCreateStamp}
            disabled={!canCreateStamp}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Stamp size={16} />
            Create from Selection
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => zoom?.zoomOut()}
              disabled={!zoom}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>

            <button
              onClick={() => zoom?.zoomIn()}
              disabled={!zoom}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="mx-1 hidden h-5 w-px bg-gray-300 dark:bg-gray-600 sm:block"></div>

          <button
            onClick={handleExportCustomLibrary}
            disabled={customStampCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download size={16} />
            Export Custom Library
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between bg-gray-50 px-4 py-1.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-gray-400" />
          <span>{message}</span>
        </div>
        <span className="hidden sm:inline-block">
          {state.activeToolId === 'rubberStamp' && activeStamp
            ? `Placing: ${activeStamp.stamp.subject}`
            : `${customStampCount} custom stamp${customStampCount === 1 ? '' : 's'} saved`}
        </span>
      </div>
    </div>
  )
}

function StampWorkbench({ documentId }: { documentId: string }) {
  const [selectedLibraryId, setSelectedLibraryId] = useState('all')

  return (
    <div
      className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
      style={{ userSelect: 'none' }}
    >
      <Toolbar
        documentId={documentId}
        onSelectedLibraryIdChange={setSelectedLibraryId}
      />

      <div className="flex flex-col lg:h-[600px] lg:flex-row">
        {/* Sidebar */}
        <div className="border-b border-gray-200 dark:border-gray-800 lg:border-b-0 lg:border-r">
          <StampSidebar
            documentId={documentId}
            selectedLibraryId={selectedLibraryId}
            onSelectedLibraryIdChange={setSelectedLibraryId}
          />
        </div>

        {/* Viewer */}
        <div className="relative h-[420px] sm:h-[550px] lg:h-auto lg:flex-1">
          <Viewport
            documentId={documentId}
            className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
          >
            <Scroller
              documentId={documentId}
              renderPage={({ pageIndex }) => (
                <PagePointerProvider
                  documentId={documentId}
                  pageIndex={pageIndex}
                >
                  <RenderLayer
                    documentId={documentId}
                    pageIndex={pageIndex}
                    style={{ pointerEvents: 'none' }}
                  />
                  <SelectionLayer
                    documentId={documentId}
                    pageIndex={pageIndex}
                  />
                  <AnnotationLayer
                    documentId={documentId}
                    pageIndex={pageIndex}
                  />
                </PagePointerProvider>
              )}
            />
          </Viewport>
        </div>
      </div>
    </div>
  )
}

export function StampViewer() {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[420px] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading PDF Engine...</span>
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
              isLoaded ? (
                <StampWorkbench documentId={activeDocumentId} />
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex h-[420px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Loading PDF document...
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
