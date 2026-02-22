'use client'

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
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
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react'
import {
  RenderLayer,
  RenderPluginPackage,
  useRenderCapability,
} from '@embedpdf/plugin-render/react'
import { createAiRuntime } from '@embedpdf/ai/web'
import {
  AiManagerPluginPackage,
  AiManagerPlugin,
  useAiManagerCapability,
} from '@embedpdf/plugin-ai-manager/react'
import {
  LayoutAnalysisPluginPackage,
  LayoutAnalysisLayer,
  useLayoutAnalysis,
} from '@embedpdf/plugin-layout-analysis/react'
import type {
  LayoutTask,
  DocumentLayout,
  DocumentAnalysisProgress,
  PageLayout,
} from '@embedpdf/plugin-layout-analysis'
import {
  mergeTextRunsWithLayout,
  type EnrichedLayoutBlock,
} from '@embedpdf/plugin-layout-analysis'
import type { PdfPageTextRuns } from '@embedpdf/models'
import {
  useZoom,
  ZoomPluginPackage,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react'
import {
  Loader2,
  ScanSearch,
  X,
  Eye,
  EyeOff,
  Table2,
  LayoutDashboard,
  ToggleLeft,
  ToggleRight,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FolderOpen,
  AlertTriangle,
  Github,
  ExternalLink,
} from 'lucide-react'

const aiRuntime = createAiRuntime({
  backend: 'auto',
  cache: true,
})

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://arxiv.org/pdf/1706.03762' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(AiManagerPluginPackage, {
    runtime: aiRuntime,
  }),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(LayoutAnalysisPluginPackage, {
    layoutThreshold: 0.35,
    tableStructureThreshold: 0.8,
    tableStructure: false,
  }),
]

// ─── Zoom + File Toolbar ─────────────────────────────────────

const ViewerToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: zoom, state } = useZoom(documentId)
  const { provides: docManager } = useDocumentManagerCapability()

  if (!zoom) return null

  const zoomPercentage = Math.round(state.currentZoomLevel * 100)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-1.5">
        <button
          onClick={zoom.zoomOut}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={14} />
        </button>
        <div className="min-w-[50px] rounded-md bg-white px-1.5 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600">
          <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-200">
            {zoomPercentage}%
          </span>
        </div>
        <button
          onClick={zoom.zoomIn}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-white px-2 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Fit Page"
        >
          <RotateCcw size={12} />
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>

      <div className="ml-auto">
        <button
          onClick={() => docManager?.openFileDialog()}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <FolderOpen size={14} />
          Open your own PDF
        </button>
      </div>
    </div>
  )
}

// ─── Analysis Toolbar ────────────────────────────────────────

type AnalysisStatus =
  | { type: 'idle' }
  | { type: 'analyzing'; stage: string }
  | { type: 'done'; blockCount: number; backend: string }
  | { type: 'error'; message: string }

