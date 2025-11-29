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

interface PasswordPromptProps {
  documentState: DocumentState
}

function PasswordPrompt({ documentState }: PasswordPromptProps) {
  const { provides } = useDocumentManagerCapability()
  const [password, setPassword] = useState('')
  const [isRetrying, setIsRetrying] = useState(false)

  if (!documentState) return null

  const { name, errorCode, passwordProvided } = documentState

  const isPasswordError = errorCode === PdfErrorCode.Password
  const isPasswordRequired = isPasswordError && !passwordProvided
  const isPasswordIncorrect = isPasswordError && passwordProvided

  if (!isPasswordError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg bg-red-50 p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-red-900">
            Error loading document
          </h3>
          <p className="mt-2 text-sm text-red-700">
            {documentState.error || 'An unknown error occurred'}
          </p>
          {errorCode && (
            <p className="mt-1 text-xs text-red-600">Error Code: {errorCode}</p>
          )}
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            className="mt-4 rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
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
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Password Required
            </h3>
            {name && <p className="mt-1 text-sm text-gray-600">{name}</p>}
          </div>
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm text-amber-800">
          {isPasswordRequired &&
            'This document is password protected. Please enter the password to open it.'}
          {isPasswordIncorrect &&
            'The password you entered was incorrect. Please try again.'}
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              !isRetrying &&
              password.trim() &&
              handleRetry()
            }
            disabled={isRetrying}
            placeholder="Enter document password"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>

        {isPasswordIncorrect && (
          <div className="mt-3 rounded-md bg-amber-800 p-3">
            <p className="text-sm text-white">
              Incorrect password. Please check and try again.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleRetry}
            disabled={isRetrying || !password.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isRetrying ? 'Opening...' : 'Open'}
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
    return <div>Loading PDF Engine...</div>
  }

  return (
    <div
      style={{
        height: '500px',
        display: 'flex',
        flexDirection: 'column',
        marginTop: '10px',
      }}
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ pluginsReady, activeDocumentId }) => (
          <>
            {pluginsReady ? (
              activeDocumentId && (
                <DocumentContent documentId={activeDocumentId}>
                  {({
                    documentState,
                    isLoading: docLoading,
                    isError,
                    isLoaded,
                  }) => (
                    <>
                      {docLoading && (
                        <div className="flex h-full items-center justify-center">
                          <div>Loading document...</div>
                        </div>
                      )}
                      {isError && (
                        <PasswordPrompt documentState={documentState} />
                      )}
                      {isLoaded && (
                        <div className="flex-1 overflow-hidden">
                          <Viewport
                            documentId={activeDocumentId}
                            style={{
                              backgroundColor: '#f1f3f5',
                              height: '100%',
                            }}
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
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                <div>Initializing plugins...</div>
              </div>
            )}
          </>
        )}
      </EmbedPDF>
    </div>
  )
}
