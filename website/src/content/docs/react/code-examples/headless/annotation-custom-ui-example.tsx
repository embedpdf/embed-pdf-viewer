'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationTool,
  useAnnotation,
  type HandleProps,
  type RotationHandleComponentProps,
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
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models'
import { Loader2, Pencil, Square, GitBranch, Stamp, Trash2 } from 'lucide-react'

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
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
]

// ---------------------------------------------------------------------------
// Custom handle components
// ---------------------------------------------------------------------------

/** Square resize handles instead of the default circles */
const SquareResizeHandle = ({
  style,
  backgroundColor,
  ...rest
}: HandleProps) => (
  <div
    {...rest}
    style={{
      ...style,
      backgroundColor: 'transparent',
      border: `2px solid ${backgroundColor ?? '#475569'}`,
      borderRadius: 2,
    }}
  />
)

/** Diamond-shaped vertex handles (rotated 45deg squares) */
const DiamondVertexHandle = ({
  style,
  backgroundColor,
  ...rest
}: HandleProps) => (
  <div
    {...rest}
    style={{
      ...style,
      backgroundColor: backgroundColor ?? '#475569',
      borderRadius: 1,
      transform: `${(style as any)?.transform ?? ''} rotate(45deg)`.trim(),
    }}
  />
)

/** Custom rotation handle — a rounded pill with a rotate icon */
const PillRotationHandle = ({
  style,
  backgroundColor,
  connectorStyle,
  showConnector,
  iconColor = 'white',
  ...rest
}: RotationHandleComponentProps) => (
  <>
    {showConnector && connectorStyle && <div style={connectorStyle} />}
    <div
      {...rest}
      style={{
        ...style,
        backgroundColor: backgroundColor ?? '#475569',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={iconColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 4v6h6" />
        <path d="M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
      </svg>
    </div>
  </>
)

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const Toolbar = ({ documentId }: { documentId: string }) => {
  const { provides: annotationApi, state } = useAnnotation(documentId)

  const handleDelete = () => {
    const selection = annotationApi?.getSelectedAnnotation()
    if (selection) {
      annotationApi?.deleteAnnotation(
        selection.object.pageIndex,
        selection.object.id,
      )
    }
  }

  const tools = [
    { id: 'square', name: 'Square', icon: Square },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'polyline', name: 'Polyline', icon: GitBranch },
    { id: 'stampImage', name: 'Stamp', icon: Stamp },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      <div className="flex items-center gap-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon
          const isActive = state.activeToolId === tool.id
          return (
            <button
              key={tool.id}
              onClick={() =>
                annotationApi?.setActiveTool(isActive ? null : tool.id)
              }
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all ${
                isActive
                  ? 'bg-slate-600 text-white ring-1 ring-slate-700'
                  : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100'
              } `}
              title={tool.name}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{tool.name}</span>
            </button>
          )
        })}
      </div>

      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={handleDelete}
        disabled={!state.selectedUid}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={14} />
        <span className="hidden sm:inline">Delete</span>
      </button>

      {state.activeToolId && (
        <span className="hidden animate-pulse text-xs text-slate-600 dark:text-slate-400 lg:inline">
          Click on the PDF to add annotation
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

export const CustomUIViewer = () => {
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
    <EmbedPDF
      engine={engine}
      plugins={plugins}
      onInitialized={async (registry) => {
        const annotation = registry
          .getPlugin<AnnotationPlugin>(AnnotationPlugin.id)
          ?.provides()
        annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
          id: 'stampImage',
          name: 'Image Stamp',
          interaction: { exclusive: false, cursor: 'crosshair' },
          matchScore: () => 0,
          defaults: {
            type: PdfAnnotationSubtype.STAMP,
            imageSrc: '/circle-checkmark.png',
            imageSize: { width: 40, height: 40 },
          },
        })
      }}
    >
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

                  <div className="relative h-[450px] sm:h-[550px]">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
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
                              style={{ pointerEvents: 'none' }}
                            />
                            <SelectionLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                            <AnnotationLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                              resizeUI={{
                                size: 10,
                                color: '#475569',
                                component: SquareResizeHandle,
                              }}
                              vertexUI={{
                                size: 10,
                                color: '#475569',
                                component: DiamondVertexHandle,
                              }}
                              rotationUI={{
                                size: 24,
                                color: '#475569',
                                iconColor: 'white',
                                margin: 28,
                                showConnector: true,
                                connectorColor: '#94a3b8',
                                component: PillRotationHandle,
                              }}
                              selectionOutline={{
                                color: '#475569',
                                style: 'solid',
                                width: 1,
                                offset: 2,
                              }}
                              groupSelectionOutline={{
                                color: '#64748b',
                                style: 'dashed',
                                width: 2,
                                offset: 3,
                              }}
                            />
                          </PagePointerProvider>
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
