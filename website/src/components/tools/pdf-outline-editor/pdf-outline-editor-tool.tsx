'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useEngine } from '@embedpdf/engines/react'
import {
  PdfDocumentObject,
  PdfBookmarkObject,
  PdfZoomMode,
} from '@embedpdf/models'
import { ToolLayout } from '../shared/tool-layout'
import { FilePicker, DocumentWithFile } from '../shared/file-picker'
import { LoadingState } from '../shared/loading-state'
import { ResultCard } from '../shared/result-card'
import { FAQ } from '../shared/faq'
import { BookmarkTree } from './bookmark-tree'
import { EditableBookmark } from './types'
import { RotateCcw, Plus, Save, FileText, BookOpen } from 'lucide-react'
import { outlineFAQs } from './faq-data'

export const PdfOutlineEditorTool = () => {
  const engine = useEngine()
  const [document, setDocument] = useState<{
    doc: PdfDocumentObject
    fileName: string
  } | null>(null)
  const [bookmarks, setBookmarks] = useState<EditableBookmark[]>([])
  const [originalBookmarks, setOriginalBookmarks] = useState<
    EditableBookmark[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedPdf, setSavedPdf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    return () => {
      if (engine && document) {
        engine.closeDocument(document.doc).wait(
          () => console.log('Document closed'),
          (error) => console.error('Error closing document:', error),
        )
      }
    }
  }, [engine, document])

  // Convert PdfBookmarkObject to EditableBookmark with IDs
  const convertToEditable = (
    bookmarks: PdfBookmarkObject[],
    parentId?: string,
  ): EditableBookmark[] => {
    return bookmarks.map((bookmark, index) => {
      const id = `${parentId || 'root'}-${index}-${Date.now()}-${Math.random()}`
      return {
        ...bookmark,
        id,
        parentId,
        isExpanded: true,
        children: bookmark.children
          ? convertToEditable(bookmark.children, id)
          : undefined,
      }
    })
  }

  // Convert EditableBookmark back to PdfBookmarkObject
  const convertFromEditable = (
    bookmarks: EditableBookmark[],
  ): PdfBookmarkObject[] => {
    return bookmarks.map(
      ({ id, parentId, isEditing, isExpanded, isNew, ...bookmark }) => ({
        ...bookmark,
        children: bookmark.children
          ? convertFromEditable(bookmark.children as EditableBookmark[])
          : undefined,
      }),
    )
  }

  const handleDocumentSelect = async (docs: DocumentWithFile[]) => {
    if (!engine || docs.length === 0) return

    const { doc, fileName } = docs[0]
    setIsLoading(true)
    setError(null)

    try {
      const result = await engine.getBookmarks(doc).toPromise()
      const editableBookmarks = convertToEditable(result.bookmarks || [])

      setDocument({ doc, fileName })
      setBookmarks(editableBookmarks)
      setOriginalBookmarks(JSON.parse(JSON.stringify(editableBookmarks)))
      setHasChanges(false)
    } catch (err) {
      console.error('Error getting bookmarks:', err)
      setError('Failed to read PDF bookmarks. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBookmarksChange = useCallback(
    (newBookmarks: EditableBookmark[]) => {
      setBookmarks(newBookmarks)
      setHasChanges(true)
    },
    [],
  )

  const handleAddRootBookmark = () => {
    const newBookmark: EditableBookmark = {
      id: `new-${Date.now()}`,
      title: 'New Bookmark',
      target: {
        type: 'destination',
        destination: {
          pageIndex: 0,
          zoom: { mode: PdfZoomMode.FitPage },
          view: [],
        },
      },
      isEditing: true,
      isNew: true,
      isExpanded: true,
    }
    setBookmarks([...bookmarks, newBookmark])
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!engine || !document) return

    setIsSaving(true)
    setError(null)

    try {
      // Convert back to PdfBookmarkObject format
      const bookmarksToSave = convertFromEditable(bookmarks)

      // Update bookmarks
      await engine.setBookmarks(document.doc, bookmarksToSave).toPromise()

      // Save the document
      const savedDoc = await engine.saveAsCopy(document.doc).toPromise()

      // Create download URL
      const blob = new Blob([savedDoc], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setSavedPdf(url)
      setHasChanges(false)
    } catch (err) {
      console.error('Error saving bookmarks:', err)
      setError('Failed to save bookmarks. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete all bookmarks? This action cannot be undone.',
      )
    ) {
      return
    }
    setBookmarks([])
    setHasChanges(true)
  }

  const handleReset = () => {
    setBookmarks(JSON.parse(JSON.stringify(originalBookmarks)))
    setHasChanges(false)
  }

  const resetTool = () => {
    if (engine && document) {
      engine.closeDocument(document.doc).wait(
        () => console.log('Document closed'),
        (error) => console.error('Error closing document:', error),
      )
    }
    setDocument(null)
    setBookmarks([])
    setOriginalBookmarks([])
    setSavedPdf(null)
    setError(null)
    setHasChanges(false)
  }

  return (
    <ToolLayout
      title="Edit PDF Outlines"
      subtitle="right in your browser"
      description="Manage bookmarks and navigation in your PDF documents"
      badgeText="PDF Outline Editor"
      badgeColor="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/30 dark:bg-indigo-900/20 dark:text-indigo-300"
      gradientColor="from-teal-600 to-green-700"
    >
      {!engine ? (
        <LoadingState borderColor="border-indigo-500" />
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
      ) : savedPdf ? (
        <ResultCard
          title="Bookmarks Updated Successfully!"
          message="Your PDF with updated bookmarks is ready to download."
          download={{
            url: savedPdf,
            originalFileName: document?.fileName || 'document.pdf',
            suffix: '_bookmarks_updated',
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
          helperText="Select a PDF file to view and edit its bookmarks/outlines."
          disabled={isLoading}
          gradientColor="from-teal-600 to-green-700"
        />
      ) : (
        <div className="space-y-6">
          {/* Document Info Header */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-teal-600 to-green-700 opacity-20 blur transition duration-300 dark:opacity-30"></div>
            <div className="relative rounded-2xl bg-white p-6 shadow-md dark:border dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-green-700 shadow-sm">
                      <FileText className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      Editing Bookmarks
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {document.fileName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      {document.doc.pageCount} page
                      {document.doc.pageCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {hasChanges && (
                  <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Unsaved changes
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bookmark Editor */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-teal-600 to-green-700 opacity-10 blur transition duration-300 group-hover:opacity-20 dark:opacity-20 dark:group-hover:opacity-30"></div>
            <div className="relative overflow-hidden rounded-2xl bg-white shadow-md dark:border dark:border-gray-800 dark:bg-gray-900">
              <div className="p-8">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
                    <BookOpen className="h-7 w-7 text-teal-600 dark:text-teal-400" />
                    Document Outline
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddRootBookmark}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                    >
                      <Plus className="h-4 w-4" />
                      Add Bookmark
                    </button>
                    {bookmarks.length > 0 && (
                      <button
                        onClick={handleDeleteAll}
                        className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        Delete All
                      </button>
                    )}
                  </div>
                </div>

                {bookmarks.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
                    <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                    <h4 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                      No Bookmarks
                    </h4>
                    <p className="mb-4 text-gray-500 dark:text-gray-400">
                      This document doesn&apos;t have any bookmarks yet.
                    </p>
                    <button
                      onClick={handleAddRootBookmark}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-700 px-6 py-3 font-medium text-white transition-all duration-200 hover:shadow-lg"
                    >
                      <Plus className="h-5 w-5" />
                      Create First Bookmark
                    </button>
                  </div>
                ) : (
                  <BookmarkTree
                    bookmarks={bookmarks}
                    document={document.doc}
                    onChange={handleBookmarksChange}
                  />
                )}

                {/* Action Buttons */}
                {(bookmarks.length > 0 || hasChanges) && (
                  <div className="mt-8 flex flex-col gap-4 border-t border-gray-200 pt-8 dark:border-gray-700 sm:flex-row">
                    <button
                      onClick={handleSave}
                      disabled={isSaving || !hasChanges}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-green-700 px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:shadow-lg disabled:opacity-50"
                    >
                      <Save className="h-5 w-5" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    {hasChanges && (
                      <button
                        onClick={handleReset}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-8 py-4 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <RotateCcw className="h-5 w-5" />
                        Reset Changes
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <div className="mt-16">
        <FAQ
          items={outlineFAQs}
          title="Frequently Asked Questions"
          subtitle="Everything you need to know about editing PDF bookmarks"
          gradientColor="from-indigo-600 to-purple-700"
        />
      </div>
    </ToolLayout>
  )
}
