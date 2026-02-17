'use client'

import { useState, useCallback } from 'react'
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
  useLayoutAnalysisCapability,
} from '@embedpdf/plugin-layout-analysis/react'
import { Loader2, ScanSearch } from 'lucide-react'

const aiRuntime = createAiRuntime({
  backend: 'auto',
  cache: true,
})

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: '/bank-statement.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(AiManagerPluginPackage, {
    runtime: aiRuntime,
  }),
  createPluginRegistration(LayoutAnalysisPluginPackage, {
    threshold: 0.35,
    tableStructure: false,
  }),
]

type AnalysisStatus =
  | { type: 'idle' }
  | { type: 'analyzing'; stage: string }
  | { type: 'done'; blockCount: number; backend: string }
  | { type: 'error'; message: string }

const AnalyzeToolbar = ({ documentId }: { documentId: string }) => {
  const { provides: layoutAnalysis } = useLayoutAnalysisCapability()
  const { provides: aiManager } = useCapability<AiManagerPlugin>('ai-manager')
  const [status, setStatus] = useState<AnalysisStatus>({ type: 'idle' })

  const handleAnalyze = useCallback(() => {
    if (!layoutAnalysis) return

    setStatus({ type: 'analyzing', stage: 'Starting...' })
    const task = layoutAnalysis.analyzePage(0)

    task.onProgress((p) => {
      if (p.stage === 'downloading-model') {
        const pct = ((p.loaded / p.total) * 100).toFixed(0)
        setStatus({ type: 'analyzing', stage: `Downloading model: ${pct}%` })
      } else if (p.stage === 'creating-session') {
        setStatus({ type: 'analyzing', stage: 'Initializing model...' })
      } else if (p.stage === 'rendering') {
        setStatus({ type: 'analyzing', stage: 'Rendering page...' })
      } else if (p.stage === 'layout-detection') {
        setStatus({ type: 'analyzing', stage: 'Detecting layout...' })
      } else if (p.stage === 'table-structure') {
        setStatus({
          type: 'analyzing',
          stage: `Table ${p.tableIndex + 1}/${p.tableCount}...`,
        })
      } else if (p.stage === 'mapping-coordinates') {
        setStatus({ type: 'analyzing', stage: 'Mapping coordinates...' })
      }
    })

    task.wait(
      (layout) => {
        const backend = aiManager?.getBackend() ?? 'unknown'
        setStatus({ type: 'done', blockCount: layout.blocks.length, backend })
      },
      (error) => {
        setStatus({
          type: 'error',
          message: error.type === 'abort' ? 'Cancelled' : error.reason.message,
        })
      },
    )
  }, [layoutAnalysis, aiManager])

  const isAnalyzing = status.type === 'analyzing'

  return (
    <div className="flex items-center gap-3 border-b border-gray-300 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
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
        {isAnalyzing ? 'Analyzing...' : 'Analyze Page'}
      </button>

      <span className="text-xs text-gray-500 dark:text-gray-400">
        {status.type === 'idle' && 'Click to detect layout elements on page 1'}
        {status.type === 'analyzing' && status.stage}
        {status.type === 'done' &&
          `${status.blockCount} elements detected (${status.backend})`}
        {status.type === 'error' && status.message}
      </span>
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
                  {/* Toolbar with Analyze button */}
                  <AnalyzeToolbar documentId={activeDocumentId} />

                  {/* PDF Viewer Area */}
                  <div className="relative h-[400px] sm:h-[500px]">
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
