'use client'

import { useState, useCallback, useRef } from 'react'
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
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { useCapability } from '@embedpdf/core/react'
import { createAiRuntime } from '@embedpdf/ai/web'
import {
  AiManagerPluginPackage,
  AiManagerPlugin,
} from '@embedpdf/plugin-ai-manager'
import {
  LayoutAnalysisPluginPackage,
  LayoutAnalysisLayer,
  useLayoutAnalysis,
} from '@embedpdf/plugin-layout-analysis/react'
import type {
  LayoutTask,
  DocumentLayout,
  DocumentAnalysisProgress,
} from '@embedpdf/plugin-layout-analysis'
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
                  <AnalyzeToolbar documentId={activeDocumentId} />

                  <div className="relative h-[400px] sm:h-[800px]">
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
