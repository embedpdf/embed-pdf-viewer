'use client'

import { createPluginRegistration, PluginRegistry } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPlugin,
  AnnotationPluginPackage,
  useAnnotation,
  useAnnotationCapability,
  type AnnotationSelectionMenuProps,
} from '@embedpdf/plugin-annotation/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
} from '@embedpdf/plugin-selection/react'
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import {
  Rotate,
  RotatePluginPackage,
  useRotate,
} from '@embedpdf/plugin-rotate/react'
import {
  useZoom,
  ZoomMode,
  ZoomPluginPackage,
} from '@embedpdf/plugin-zoom/react'
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  Rotation,
  type PdfAnnotationFlagName,
  type PdfAnnotationObject,
  type PdfFreeTextAnnoObject,
  type PdfLineAnnoObject,
  type PdfSquareAnnoObject,
} from '@embedpdf/models'
import {
  Loader2,
  MousePointerClick,
  RotateCcw,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(TilingPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(RotatePluginPackage, {
    defaultRotation: Rotation.Degree0,
  }),
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
]

const DEMO_PAGE_INDEX = 0
const PRIMARY_ID = 'annotation-flags-demo-primary'
const SECONDARY_ID = 'annotation-flags-demo-secondary'
const SQUARE_ID = 'annotation-flags-demo-square'
const LINE_ID = 'annotation-flags-demo-line'

const primarySeed: PdfFreeTextAnnoObject = {
  id: PRIMARY_ID,
  type: PdfAnnotationSubtype.FREETEXT,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 60, y: 80 },
    size: { width: 280, height: 72 },
  },
  contents: 'Primary note — try hidden, readOnly, locked, lockedContents',
  fontFamily: PdfStandardFont.Helvetica,
  fontSize: 13,
  fontColor: '#0F172A',
  textAlign: PdfTextAlignment.Left,
  verticalAlign: PdfVerticalAlignment.Top,
  color: '#FEF3C7',
  opacity: 1,
  flags: [],
}

const secondarySeed: PdfFreeTextAnnoObject = {
  id: SECONDARY_ID,
  type: PdfAnnotationSubtype.FREETEXT,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 360, y: 220 },
    size: { width: 130, height: 40 },
  },
  contents: 'Pinned note',
  fontFamily: PdfStandardFont.Helvetica,
  fontSize: 12,
  fontColor: '#0F172A',
  textAlign: PdfTextAlignment.Center,
  verticalAlign: PdfVerticalAlignment.Middle,
  color: '#BAE6FD',
  opacity: 1,
  flags: [],
}

const squareSeed: PdfSquareAnnoObject = {
  id: SQUARE_ID,
  type: PdfAnnotationSubtype.SQUARE,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 80, y: 300 },
    size: { width: 140, height: 90 },
  },
  color: 'transparent',
  opacity: 1,
  strokeWidth: 2,
  strokeColor: '#2563EB',
  strokeStyle: PdfAnnotationBorderStyle.SOLID,
  flags: [],
}

const lineSeed: PdfLineAnnoObject = {
  id: LINE_ID,
  type: PdfAnnotationSubtype.LINE,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 260, y: 320 },
    size: { width: 200, height: 60 },
  },
  linePoints: {
    start: { x: 260, y: 320 },
    end: { x: 460, y: 380 },
  },
  color: 'transparent',
  opacity: 1,
  strokeWidth: 2,
  strokeColor: '#DC2626',
  strokeStyle: PdfAnnotationBorderStyle.SOLID,
  flags: [],
}

type DemoAnnotation = {
  id: string
  label: string
  seed: PdfAnnotationObject
}

const DEMO_ANNOTATIONS: DemoAnnotation[] = [
  { id: PRIMARY_ID, label: 'Primary note (FreeText)', seed: primarySeed },
  { id: SECONDARY_ID, label: 'Pinned note (FreeText)', seed: secondarySeed },
  { id: SQUARE_ID, label: 'Square outline', seed: squareSeed },
  { id: LINE_ID, label: 'Line', seed: lineSeed },
]

