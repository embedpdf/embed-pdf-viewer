'use client'

import React, { useState } from 'react'
import { PdfAddAttachmentParams } from '@embedpdf/models'
import { X, Upload, FileText, AlertCircle } from 'lucide-react'

interface AddAttachmentModalProps {
  onAdd: (params: PdfAddAttachmentParams) => void
  onClose: () => void
  isLoading?: boolean
}

export const AddAttachmentModal: React.FC<AddAttachmentModalProps> = ({
  onAdd,
  onClose,
  isLoading = false,
}) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    // Auto-fill name if empty
    if (!name) {
      setName(selectedFile.name)
    }
    setError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Attachment name is required')
      return
    }

    if (!file) {
      setError('Please select a file to attach')
      return
    }

    try {
      const arrayBuffer = await file.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      const params: PdfAddAttachmentParams = {
        name: name.trim(),
        description: description.trim() || '',
        mimeType: file.type || 'application/octet-stream',
        data,
      }

      onAdd(params)
    } catch (err) {
      console.error('Error reading file:', err)
      setError('Failed to read the selected file')
    }
  }

  const formatFileSize = (size: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let formattedSize = size

    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024
      unitIndex++
    }

    return `${formattedSize.toFixed(2)} ${units[unitIndex]}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Add Attachment</h3>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              File to Attach <span className="text-red-500">*</span>
            </label>
            <div
              className={`relative rounded-lg border-2 border-dashed p-6 transition-colors ${
                dragOver
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-300 bg-gray-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                onChange={handleFileChange}
                disabled={isLoading}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                id="attachment-file"
              />

              <div className="text-center">
                {file ? (
                  <div className="space-y-2">
                    <FileText className="mx-auto h-10 w-10 text-orange-600" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(file.size)} •{' '}
                        {file.type || 'Unknown type'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm text-gray-600">
                      Click to select or drag and drop a file here
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Any file type is supported
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Attachment Name */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Attachment Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              placeholder="e.g., Invoice_2024.xlsx"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 transition-colors focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              This name will be shown in the PDF attachment list
            </p>
          </div>

          {/* Description (optional) */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              placeholder="Brief description of the attachment..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 transition-colors focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading || !file || !name.trim()}
              className="flex-1 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-2.5 font-medium text-white transition-all duration-200 hover:shadow-lg disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Attachment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
