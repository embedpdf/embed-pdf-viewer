'use client'

import React, { useEffect, useState } from 'react'
import { useEngine } from '@embedpdf/engines/react'
import { PdfDocumentObject, PdfMetadataObject } from '@embedpdf/models'
import { ToolLayout } from '../shared/tool-layout'
import { FilePicker, DocumentWithFile } from '../shared/file-picker'
import { LoadingState } from '../shared/loading-state'
import { MetadataForm } from './metadata-form'
import { FAQ } from '../shared/faq'
import { metadataFAQs } from '../shared/faq-data'
import { ResultCard } from '../shared/result-card'
import { RotateCcw } from 'lucide-react'

interface DocumentWithMetadata {
  doc: PdfDocumentObject
  metadata: PdfMetadataObject
  fileName: string
}

export const PdfMetadataEditorTool = () => {
  const engine = useEngine()
  const [document, setDocument] = useState<DocumentWithMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [modifiedPdf, setModifiedPdf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (engine) {
        engine.closeAllDocuments().wait(
          () => console.log('Documents closed successfully'),
          (error) => console.error('Error closing documents:', error),
        )
      }
    }
  }, [engine])

  const handleDocumentSelect = async (docs: DocumentWithFile[]) => {
    if (!engine || docs.length === 0) return

    const { doc, fileName } = docs[0] // Only handle single file
    setIsLoading(true)
    setError(null)

    try {
      // Get metadata
      const metadata = await engine.getMetadata(doc).toPromise()

      setDocument({
        doc,
        metadata,
        fileName,
      })
    } catch (err) {
      console.error('Error getting metadata:', err)
      setError('Failed to read PDF metadata. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMetadataUpdate = async (
    updatedMetadata: Partial<PdfMetadataObject>,
  ) => {
    if (!engine || !document) return

    setIsLoading(true)
    setError(null)

    try {
      // Update metadata
      await engine
        .setMetadata(document.doc, {
          ...document.metadata,
          ...updatedMetadata,
          modificationDate: new Date(),
        })
        .toPromise()

      // Save document
      const savedDoc = await engine.saveAsCopy(document.doc).toPromise()

      // Create download URL
      const blob = new Blob([savedDoc], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setModifiedPdf(url)

      // Update local metadata state
      setDocument((prev) =>
        prev
          ? {
              ...prev,
              metadata: { ...prev.metadata, ...updatedMetadata },
            }
          : null,
      )
    } catch (err) {
      console.error('Error updating metadata:', err)
      setError('Failed to update metadata. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const resetTool = () => {
    if (engine && document) {
      engine.closeDocument(document.doc).wait(
        () => console.log('Document closed'),
        (error) => console.error('Error closing document:', error),
      )
    }

    setDocument(null)
    setModifiedPdf(null)
    setError(null)
  }

  const faqItems = [...metadataFAQs]

  return (
    <ToolLayout
      title="Edit PDF Metadata"
      subtitle="right in your browser"
      description="Securely edit PDF document properties and metadata"
      badgeText="PDF Metadata Editor"
      badgeColor="border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300"
      gradientColor="from-purple-600 to-pink-700"
    >
      {!engine ? (
        <LoadingState borderColor="border-pink-500" />
      ) : error ? (
        <div className="mb-12 text-center">
          <div className="mx-auto max-w-md rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-4 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Try again
          </button>
        </div>
      ) : modifiedPdf ? (
        <ResultCard
          title="Metadata Updated Successfully!"
          message="Your PDF metadata has been updated. Download the modified file below."
          download={{
            url: modifiedPdf,
            originalFileName: document?.fileName || 'document.pdf',
            suffix: '_metadata_updated',
            label: 'Download Updated PDF',
          }}
          secondary={{
            label: 'Edit Another PDF',
            onClick: resetTool,
            icon: RotateCcw,
          }}
        />
      ) : !document ? (
        <FilePicker
          engine={engine}
          onDocumentSelect={handleDocumentSelect}
          multiple={false}
          buttonText="Choose PDF File"
          helperText="Select a PDF file to view and edit its metadata."
          disabled={isLoading}
          gradientColor="from-purple-600 to-pink-700"
        />
      ) : (
        <MetadataForm
          metadata={document.metadata}
          fileName={document.fileName}
          onUpdate={handleMetadataUpdate}
          onReset={resetTool}
          isLoading={isLoading}
        />
      )}

      {/* FAQ Section */}
      <div className="mt-16">
        <FAQ
          items={faqItems}
          title="Frequently Asked Questions"
          subtitle="Everything you need to know about editing PDF metadata"
          gradientColor="from-purple-600 to-pink-700"
        />
      </div>
    </ToolLayout>
  )
}
