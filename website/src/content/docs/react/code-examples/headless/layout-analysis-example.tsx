'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
import {
  RenderLayer,
  RenderPluginPackage,
  useRenderCapability,
} from '@embedpdf/plugin-render/react'
import { useCapability } from '@embedpdf/core/react'
import { createAiRuntime } from '@embedpdf/ai/web'
import {
  AiManagerPluginPackage,
  AiManagerPlugin,
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
} from 'lucide-react'
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react'

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
  const { provides: aiManager } = useCapability<AiManagerPlugin>('ai-manager')
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
      <div className="flex items-center gap-2">
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

        <div className="ml-auto flex items-center gap-2">
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

      <div className="flex items-center gap-4 text-xs">
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
            'Click to detect layout elements on all pages'}
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

// ─── Tab Bar ────────────────────────────────────────────────

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

// ─── Main Viewer ────────────────────────────────────────────

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()
  const [viewMode, setViewMode] = useState<ViewMode>('pdf')

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
                  <AnalyzeToolbar documentId={activeDocumentId} />
                  <ViewTabs mode={viewMode} onChange={setViewMode} />

                  <div className="relative h-[400px] sm:h-[800px]">
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