const TOGGLEABLE_FLAGS: Array<{
  flag: PdfAnnotationFlagName
  description: string
}> = [
  { flag: 'hidden', description: 'not rendered, not selectable' },
  {
    flag: 'noView',
    description: 'not rendered, not selectable, still printable',
  },
  { flag: 'readOnly', description: 'rendered but no interaction' },
  {
    flag: 'locked',
    description: 'selectable but cannot be moved / resized / rotated',
  },
  {
    flag: 'lockedContents',
    description: 'selectable and movable but text cannot be edited',
  },
]

/**
 * Selection menu that demonstrates reading the `structurallyLocked` /
 * `contentLocked` fields off the selection context.
 */
const FlagsSelectionMenu = ({
  selected,
  context,
  documentId,
  menuWrapperProps,
  rect,
  placement,
}: AnnotationSelectionMenuProps & { documentId: string }) => {
  const { provides: annotationCapability } = useAnnotationCapability()
  const annotationScope = annotationCapability?.forDocument(documentId)

  if (!selected) return null

  const { structurallyLocked, contentLocked } = context

  const handleDelete = () => {
    if (!annotationScope || structurallyLocked) return
    const { pageIndex, id } = context.annotation.object
    annotationScope.deleteAnnotation(pageIndex, id)
  }

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'default',
    top: placement.suggestTop ? -40 : rect.size.height + 8,
  }

  const statusLabel = structurallyLocked
    ? contentLocked
      ? 'structurally + content locked'
      : 'structurally locked'
    : contentLocked
      ? 'content locked'
      : 'interactive'

  return (
    <div {...menuWrapperProps}>
      <div
        style={menuStyle}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          onClick={handleDelete}
          disabled={structurallyLocked}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600 dark:text-gray-300 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:disabled:hover:text-gray-300"
          title={
            structurallyLocked ? 'Locked — cannot delete' : 'Delete annotation'
          }
        >
          <Trash2 size={13} />
        </button>
        <span className="border-l border-gray-200 pl-2 font-mono text-[10px] tracking-tight text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

const ZoomToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: zoom, state } = useZoom(documentId)
  if (!zoom) return null

  const zoomPercentage = Math.round(state.currentZoomLevel * 100)

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={zoom.zoomOut}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Zoom out"
      >
        <ZoomOut size={14} />
      </button>
      <div className="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600">
        <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-200">
          {zoomPercentage}%
        </span>
      </div>
      <button
        onClick={zoom.zoomIn}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Zoom in"
      >
        <ZoomIn size={14} />
      </button>
      <button
        onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
        className="ml-1 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Fit page"
      >
        <span>Fit</span>
      </button>
    </div>
  )
}

const RotateToolbar = ({ documentId }: { documentId: string }) => {
  const { rotation, provides: rotate } = useRotate(documentId)
  if (!rotate) return null

  const degrees = rotation * 90

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={rotate.rotateBackward}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Rotate counter-clockwise"
      >
        <RotateCcw size={14} />
      </button>
      <div className="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600">
        <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
          {degrees}°
        </span>
      </div>
      <button
        onClick={rotate.rotateForward}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Rotate clockwise"
      >
        <RotateCw size={14} />
      </button>
    </div>
  )
}

/**
 * Single flag editor that is always visible and keyed to the currently-selected
 * annotation. When nothing is selected the controls are disabled with a hint.
 * This reads flags directly off `annotation.flags` and updates them via
 * `updateAnnotation`.
 */
