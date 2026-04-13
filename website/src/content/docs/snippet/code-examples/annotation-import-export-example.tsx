'use client'
import {
  PDFViewer,
  PDFViewerRef,
  AnnotationPlugin,
  type AnnotationTool,
  type AnnotationTransferItem,
  PdfAnnotationSubtype,
  type PdfStampAnnoObject,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Check,
  X,
  Pencil,
  Square,
  Highlighter,
  Type,
  Download,
  Upload,
  Trash2,
  MousePointer2,
} from 'lucide-react'

interface AnnotationImportExportExampleProps {
  themePreference?: 'light' | 'dark'
}

type AnnotationApi = ReturnType<AnnotationPlugin['provides']>

export default function AnnotationImportExportExample({
  themePreference = 'light',
}: AnnotationImportExportExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [annotationApi, setAnnotationApi] = useState<AnnotationApi | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [annotationCount, setAnnotationCount] = useState(0)
  const [exported, setExported] = useState<AnnotationTransferItem[] | null>(
    null,
  )
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let cleanupTool: (() => void) | undefined
    let cleanupEvents: (() => void) | undefined

    const setup = async () => {
      const registry = await viewer.registry
      const api = registry
        ?.getPlugin<AnnotationPlugin>('annotation')
        ?.provides()
      if (!api) return

      setAnnotationApi(api)

      api.addTool<AnnotationTool<PdfStampAnnoObject>>({
        id: 'stampCheckmark',
        name: 'Checkmark',
        interaction: { exclusive: true, cursor: 'crosshair' },
        matchScore: () => 0,
        defaults: {
          type: PdfAnnotationSubtype.STAMP,
          imageSrc: '/circle-checkmark.png',
          imageSize: { width: 30, height: 30 },
        },
        behavior: {
          showGhost: true,
          deactivateToolAfterCreate: true,
          selectAfterCreate: true,
        },
      })

      api.addTool<AnnotationTool<PdfStampAnnoObject>>({
        id: 'stampCross',
        name: 'Cross',
        interaction: { exclusive: true, cursor: 'crosshair' },
        matchScore: () => 0,
        defaults: {
          type: PdfAnnotationSubtype.STAMP,
          imageSrc: '/circle-cross.png',
          imageSize: { width: 30, height: 30 },
        },
        behavior: {
          showGhost: true,
          deactivateToolAfterCreate: true,
          selectAfterCreate: true,
        },
      })

      cleanupTool = api.onActiveToolChange(({ tool }) => {
        setActiveTool(tool?.id || null)
      })

      cleanupEvents = api.onAnnotationEvent((event) => {
        if (
          event.type === 'create' ||
          event.type === 'delete' ||
          event.type === 'loaded'
        ) {
          const annotations = api.getAnnotations()
          setAnnotationCount(annotations.length)
        }
      })

      const initial = api.getAnnotations()
      setAnnotationCount(initial.length)
    }

    setup()

    return () => {
      cleanupTool?.()
      cleanupEvents?.()
    }
  }, [])

  const handleSetTool = useCallback(
    (toolId: string | null) => {
      annotationApi?.setActiveTool(toolId)
    },
    [annotationApi],
  )

  const handleExport = useCallback(() => {
    if (!annotationApi) return
    annotationApi.exportAnnotations().wait(
      (result) => {
        setExported(result)
        setStatus(
          `Exported ${result.length} annotation${result.length !== 1 ? 's' : ''}`,
        )
      },
      () => setStatus('Export failed'),
    )
  }, [annotationApi])

  const handleClear = useCallback(() => {
    if (!annotationApi) return
    annotationApi.deleteAllAnnotations()
    setStatus('Cleared all annotations')
  }, [annotationApi])

  const handleImport = useCallback(() => {
    if (!annotationApi || !exported) return
    annotationApi.importAnnotations(exported)
    setStatus(
      `Imported ${exported.length} annotation${exported.length !== 1 ? 's' : ''}`,
    )
  }, [annotationApi, exported])

  const tools = [
    { id: null, name: 'Select', icon: MousePointer2 },
    { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
    { id: 'stampCross', name: 'Cross', icon: X },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'square', name: 'Square', icon: Square },
    { id: 'highlight', name: 'Highlight', icon: Highlighter },
    { id: 'freeText', name: 'Text', icon: Type },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
        {/* Annotation tools */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
            Tools
          </span>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1">
            {tools.map((tool) => {
              const Icon = tool.icon
              const isActive = activeTool === tool.id
              return (
                <button
                  key={tool.id ?? 'select'}
                  onClick={() =>
                    handleSetTool(isActive && tool.id !== null ? null : tool.id)
                  }
                  className={`rounded p-2 transition-colors ${
                    isActive
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                      : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                  title={tool.name}
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Import/Export actions */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
            Import / Export
          </span>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExport}
              disabled={annotationCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} />
              Export ({annotationCount})
            </button>
            <button
              onClick={handleClear}
              disabled={annotationCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
              Clear All
            </button>
            <button
              onClick={handleImport}
              disabled={!exported}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={14} />
              Import{exported ? ` (${exported.length})` : ''}
            </button>
          </div>

          {status && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            annotations: {
              annotationAuthor: 'Guest User',
              selectAfterCreate: true,
            },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'import-export-doc',
                },
              ],
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
