'use client'
import {
  PDFViewer,
  PDFViewerRef,
  RotatePlugin,
  type RotateScope,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { RotateCw, RotateCcw } from 'lucide-react'

interface RotateExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function RotateExample({
  themePreference = 'light',
}: RotateExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [rotate, setRotate] = useState<RotateScope | null>(null)
  const [currentRotation, setCurrentRotation] = useState(0)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Get rotate capability once and subscribe to changes
  useEffect(() => {
    const cleanups: (() => void)[] = []

    viewerRef.current?.registry?.then((registry) => {
      const rotatePlugin = registry
        .getPlugin<RotatePlugin>('rotate')
        ?.provides()

      // Get the scope for the specific document we are loading
      const docRotate = rotatePlugin?.forDocument('ebook')

      if (!docRotate) return

      setRotate(docRotate)
      setCurrentRotation(docRotate.getRotation())

      // Subscribe to rotation changes
      cleanups.push(
        docRotate.onRotateChange((rotation) => {
          setCurrentRotation(rotation)
        }),
      )
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* External Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => rotate?.rotateBackward()}
              className="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
              title="Rotate Counter-Clockwise"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={() => rotate?.rotateForward()}
              className="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
              title="Rotate Clockwise"
            >
              <RotateCw size={20} />
            </button>
          </div>
          <span className="font-mono text-sm font-medium text-gray-600 dark:text-gray-300">
            Rotation: {currentRotation * 90}°
          </span>
        </div>
      </div>

      {/* Viewer */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'ebook',
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
