'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PdfEngine, PdfDocumentObject, uuidV4 } from '@embedpdf/models'
import { Lock, Upload, AlertCircle, X } from 'lucide-react'

export interface DocumentWithFile {
  doc: PdfDocumentObject
  fileName: string
}

type PendingFile = {
  id: string
  file: File
  needsPassword: boolean
  password: string
  isValidated?: boolean
  hasFailedAttempt?: boolean
}

type StagedItem = {
  id: string
  file: File
}

interface FilePickerProps {
  engine: PdfEngine | null
  onDocumentSelect: (docs: DocumentWithFile[]) => void
  accept?: string
  multiple?: boolean
  buttonText?: string
  helperText?: string
  disabled?: boolean
  gradientColor?: string
}

export const FilePicker = ({
  engine,
  onDocumentSelect,
  accept = '.pdf',
  multiple = false,
  buttonText = 'Choose PDF Files',
  helperText = 'All processing happens locally in your browser for complete privacy.',
  disabled = false,
  gradientColor = 'from-blue-600 to-teal-500',
}: FilePickerProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Staging (pre-processing)
  const [stagedFiles, setStagedFiles] = useState<StagedItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Processing state
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [loadedDocuments, setLoadedDocuments] = useState<DocumentWithFile[]>([])

  // Refs that always hold latest state (for sequencing after async steps)
  const pendingRef = useRef(pendingFiles)
  const loadedRef = useRef(loadedDocuments)
  useEffect(() => {
    pendingRef.current = pendingFiles
  }, [pendingFiles])
  useEffect(() => {
    loadedRef.current = loadedDocuments
  }, [loadedDocuments])

  // Fire onDocumentSelect exactly once when everything is processed successfully
  const selectionComplete =
    pendingFiles.length === 0 && loadedDocuments.length > 0
  const hasFiredRef = useRef(false)
  useEffect(() => {
    if (selectionComplete && !hasFiredRef.current) {
      hasFiredRef.current = true
      onDocumentSelect(loadedRef.current)
    }
    if (!selectionComplete) {
      hasFiredRef.current = false
    }
  }, [selectionComplete, onDocumentSelect])

  // ---- Helpers ----
  const inputId = useMemo(
    () => `file-input-${Math.random().toString(36).slice(2, 9)}`,
    [],
  )

  const isPdf = (f: File) =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

  // dedupe based on (name,size,lastModified)
  const addToStage = (files: File[]) => {
    if (!files.length) return
    const allowed = files.filter(isPdf)
    if (!allowed.length) return

    setStagedFiles((prev) => {
      const existingKeys = new Set(
        prev.map((s) => `${s.file.name}|${s.file.size}|${s.file.lastModified}`),
      )
      const additions: StagedItem[] = []
      for (const file of allowed) {
        const key = `${file.name}|${file.size}|${file.lastModified}`
        if (!existingKeys.has(key)) {
          additions.push({ id: uuidV4(), file })
          existingKeys.add(key)
        }
      }
      const next = [...prev, ...additions]

      // In single-file mode, auto-start immediately with the first file
      if (!multiple && additions.length > 0) {
        startProcessing(next.slice(0, 1))
      }
      return multiple ? next : next.slice(0, 1)
    })
  }

  const removeFromStage = (id: string) => {
    setStagedFiles((prev) => prev.filter((s) => s.id !== id))
  }

  const clearStage = () => setStagedFiles([])

  // ---- File input / DnD ----
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length) addToStage(multiple ? files : [files[0]])
    event.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isLoading && !pendingFiles.length) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (disabled || isLoading || pendingFiles.length) return
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    addToStage(multiple ? files : [files[0]])
  }

  // ---- Start processing staged files ----
  const startProcessing = (items: StagedItem[] = stagedFiles) => {
    if (!items.length) return
    // Reset round state
    setError(null)
    setLoadedDocuments([])
    hasFiredRef.current = false

    const initialPending: PendingFile[] = items.map(({ file }) => ({
      id: uuidV4(),
      file,
      needsPassword: false,
      password: '',
      isValidated: false,
      hasFailedAttempt: false,
    }))

    setPendingFiles(initialPending)
    pendingRef.current = initialPending

    // Clear the stage after moving them into pending
    setStagedFiles([])

    void processFiles(initialPending.map((p) => p.id))
  }

  /**
   * Process a subset of pending files by id (can be one or many).
   * - Removes only the successfully processed files from pending.
   * - Marks password-needed ones without removing them.
   * - Does NOT overwrite unrelated pending entries.
   */
  const processFiles = async (pendingIds: string[]) => {
    if (!engine) {
      setError('PDF engine not initialized. Please wait and try again.')
      return
    }
    if (pendingIds.length === 0) return

    setIsLoading(true)

    const successes: {
      id: string
      fileName: string
      doc: PdfDocumentObject
    }[] = []
    const pwUpdates: Map<string, Partial<PendingFile>> = new Map()

    for (const id of pendingIds) {
      const item = pendingRef.current.find((p) => p.id === id)
      if (!item) continue

      try {
        const arrayBuffer = await item.file.arrayBuffer()
        const doc = await engine
          .openDocumentBuffer(
            { id: uuidV4(), content: arrayBuffer },
            { password: item.password || undefined },
          )
          .toPromise()

        successes.push({ id: item.id, fileName: item.file.name, doc })
      } catch (err: any) {
        console.error('Error loading PDF:', err)
        const reason = err?.reason || err

        // Pdfium password error code = 4
        if (reason?.code === 4) {
          pwUpdates.set(item.id, {
            needsPassword: true,
            isValidated: false,
            hasFailedAttempt: Boolean(item.password?.trim()),
          })
          continue
        }

        // Other error — keep item pending so the user can cancel/retry selection
        setError(
          `Failed to load "${item.file.name}": ${reason?.message || 'Unknown error'}`,
        )
        setIsLoading(false)
        return
      }
    }

    if (successes.length > 0) {
      setLoadedDocuments((prev) => [
        ...prev,
        ...successes.map((s) => ({ doc: s.doc, fileName: s.fileName })),
      ])
    }

    setPendingFiles((prev) => {
      let next = prev.map((p) => {
        const upd = pwUpdates.get(p.id)
        return upd ? { ...p, ...upd } : p
      })
      if (successes.length > 0) {
        const successIds = new Set(successes.map((s) => s.id))
        next = next.filter((p) => !successIds.has(p.id))
      }
      return next
    })

    setIsLoading(false)
  }

  const handlePasswordChange = (id: string, password: string) => {
    setPendingFiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, password } : p)),
    )
  }

  const handlePasswordSubmit = async (id: string) => {
    const item = pendingRef.current.find((p) => p.id === id)
    if (!item || !item.password.trim()) return
    setLoadingFileId(id)
    await processFiles([id])
    setLoadingFileId(null)
  }

  const handleRetry = () => {
    setError(null)
    setPendingFiles([])
    setLoadedDocuments([])
    setStagedFiles([])
    hasFiredRef.current = false
  }

  // ---- Password UI (during processing) ----
  if (pendingFiles.some((f) => f.needsPassword)) {
    return (
      <div className="mb-12">
        <div className="mx-auto max-w-md space-y-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Password Required
            </h3>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              {pendingFiles.filter((f) => f.needsPassword).length === 1
                ? 'This PDF is password protected. Please enter the password to continue.'
                : 'Some PDFs are password protected. Please enter the passwords to continue.'}
            </p>
          </div>

          {pendingFiles.map((file) =>
            file.needsPassword ? (
              <div
                key={file.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password for &quot;{file.file.name}&quot;
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={file.password}
                      onChange={(e) =>
                        handlePasswordChange(file.id, e.target.value)
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' && handlePasswordSubmit(file.id)
                      }
                      placeholder="Enter password..."
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 dark:bg-gray-900 dark:text-white ${
                        file.isValidated
                          ? 'border-green-300 bg-green-50 focus:border-green-500 focus:ring-green-500 dark:border-green-800 dark:bg-green-900/20'
                          : file.hasFailedAttempt
                            ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500 dark:border-red-800 dark:bg-red-900/20'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:focus:border-blue-400 dark:focus:ring-blue-400'
                      }`}
                      disabled={isLoading || file.isValidated}
                    />
                    {file.isValidated && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                        <svg
                          className="h-5 w-5 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  {file.isValidated && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      Password correct ✓
                    </p>
                  )}
                  {file.hasFailedAttempt && !file.isValidated && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Incorrect password
                    </p>
                  )}
                </div>
                {!file.isValidated && (
                  <button
                    onClick={() => handlePasswordSubmit(file.id)}
                    disabled={
                      isLoading ||
                      !file.password.trim() ||
                      loadingFileId === file.id
                    }
                    className={`w-full rounded-md bg-gradient-to-r ${gradientColor} px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {loadingFileId === file.id ? 'Unlocking...' : 'Unlock PDF'}
                  </button>
                )}
              </div>
            ) : null,
          )}

          <div className="text-center">
            <button
              onClick={handleRetry}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancel and select different files
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="mb-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="mx-auto mb-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
        <button
          onClick={handleRetry}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Try again
        </button>
      </div>
    )
  }

  // ---- Staging UI (no pending work) ----
  return (
    <div className="mb-12">
      <div
        className={`mx-auto flex max-w-xl flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
            : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800/50'
        } ${disabled || isLoading || pendingFiles.length ? 'opacity-60' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
          id={inputId}
          disabled={disabled || isLoading || !engine || pendingFiles.length > 0}
        />

        <button
          onClick={() => document.getElementById(inputId)?.click()}
          disabled={disabled || isLoading || !engine || pendingFiles.length > 0}
          className={`inline-flex cursor-pointer items-center gap-3 rounded-full bg-gradient-to-r ${gradientColor} px-8 py-4 text-base font-medium text-white transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Upload className="h-5 w-5" />
          {isLoading ? 'Loading...' : buttonText}
        </button>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          or drag & drop {multiple ? 'PDF files' : 'a PDF file'} here
        </p>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {helperText}
        </p>
        {!engine && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Initializing PDF engine...
          </p>
        )}
      </div>

      {/* Staged list */}
      {stagedFiles.length > 0 && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} ready
              to process
            </h4>
            <button
              onClick={clearStage}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {stagedFiles.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => removeFromStage(item.id)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  aria-label="Remove file"
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={() => startProcessing()}
            disabled={!engine || isLoading || pendingFiles.length > 0}
            className={`mt-4 w-full rounded-md bg-gradient-to-r ${gradientColor} px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isLoading
              ? 'Processing...'
              : `Process ${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}
