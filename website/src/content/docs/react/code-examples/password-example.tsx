'use client'

import { useState, useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react'
import {
  ViewportPluginPackage,
  Viewport,
} from '@embedpdf/plugin-viewport/react'
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react'
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react'
import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/react'
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react'
import { PdfErrorCode } from '@embedpdf/models'
import { DocumentState } from '@embedpdf/core'
import {
  Loader2,
  Lock,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  FileText,
} from 'lucide-react'

interface PasswordPromptProps {
  documentState: DocumentState
}

function PasswordPrompt({ documentState }: PasswordPromptProps) {
  const { provides } = useDocumentManagerCapability()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  if (!documentState) return null

  const { name, errorCode, passwordProvided } = documentState

  const isPasswordError = errorCode === PdfErrorCode.Password
  const isPasswordRequired = isPasswordError && !passwordProvided
  const isPasswordIncorrect = isPasswordError && passwordProvided

  // Generic error state
  if (!isPasswordError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            Error loading document
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {documentState.error || 'An unknown error occurred'}
          </p>
          {errorCode && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              Error code: {errorCode}
            </p>
          )}
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close Document
          </button>
        </div>
      </div>
    )
  }

  const handleRetry = () => {
    if (!provides || !password.trim()) return
    setIsRetrying(true)

    const task = provides.retryDocument(documentState.id, { password })
    task.wait(
      () => {
        setPassword('')
        setIsRetrying(false)
      },
      (error) => {
        console.error('Retry failed:', error)
        setIsRetrying(false)
      },
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Password Required
              </h3>
              {name && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                  <FileText size={12} />
                  {name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isPasswordRequired &&
              'This document is protected. Enter the password to view it.'}
            {isPasswordIncorrect && 'Incorrect password. Please try again.'}
          </p>

          {/* Password Input */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  !isRetrying &&
                  password.trim() &&
                  handleRetry()
                }
                disabled={isRetrying}
                placeholder="Enter password"
                className={`block w-full rounded-md border bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 ${
                  isPasswordIncorrect
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-gray-300 dark:border-gray-600'
                } `}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {isPasswordIncorrect && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={14} />
              <span>The password you entered is incorrect</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50">
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleRetry}
            disabled={isRetrying || !password.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetrying ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Opening...
              </>
            ) : (
              'Unlock'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          { url: 'https://www.embedpdf.com/demo_protected.pdf' },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
    ],
    [],
  )

  if (isLoading || !engine) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading PDF Engine...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ pluginsReady, activeDocumentId }) => (
        <>
          {pluginsReady ? (
            activeDocumentId && (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <DocumentContent documentId={activeDocumentId}>
                  {({
                    documentState,
                    isLoading: docLoading,
                    isError,
                    isLoaded,
                  }) => (
                    <>
                      {docLoading && (
                        <div className="flex h-[400px] items-center justify-center sm:h-[500px]">
                          <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-sm">Loading document...</span>
                          </div>
                        </div>
                      )}
                      {isError && (
                        <div className="h-[400px] bg-gray-50 sm:h-[500px] dark:bg-gray-900/50">
                          <PasswordPrompt documentState={documentState} />
                        </div>
                      )}
                      {isLoaded && (
                        <div className="relative h-[400px] sm:h-[500px]">
                          <Viewport
                            documentId={activeDocumentId}
                            className="absolute inset-0 bg-[#e5e7eb]"
                          >
                            <Scroller
                              documentId={activeDocumentId}
                              renderPage={({ width, height, pageIndex }) => (
                                <div
                                  style={{
                                    width,
                                    height,
                                    position: 'relative',
                                  }}
                                >
                                  <RenderLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  />
                                  <TilingLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                  />
                                </div>
                              )}
                            />
                          </Viewport>
                        </div>
                      )}
                    </>
                  )}
                </DocumentContent>
              </div>
            )
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="flex h-[400px] items-center justify-center">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Initializing plugins...</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </EmbedPDF>
  )
}