const AnalyzeToolbar = ({ documentId }: { documentId: string }) => {
  const {
    layoutOverlayVisible,
    tableStructureOverlayVisible,
    tableStructureEnabled,
    layoutThreshold,
    tableStructureThreshold,
    provides,
  } = useLayoutAnalysis(documentId)
  const { provides: aiManager } = useAiManagerCapability()
  const [status, setStatus] = useState<AnalysisStatus>({ type: 'idle' })
  const activeTaskRef = useRef<LayoutTask<
    DocumentLayout,
    DocumentAnalysisProgress
  > | null>(null)

  const handleAnalyze = useCallback(() => {
    if (!provides) return

    setStatus({ type: 'analyzing', stage: 'Starting...' })
    const task = provides.analyzeAllPages({ force: false })
    activeTaskRef.current = task

    task.onProgress((p) => {
      if (p.stage === 'downloading-model') {
        const pct = ((p.loaded / p.total) * 100).toFixed(0)
        setStatus({ type: 'analyzing', stage: `Downloading model: ${pct}%` })
      } else if (p.stage === 'creating-session') {
        setStatus({ type: 'analyzing', stage: 'Initializing model...' })
      } else if (p.stage === 'rendering') {
        setStatus({
          type: 'analyzing',
          stage: `Rendering page ${p.pageIndex + 1}...`,
        })
      } else if (p.stage === 'layout-detection') {
        setStatus({
          type: 'analyzing',
          stage: `Detecting layout on page ${p.pageIndex + 1}...`,
        })
      } else if (p.stage === 'table-structure') {
        setStatus({
          type: 'analyzing',
          stage: `Page ${p.pageIndex + 1}: table ${p.tableIndex + 1}/${p.tableCount}...`,
        })
      } else if (p.stage === 'mapping-coordinates') {
        setStatus({
          type: 'analyzing',
          stage: `Mapping coordinates (page ${p.pageIndex + 1})...`,
        })
      } else if (p.stage === 'page-complete') {
        setStatus({
          type: 'analyzing',
          stage: `Page ${p.completed}/${p.total} complete`,
        })
      }
    })

    task.wait(
      (result) => {
        activeTaskRef.current = null
        const backend = aiManager?.getBackend() ?? 'unknown'
        const totalBlocks = result.pages.reduce(
          (sum, p) => sum + p.blocks.length,
          0,
        )
        setStatus({ type: 'done', blockCount: totalBlocks, backend })
      },
      (error) => {
        activeTaskRef.current = null
        setStatus({
          type: 'error',
          message: error.type === 'abort' ? 'Cancelled' : error.reason.message,
        })
      },
    )
  }, [provides, aiManager])

  const handleCancel = useCallback(() => {
    if (activeTaskRef.current) {
      activeTaskRef.current.abort({
        type: 'no-document',
        message: 'Cancelled by user',
      })
      activeTaskRef.current = null
    }
  }, [])

  const isAnalyzing = status.type === 'analyzing'

  return (
    <div className="space-y-2 border-b border-gray-300 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isAnalyzing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ScanSearch size={14} />
          )}
          {isAnalyzing ? 'Analyzing...' : 'Analyze All Pages'}
        </button>

        {isAnalyzing && (
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          >
            <X size={12} />
            Cancel
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              provides?.setTableStructureEnabled(!tableStructureEnabled)
            }
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
              tableStructureEnabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
            title="Enable/disable table structure analysis"
          >
            {tableStructureEnabled ? (
              <ToggleRight size={12} />
            ) : (
              <ToggleLeft size={12} />
            )}
            Table Analysis
          </button>

          <span className="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />

          <button
            onClick={() =>
              provides?.setLayoutOverlayVisible(!layoutOverlayVisible)
            }
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
              layoutOverlayVisible
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
            title="Toggle layout overlay"
          >
            <LayoutDashboard size={12} />
            Layout
            {layoutOverlayVisible ? <Eye size={10} /> : <EyeOff size={10} />}
          </button>
          <button
            onClick={() =>
              provides?.setTableStructureOverlayVisible(
                !tableStructureOverlayVisible,
              )
            }
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
              tableStructureOverlayVisible
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
            title="Toggle table structure overlay"
          >
            <Table2 size={12} />
            Tables
            {tableStructureOverlayVisible ? (
              <Eye size={10} />
            ) : (
              <EyeOff size={10} />
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          Layout
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={layoutThreshold}
            onChange={(e) =>
              provides?.setLayoutThreshold(parseFloat(e.target.value))
            }
            className="h-1 w-20 accent-blue-600"
          />
          <span className="w-7 tabular-nums">{layoutThreshold.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          Table
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={tableStructureThreshold}
            onChange={(e) =>
              provides?.setTableStructureThreshold(parseFloat(e.target.value))
            }
            className="h-1 w-20 accent-orange-600"
          />
          <span className="w-7 tabular-nums">
            {tableStructureThreshold.toFixed(2)}
          </span>
        </label>

        <span className="ml-auto text-gray-500 dark:text-gray-400">
          {status.type === 'idle' &&
            'Click "Analyze All Pages" to run inference'}
          {status.type === 'analyzing' && status.stage}
          {status.type === 'done' &&
            `${status.blockCount} elements detected (${status.backend})`}
          {status.type === 'error' && status.message}
        </span>
      </div>
    </div>
  )
}

// ─── Extracted Content View ──────────────────────────────────

const IMAGE_LABELS = new Set(['image', 'figure', 'chart'])

function shouldRenderAsImage(
  block: EnrichedLayoutBlock,
  layout: PageLayout,
): boolean {
  if (IMAGE_LABELS.has(block.label)) return true
  if (block.label === 'table' && !layout.tableStructures.has(block.id))
    return true
  return false
}

const BlockImage = ({
  documentId,
  pageIndex,
  block,
}: {
  documentId: string
  pageIndex: number
  block: EnrichedLayoutBlock
}) => {
  const { provides: renderProvides } = useRenderCapability()
  const [src, setSrc] = useState<string | null>(null)
  const srcRef = useRef<string | null>(null)

  useEffect(() => {
    if (!renderProvides) return
    let cancelled = false
    const scope = renderProvides.forDocument(documentId)
    const task = scope.renderPageRect({
      pageIndex,
      rect: block.rect,
      options: { withAnnotations: false },
    })
    task.wait(
      (blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        srcRef.current = url
        setSrc(url)
      },
      () => {},
    )
    return () => {
      cancelled = true
      if (srcRef.current) {
        URL.revokeObjectURL(srcRef.current)
        srcRef.current = null
      }
    }
  }, [renderProvides, documentId, pageIndex, block.id])

  if (!src) {
    return (
      <div className="flex h-24 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
        <Loader2 size={16} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={block.label}
      className="max-w-full rounded border border-gray-200 dark:border-gray-700"
    />
  )
}

const TextRunsContent = ({ block }: { block: EnrichedLayoutBlock }) => {
  if (block.textRuns.length === 0) {
    return (
      <span className="italic text-gray-400 dark:text-gray-500">
        (no text extracted)
      </span>
    )
  }
  return (
    <>
      {block.textRuns.map((run, i) => (
        <span
          key={i}
          style={{
            fontSize: `${Math.max(run.fontSize * 1.33, 10)}px`,
            fontWeight: run.font.weight,
            fontStyle: run.font.italic ? 'italic' : 'normal',
            color: `rgba(${run.color.red}, ${run.color.green}, ${run.color.blue}, ${run.color.alpha / 255})`,
          }}
        >
          {run.text}
        </span>
      ))}
    </>
  )
}

const LABEL_COLORS: Record<string, string> = {
  title:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  list: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  table:
    'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  image: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  figure: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  chart: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  'section-header':
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
}

const BlockLabel = ({ label }: { label: string }) => (
  <span
    className={`tracking-wide mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
      LABEL_COLORS[label] ??
      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    }`}
  >
    {label}
  </span>
)

const PageContent = ({
  documentId,
  pageIndex,
  layout,
}: {
  documentId: string
  pageIndex: number
  layout: PageLayout
}) => {
  const { provides } = useLayoutAnalysis(documentId)
  const [enrichedBlocks, setEnrichedBlocks] = useState<
    EnrichedLayoutBlock[] | null
  >(null)

  useEffect(() => {
    if (!provides) return
    let cancelled = false
    const task = provides.getPageTextRuns(pageIndex)
    task.wait(
      (textRuns: PdfPageTextRuns) => {
        if (cancelled) return
        const merged = mergeTextRunsWithLayout(layout, textRuns)
        merged.sort((a, b) => a.readingOrder - b.readingOrder)
        setEnrichedBlocks(merged)
      },
      () => {
        if (cancelled) return
        const blocks = layout.blocks
          .map((b) => ({ ...b, textRuns: [] }) as EnrichedLayoutBlock)
          .sort((a, b) => a.readingOrder - b.readingOrder)
        setEnrichedBlocks(blocks)
      },
    )
    return () => {
      cancelled = true
    }
  }, [provides, pageIndex, layout])

  const { layoutThreshold } = useLayoutAnalysis(documentId)
  const visibleBlocks = useMemo(
    () => enrichedBlocks?.filter((b) => b.score >= layoutThreshold) ?? [],
    [enrichedBlocks, layoutThreshold],
  )

  if (!enrichedBlocks) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-gray-400" />
        <span className="ml-2 text-xs text-gray-400">
          Extracting text runs...
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visibleBlocks.map((block) => (
        <div
          key={block.id}
          className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <BlockLabel label={block.label} />
          <div className="mt-1">
            {shouldRenderAsImage(block, layout) ? (
              <BlockImage
                documentId={documentId}
                pageIndex={pageIndex}
                block={block}
              />
            ) : (
              <div className="leading-relaxed">
                <TextRunsContent block={block} />
              </div>
            )}
          </div>
        </div>
      ))}
      {visibleBlocks.length === 0 && (
        <p className="py-4 text-center text-xs italic text-gray-400 dark:text-gray-500">
          No blocks above the current threshold
        </p>
      )}
    </div>
  )
}

const ExtractedContentView = ({ documentId }: { documentId: string }) => {
  const { pages } = useLayoutAnalysis(documentId)

  const completedPages = useMemo(
    () =>
      Object.entries(pages)
        .filter(([, s]) => s.status === 'complete' && s.layout)
        .map(([idx, s]) => ({ pageIndex: Number(idx), layout: s.layout! }))
        .sort((a, b) => a.pageIndex - b.pageIndex),
    [pages],
  )

  if (completedPages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText
            size={32}
            className="mx-auto mb-2 text-gray-300 dark:text-gray-600"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No analysis results yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Run &quot;Analyze All Pages&quot; first
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {completedPages.map(({ pageIndex, layout }) => (
          <section key={pageIndex}>
            <h3 className="tracking-wider mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              Page {pageIndex + 1}
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </h3>
            <PageContent
              documentId={documentId}
              pageIndex={pageIndex}
              layout={layout}
            />
          </section>
        ))}
      </div>
    </div>
  )
}

// ─── Tab Bar ─────────────────────────────────────────────────

type ViewMode = 'pdf' | 'extracted'

const ViewTabs = ({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
}) => (
  <div className="flex border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
    <button
      onClick={() => onChange('pdf')}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition ${
        mode === 'pdf'
          ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
    >
      <Eye size={14} />
      PDF View
    </button>
    <button
      onClick={() => onChange('extracted')}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition ${
        mode === 'extracted'
          ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
    >
      <FileText size={14} />
      Extracted Content
    </button>
  </div>
)

// ─── Model Preloader ─────────────────────────────────────────

const ModelPreloader = () => {
  const { provides: aiManager } = useAiManagerCapability()

  useEffect(() => {
    aiManager?.loadModel('layout-detection')
    aiManager?.loadModel('table-structure')
  }, [aiManager])

  return null
}

// ─── Main Viewer ─────────────────────────────────────────────

const LayoutAnalysisViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()
  const [viewMode, setViewMode] = useState<ViewMode>('pdf')

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[500px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">
              Loading PDF engine (PDFium via WebAssembly)...
            </span>
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
                  <ModelPreloader />
                  <ViewerToolbar documentId={activeDocumentId} />
                  <AnalyzeToolbar documentId={activeDocumentId} />
                  <ViewTabs mode={viewMode} onChange={setViewMode} />

                  <div className="relative h-[60vh] min-h-[400px] sm:h-[75vh]">
                    {viewMode === 'pdf' ? (
                      <Viewport
                        documentId={activeDocumentId}
                        className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                      >
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ pageIndex }) => (
                            <>
                              <RenderLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                              <LayoutAnalysisLayer
                                documentId={activeDocumentId}
                                pageIndex={pageIndex}
                              />
                            </>
                          )}
                        />
                      </Viewport>
                    ) : (
                      <ExtractedContentView documentId={activeDocumentId} />
                    )}
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

// ─── Page Layout ─────────────────────────────────────────────

export default function LayoutAnalysisLanding() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Layout Analysis
          </h1>
          <p className="max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            Client-side document structure detection running entirely in your
            browser. Uses{' '}
            <a
              href="https://onnxruntime.ai/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900 dark:hover:text-gray-200"
            >
              ONNX Runtime
            </a>{' '}
            (WebAssembly/WebGPU) to run deep learning models locally -- no
            server, no API keys, your documents never leave the tab.
          </p>
        </div>

        {/* Models */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                PP-DocLayoutV3
              </h3>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                Apache 2.0
              </span>
            </div>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Layout detection -- identifies text blocks, titles, tables,
              figures, headers, footers, and other structural elements on each
              page.
            </p>
            <a
              href="https://huggingface.co/PaddlePaddle/PP-DocLayoutV3"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              PaddleOCR / PaddlePaddle <ExternalLink size={10} />
            </a>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                table-transformer-structure-recognition
              </h3>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                MIT
              </span>
            </div>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Table structure recognition -- detects rows, columns, column
              headers, and spanning cells within tables identified by the layout
              model.
            </p>
            <a
              href="https://huggingface.co/microsoft/table-transformer-structure-recognition"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              microsoft/table-transformer <ExternalLink size={10} />
            </a>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                Experimental -- will use significant resources
              </h3>
              <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400/90">
                This runs deep learning inference directly in your browser tab.
                The models are ~60 MB each and inference is CPU/GPU intensive.
                Expect high memory usage and your tab may become unresponsive
                during analysis, especially on mobile devices or older hardware.
              </p>
            </div>
          </div>
        </div>

        {/* Demo */}
        <LayoutAnalysisViewer />

        {/* Footer */}
        <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Use it in your project
          </h2>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            The layout analysis plugin works with React, Svelte, and Vue.
            Everything above is built with{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
              @embedpdf/plugin-layout-analysis
            </code>{' '}
            and runs on the headless{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
              @embedpdf/core
            </code>{' '}
            plugin system.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/react/headless/plugins/plugin-layout-analysis"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              React docs
            </Link>
            <Link
              href="/docs/svelte/headless/plugins/plugin-layout-analysis"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              Svelte docs
            </Link>
            <Link
              href="/docs/vue/headless/plugins/plugin-layout-analysis"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              Vue docs
            </Link>
            <a
              href="https://github.com/embedpdf/embed-pdf-viewer"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              <Github size={16} />
              Source
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
