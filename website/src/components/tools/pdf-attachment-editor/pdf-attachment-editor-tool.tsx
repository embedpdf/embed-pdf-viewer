'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useEngine } from '@embedpdf/engines/react'
import {
  PdfDocumentObject,
  PdfAttachmentObject,
  PdfAddAttachmentParams,
} from '@embedpdf/models'
import { ToolLayout } from '../shared/tool-layout'
import { FilePicker, DocumentWithFile } from '../shared/file-picker'
import { LoadingState } from '../shared/loading-state'
import { ResultCard } from '../shared/result-card'
import { FAQ } from '../shared/faq'
import { AttachmentList } from './attachment-list'
import { AddAttachmentModal } from './add-attachment-modal'
import { attachmentFAQs } from './faq-data'
import { EditableAttachment } from './types'
import { RotateCcw, Plus, Save, Paperclip, FileText } from 'lucide-react'

export const PdfAttachmentEditorTool = () => {
  const engine = useEngine()
  const [pdfDocument, setPdfDocument] = useState<{
    doc: PdfDocumentObject
    fileName: string
  } | null>(null)
  const [attachments, setAttachments] = useState<EditableAttachment[]>([])
  const [originalAttachments, setOriginalAttachments] = useState<
    EditableAttachment[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedPdf, setSavedPdf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    return () => {
      if (engine && pdfDocument) {
        engine.closeDocument(pdfDocument.doc).wait(
          () => console.log('Document closed'),
          (error) => console.error('Error closing document:', error),
        )
      }
    }
  }, [engine, pdfDocument])

  // Fetch attachments and convert to editable format
  const fetchAttachments = useCallback(async () => {
    if (!engine || !pdfDocument) return

    try {
      const result = await engine.getAttachments(pdfDocument.doc).toPromise()
      const editableAttachments: EditableAttachment[] = result.map(
        (attachment) => ({
          ...attachment,
          id: `attachment-${attachment.index}`,
          isMarkedForDeletion: false,
        }),
      )
      return editableAttachments
    } catch (err) {
      console.error('Error fetching attachments:', err)
      throw err
    }
  }, [engine, pdfDocument])

  const handleDocumentSelect = async (docs: DocumentWithFile[]) => {
    if (!engine || docs.length === 0) return

    const { doc, fileName } = docs[0]
    setIsLoading(true)
    setError(null)

    try {
      setPdfDocument({ doc, fileName })
      const attachmentList = await engine.getAttachments(doc).toPromise()
      const editableAttachments: EditableAttachment[] = attachmentList.map(
        (attachment) => ({
          ...attachment,
          id: `attachment-${attachment.index}`,
          isMarkedForDeletion: false,
        }),
      )

      setAttachments(editableAttachments)
      setOriginalAttachments(JSON.parse(JSON.stringify(editableAttachments)))
      setHasChanges(false)
    } catch (err) {
      console.error('Error getting attachments:', err)
      setError('Failed to read PDF attachments. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadAttachment = async (attachment: EditableAttachment) => {
    if (!engine || !pdfDocument) return

    try {
      const content = await engine
        .readAttachmentContent(pdfDocument.doc, attachment)
        .toPromise()

      const blob = new Blob([content], {
        type: attachment.mimeType || 'application/octet-stream',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.name || `attachment_${attachment.index}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading attachment:', err)
      setError('Failed to download attachment.')
    }
  }

  const handleRemoveAttachment = async (attachment: EditableAttachment) => {
    if (!engine || !pdfDocument) return

    if (
      !window.confirm(
        `Are you sure you want to remove "${attachment.name}"? This action cannot be undone after saving.`,
      )
    ) {
      return
    }

    setIsLoading(true)
    try {
      await engine.removeAttachment(pdfDocument.doc, attachment).toPromise()

      // Refetch attachments to get updated indices
      const updatedAttachments = await fetchAttachments()
      if (updatedAttachments) {
        setAttachments(updatedAttachments)
        setHasChanges(true)
      }
    } catch (err) {
      console.error('Error removing attachment:', err)
      setError('Failed to remove attachment.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddAttachment = async (params: PdfAddAttachmentParams) => {
    if (!engine || !pdfDocument) return

    setIsLoading(true)
    try {
      await engine.addAttachment(pdfDocument.doc, params).toPromise()

      // Refetch attachments to get updated list with correct indices
      const updatedAttachments = await fetchAttachments()
      if (updatedAttachments) {
        setAttachments(updatedAttachments)
        setHasChanges(true)
      }
      setShowAddModal(false)
    } catch (err: any) {
      console.error('Error adding attachment:', err)
      // Check if it's a duplicate name error
      if (err?.message?.includes('already exists')) {
        setError(
          'An attachment with this name already exists. Please use a different name.',
        )
      } else {
        setError('Failed to add attachment.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!engine || !pdfDocument) return

    setIsSaving(true)
    setError(null)

    try {
      // Save the document with current attachments
      const savedDoc = await engine.saveAsCopy(pdfDocument.doc).toPromise()

      // Create download URL
      const blob = new Blob([savedDoc], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setSavedPdf(url)
      setHasChanges(false)

      // Update original attachments to match current state
      setOriginalAttachments(JSON.parse(JSON.stringify(attachments)))
    } catch (err) {
      console.error('Error saving document:', err)
      setError('Failed to save document. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!engine || !pdfDocument) return

    setIsLoading(true)
    try {
      // Refetch original attachments from the document
      const attachmentList = await engine
        .getAttachments(pdfDocument.doc)
        .toPromise()
      const editableAttachments: EditableAttachment[] = attachmentList.map(
        (attachment) => ({
          ...attachment,
          id: `attachment-${attachment.index}`,
          isMarkedForDeletion: false,
        }),
      )
      setAttachments(editableAttachments)
      setHasChanges(false)
      setError(null)
    } catch (err) {
      console.error('Error resetting attachments:', err)
      setError('Failed to reset attachments.')
    } finally {
      setIsLoading(false)
    }
  }

  const resetTool = () => {
    if (engine && pdfDocument) {
      engine.closeDocument(pdfDocument.doc).wait(
        () => console.log('Document closed'),
        (error) => console.error('Error closing document:', error),
      )
    }
    setPdfDocument(null)
    setAttachments([])
    setOriginalAttachments([])
    setSavedPdf(null)
    setError(null)
    setHasChanges(false)
  }

  return (
    <ToolLayout
      title="Manage PDF Attachments"
      subtitle="right in your browser"
      description="View, add, and remove file attachments in your PDF documents"
      badgeText="PDF Attachment Editor"
      badgeColor="border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/30 dark:bg-orange-900/20 dark:text-orange-300"
      gradientColor="from-orange-600 to-amber-600"
    >
      {!engine ? (
        <LoadingState borderColor="border-orange-500" />
      ) : error ? (
        <div className="mb-12 text-center">
          <div className="mx-auto max-w-md rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            Try again
          </button>
        </div>
      ) : savedPdf ? (
        <ResultCard
          title="Attachments Updated Successfully!"
          message="Your PDF with updated attachments is ready to download."
          download={{
            url: savedPdf,
            originalFileName: pdfDocument?.fileName || 'document.pdf',
            suffix: '_attachments_updated',
            label: 'Download Updated PDF',
          }}
          secondary={{
            label: 'Edit Another PDF',
            onClick: resetTool,
            icon: RotateCcw,
          }}
          accent="orange"
        />
      ) : !pdfDocument ? (
        <FilePicker
          engine={engine}
          onDocumentSelect={handleDocumentSelect}
          multiple={false}
          buttonText="Choose PDF File"
          helperText="Select a PDF file to view and manage its attachments."
          disabled={isLoading}
          gradientColor="from-orange-600 to-amber-600"
        />
      ) : (
        <div className="space-y-6">
          {/* Document Info Header */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 opacity-20 blur transition duration-300"></div>
            <div className="relative rounded-2xl bg-white p-6 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-orange-600 to-amber-600">
                      <FileText className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      Managing Attachments
                    </h3>
                    <p className="text-gray-600">{pdfDocument.fileName}</p>
                    <p className="text-sm text-gray-500">
                      {attachments.length} attachment
                      {attachments.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {hasChanges && (
                  <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                    Unsaved changes
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attachments Manager */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 opacity-10 blur transition duration-300 group-hover:opacity-20"></div>
            <div className="relative overflow-hidden rounded-2xl bg-white shadow-md">
              <div className="p-8">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                    <Paperclip className="h-7 w-7 text-orange-600" />
                    Document Attachments
                  </h3>
                  <button
                    onClick={() => setShowAddModal(true)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Attachment
                  </button>
                </div>

                <AttachmentList
                  attachments={attachments}
                  onDownload={handleDownloadAttachment}
                  onRemove={handleRemoveAttachment}
                  isLoading={isLoading}
                />

                {/* Action Buttons */}
                {hasChanges && (
                  <div className="mt-8 flex flex-col gap-4 border-t border-gray-200 pt-8 sm:flex-row">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:shadow-lg disabled:opacity-50"
                    >
                      <Save className="h-5 w-5" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={isLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-8 py-4 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-5 w-5" />
                      Reset Changes
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Attachment Modal */}
      {showAddModal && (
        <AddAttachmentModal
          onAdd={handleAddAttachment}
          onClose={() => setShowAddModal(false)}
          isLoading={isLoading}
        />
      )}

      {/* FAQ Section */}
      <div className="mt-16">
        <FAQ
          items={attachmentFAQs}
          title="Frequently Asked Questions"
          subtitle="Everything you need to know about managing PDF attachments"
          gradientColor="from-orange-600 to-amber-600"
        />
      </div>
    </ToolLayout>
  )
}
