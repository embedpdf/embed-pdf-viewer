'use client'

import React from 'react'
import { EditableAttachment } from './types'
import {
  Download,
  Trash2,
  FileText,
  FileImage,
  FileArchive,
  File,
  Paperclip,
} from 'lucide-react'

interface AttachmentListProps {
  attachments: EditableAttachment[]
  onDownload: (attachment: EditableAttachment) => void
  onRemove: (attachment: EditableAttachment) => void
  isLoading?: boolean
}

export const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onDownload,
  onRemove,
  isLoading = false,
}) => {
  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="h-5 w-5" />

    if (mimeType.startsWith('image/')) {
      return <FileImage className="h-5 w-5" />
    }
    if (mimeType.startsWith('text/') || mimeType.includes('pdf')) {
      return <FileText className="h-5 w-5" />
    }
    if (mimeType.includes('zip') || mimeType.includes('compressed')) {
      return <FileArchive className="h-5 w-5" />
    }

    return <File className="h-5 w-5" />
  }

  const formatFileSize = (size?: number) => {
    if (!size) return 'Unknown size'

    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let formattedSize = size

    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024
      unitIndex++
    }

    return `${formattedSize.toFixed(2)} ${units[unitIndex]}`
  }

  const formatDate = (date?: Date) => {
    if (!date) return 'Unknown date'

    try {
      const d = new Date(date)
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return 'Invalid date'
    }
  }

  if (attachments.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center">
        <Paperclip className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        <h4 className="mb-2 text-lg font-medium text-gray-900">
          No Attachments
        </h4>
        <p className="text-gray-500">
          This document doesn&apos;t have any attachments yet.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Click &quot;Add Attachment&quot; to attach files to this PDF.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id}
          className={`group relative rounded-lg border transition-all ${
            attachment.isMarkedForDeletion
              ? 'border-red-200 bg-red-50'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center p-4">
            {/* File Icon */}
            <div className="flex-shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600">
                {getFileIcon(attachment.mimeType)}
              </div>
            </div>

            {/* Attachment Info */}
            <div className="ml-4 flex-1">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-gray-900">
                    {attachment.name || `Attachment ${index + 1}`}
                  </h4>
                  {attachment.description && (
                    <p className="mt-1 truncate text-sm text-gray-600">
                      {attachment.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center">
                      <span className="font-medium">Size:</span>
                      <span className="ml-1">
                        {formatFileSize(attachment.size)}
                      </span>
                    </span>
                    {attachment.creationDate && (
                      <span className="inline-flex items-center">
                        <span className="font-medium">Added:</span>
                        <span className="ml-1">
                          {formatDate(attachment.creationDate)}
                        </span>
                      </span>
                    )}
                    {attachment.mimeType && (
                      <span className="inline-flex items-center">
                        <span className="font-medium">Type:</span>
                        <span className="ml-1">
                          {attachment.mimeType
                            .split('/')
                            .pop()
                            ?.toUpperCase() || 'File'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="ml-4 flex items-center gap-2">
                  <button
                    onClick={() => onDownload(attachment)}
                    disabled={isLoading}
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                    title="Download attachment"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => onRemove(attachment)}
                    disabled={isLoading}
                    className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    title="Remove attachment"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Optional: Show checksum if available */}
          {attachment.checksum && (
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-xs text-gray-500">
                <span className="font-medium">Checksum:</span>{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
                  {attachment.checksum}
                </code>
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Summary */}
      {attachments.length > 0 && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <p>
            <strong>{attachments.length}</strong> attachment
            {attachments.length !== 1 ? 's' : ''} • Total size:{' '}
            {formatFileSize(
              attachments.reduce((sum, att) => sum + (att.size || 0), 0),
            )}
          </p>
        </div>
      )}
    </div>
  )
}
