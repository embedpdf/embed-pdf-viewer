'use client'

import { usePdfiumEngine } from '@embedpdf/engines/react'
import { ignore, PdfDocumentObject, Rotation } from '@embedpdf/models'
import { useState } from 'react'

export default function RenderPageExample() {
  const { isLoading, error, engine } = usePdfiumEngine()
  const [document, setDocument] = useState<PdfDocumentObject | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)

  if (error) {
    return (
      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Failed to load PDF engine: {error.message}
      </div>
    )
  }

  if (isLoading || !engine) {
    return (
      <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm font-medium text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
        Loading PDF engine...
      </div>
    )
  }

  if (loadingDocument) {
    return (
      <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm font-medium text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
        Loading document...
      </div>
    )
  }

  if (loadingImage) {
    return (
      <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm font-medium text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
        Loading image...
      </div>
    )
  }

  const loadDocument = async () => {
    setLoadingDocument(true)
    const task = engine.openDocumentUrl(
      {
        id: 'my-pdf',
        url: 'https://www.embedpdf.com/ebook.pdf',
      },
      {
        mode: 'full-fetch',
      },
    )

    task.wait((doc) => {
      setDocument(doc)
      setLoadingDocument(false)
    }, ignore)
  }

  const renderPage = () => {
    if (!document) {
      return
    }
    setLoadingImage(true)
    const page = document.pages[0]
    const renderTask = engine.renderPage(document, page, {
      scaleFactor: 1.0,
      dpr: window.devicePixelRatio,
      rotation: Rotation.Degree0,
      withAnnotations: true,
    })

    renderTask.wait((blob) => {
      const url = URL.createObjectURL(blob)
      setImageUrl(url)
      setLoadingImage(false)
    }, ignore)
  }

  const revokeImageUrl = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }
  }

  if (document && imageUrl) {
    return (
      <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
        Page rendered successfully!{' '}
        <img
          className="mt-2"
          style={{ maxWidth: '400px' }}
          onLoad={revokeImageUrl}
          src={imageUrl}
          alt="Rendered page"
        />
      </div>
    )
  }

  if (document) {
    return (
      <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
        Document loaded successfully! The document has {document.pageCount}{' '}
        pages.{' '}
        <button
          className="ml-2 rounded-md border border-green-300 bg-green-200 p-2 text-sm font-medium text-green-800 shadow-sm ring-1 ring-green-300 transition-colors hover:bg-green-300 dark:border-green-700 dark:bg-green-800 dark:text-green-200 dark:ring-green-700 dark:hover:bg-green-700"
          onClick={renderPage}
        >
          Click to render first page
        </button>
      </div>
    )
  }

  // Engine is ready to use
  return (
    <div className="mt-3 rounded-md bg-green-50 p-4 text-sm font-medium text-green-800">
      Engine loaded successfully!{' '}
      <button
        className="ml-2 rounded-md bg-green-200 p-2 text-sm font-medium text-green-800"
        onClick={loadDocument}
      >
        Click to load document
      </button>
    </div>
  )
}