const FlagEditor = ({ documentId }: { documentId: string }) => {
  const { provides: annotationApi, state } = useAnnotation(documentId)

  const selectedId = state.selectedUids[0] ?? null
  const tracked = selectedId ? state.byUid[selectedId] : null
  const label = DEMO_ANNOTATIONS.find((a) => a.id === selectedId)?.label ?? null
  const currentFlags: PdfAnnotationFlagName[] = tracked?.object.flags ?? []

  const disabled = !tracked || !annotationApi

  const toggle = (flag: PdfAnnotationFlagName) => {
    if (disabled || !tracked) return
    const next = currentFlags.includes(flag)
      ? currentFlags.filter((f) => f !== flag)
      : [...currentFlags, flag]
    annotationApi!.updateAnnotation(DEMO_PAGE_INDEX, tracked.object.id, {
      flags: next,
    })
  }

  const clearFlags = () => {
    if (disabled || !tracked || currentFlags.length === 0) return
    annotationApi!.updateAnnotation(DEMO_PAGE_INDEX, tracked.object.id, {
      flags: [],
    })
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {tracked ? (
            <>
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                aria-hidden
              />
              <span className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                {label ?? 'Selected annotation'}
              </span>
              <code className="hidden shrink-0 rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 sm:inline">
                flags: [{currentFlags.join(', ')}]
              </code>
            </>
          ) : (
            <>
              <MousePointerClick
                size={14}
                className="shrink-0 text-gray-400 dark:text-gray-500"
                aria-hidden
              />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Click an annotation on the page to edit its flags
              </span>
            </>
          )}
        </div>
        <button
          onClick={clearFlags}
          disabled={disabled || currentFlags.length === 0}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100 dark:disabled:hover:bg-gray-700 dark:disabled:hover:text-gray-300"
          title="Clear all flags on the selected annotation"
        >
          Clear flags
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
        {TOGGLEABLE_FLAGS.map(({ flag, description }) => {
          const isActive = currentFlags.includes(flag)
          return (
            <button
              key={flag}
              onClick={() => toggle(flag)}
              disabled={disabled}
              title={description}
              className={`flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                isActive
                  ? 'bg-blue-500 text-white ring-1 ring-blue-600 hover:bg-blue-600'
                  : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700'
              }`}
            >
              <span className="font-mono text-[11px]">{flag}</span>
              <span
                className={`text-[10px] font-normal leading-tight ${
                  isActive ? 'text-blue-50' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const Toolbar = ({ documentId }: { documentId: string }) => {
  const { provides: annotationApi } = useAnnotation(documentId)

  const restoreDemo = () => {
    if (!annotationApi) return

    for (const { id, seed } of DEMO_ANNOTATIONS) {
      const existing = annotationApi.getAnnotationById(id)
      if (existing) {
        annotationApi.updateAnnotation(DEMO_PAGE_INDEX, id, {
          flags: [],
        })
      } else {
        annotationApi.createAnnotation(DEMO_PAGE_INDEX, seed)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-gray-300 bg-gray-100 px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ZoomToolbar documentId={documentId} />
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <RotateToolbar documentId={documentId} />
        <div className="ml-auto">
          <button
            onClick={restoreDemo}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500"
            title="Clear flags and restore all demo annotations"
          >
            <RotateCcw size={14} />
            <span>Reset demo</span>
          </button>
        </div>
      </div>

      <FlagEditor documentId={documentId} />
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

  const onInitialized = async (registry: PluginRegistry) => {
    const annotation = registry
      .getPlugin<AnnotationPlugin>(AnnotationPlugin.id)
      ?.provides()
    if (!annotation) return

    annotation.importAnnotations(
      DEMO_ANNOTATIONS.map(({ id, seed }) => ({ annotation: { ...seed, id } })),
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins} onInitialized={onInitialized}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoaded }) =>
              isLoaded && (
                <div
                  className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                  style={{ userSelect: 'none' }}
                >
                  <Toolbar documentId={activeDocumentId} />

                  <div className="relative h-[500px] sm:h-[600px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ width, height, pageIndex }) => (
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
                                style={{ pointerEvents: 'none' }}
                              />
                              <TilingLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                style={{ pointerEvents: 'none' }}
                              />
                              <SelectionLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                              <AnnotationLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                                selectionMenu={(props) => (
                                  <FlagsSelectionMenu
                                    {...props}
                                    documentId={activeDocumentId}
                                  />
                                )}
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
  )
}
