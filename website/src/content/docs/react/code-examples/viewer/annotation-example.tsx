'use client'
import {
  PDFViewer,
  PDFViewerRef,
  AnnotationPlugin,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect, useState } from 'react'
import { Highlighter, Pen, Square, MousePointer2 } from 'lucide-react'

interface AnnotationExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function AnnotationExample({
  themePreference = 'light',
}: AnnotationExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<string>('Ready')

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Subscribe to tool changes and annotation events
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let cleanupTool: (() => void) | undefined
    let cleanupEvents: (() => void) | undefined

    const setupListeners = async () => {
      const registry = await viewer.registry
      const annotationPlugin = registry
        ?.getPlugin<AnnotationPlugin>('annotation')
        ?.provides()

      if (annotationPlugin) {
        // Listen for tool changes
        cleanupTool = annotationPlugin.onActiveToolChange(({ tool }) => {
          setActiveTool(tool?.id || null)
        })

        // Listen for annotation creation/updates
        cleanupEvents = annotationPlugin.onAnnotationEvent((event) => {
          if (event.type === 'create') {
            setLastEvent(`Created annotation on page ${event.pageIndex + 1}`)
          } else if (event.type === 'delete') {
            setLastEvent(`Deleted annotation from page ${event.pageIndex + 1}`)
          }
        })
      }
    }

    setupListeners()

    return () => {
      cleanupTool?.()
      cleanupEvents?.()
    }
  }, [])

  const setTool = async (toolId: string | null) => {
    const registry = await viewerRef.current?.registry
    const annotationPlugin = registry
      ?.getPlugin<AnnotationPlugin>('annotation')
      ?.provides()
    annotationPlugin?.setActiveTool(toolId)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Tools:
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setTool(null)}
                className={`rounded p-2 transition-colors ${
                  activeTool === null
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                title="Select / None"
              >
                <MousePointer2 size={18} />
              </button>
              <button
                onClick={() => setTool('highlight')}
                className={`rounded p-2 transition-colors ${
                  activeTool === 'highlight'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                title="Highlighter"
              >
                <Highlighter size={18} />
              </button>
              <button
                onClick={() => setTool('ink')}
                className={`rounded p-2 transition-colors ${
                  activeTool === 'ink'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                title="Pen (Ink)"
              >
                <Pen size={18} />
              </button>
              <button
                onClick={() => setTool('square')}
                className={`rounded p-2 transition-colors ${
                  activeTool === 'square'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                title="Square"
              >
                <Square size={18} />
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Log: {lastEvent}
          </div>
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
              // Automatically select created annotations
              selectAfterCreate: true,
            },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'annotation-doc',
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
