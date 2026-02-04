'use client'
import { PDFViewer, PDFViewerRef } from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect } from 'react'

interface ViewerExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function ViewerExample({
  themePreference = 'light',
}: ViewerExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
      <PDFViewer
        ref={viewerRef}
        config={{
          src: 'https://snippet.embedpdf.com/ebook.pdf',
          theme: { preference: themePreference },
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
