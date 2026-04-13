'use client'

import { useState } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  AnnotationLayer,
  AnnotationPluginPackage,
} from '@embedpdf/plugin-annotation/react'
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
} from '@embedpdf/plugin-selection/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react'
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import {
  SignaturePluginPackage,
  SignatureMode,
  useSignatureEntries,
  useActivePlacement,
  SignatureDrawPad,
  SignatureTypePad,
  useSignatureUpload,
  type SignatureFieldDefinition,
} from '@embedpdf/plugin-signature/react'
import { Loader2, PenTool, Type, Upload, Trash2, X } from 'lucide-react'

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(AnnotationPluginPackage),
  createPluginRegistration(SignaturePluginPackage, {
    mode: SignatureMode.SignatureOnly,
    defaultSize: { width: 150, height: 50 },
  }),
]

function SignatureSidebar({ documentId }: { documentId: string }) {
  const { entries, provides: signatureCapability } = useSignatureEntries()
  const activePlacement = useActivePlacement(documentId)
  const [creationMode, setCreationMode] = useState<'draw' | 'type' | null>(null)

  // Hold the temporary result from the pads
  const [tempSignature, setTempSignature] =
    useState<SignatureFieldDefinition | null>(null)

  // Upload Hook
  const { openFilePicker, inputRef, handleFileInputChange } =
    useSignatureUpload({
      onResult: (result) => {
        if (result && signatureCapability) {
          signatureCapability.addEntry({ signature: result })
        }
      },
    })

  const handleSaveTemp = () => {
    if (tempSignature && signatureCapability) {
      signatureCapability.addEntry({ signature: tempSignature })
      setCreationMode(null)
      setTempSignature(null)
    }
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    signatureCapability?.removeEntry(id)
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 lg:w-[300px]">
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          My Signatures
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Create a signature and click it to place on the document.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setCreationMode('draw')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <PenTool size={14} /> Draw
          </button>
          <button
            onClick={() => setCreationMode('type')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <Type size={14} /> Type
          </button>
          <button
            onClick={openFilePicker}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <Upload size={14} /> Image
          </button>
          <input
            type="file"
            ref={inputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileInputChange(e.nativeEvent)}
          />
        </div>
      </div>

      {creationMode && (
        <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-gray-500">
              New Signature
            </span>
            <button onClick={() => setCreationMode(null)}>
              <X size={14} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          <div className="relative h-[120px] w-full rounded-md border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
            {creationMode === 'draw' && (
              <SignatureDrawPad
                onResult={setTempSignature}
                strokeColor="blue"
              />
            )}
            {creationMode === 'type' && (
              <SignatureTypePad onResult={setTempSignature} color="blue" />
            )}
          </div>

          <button
            disabled={!tempSignature}
            onClick={handleSaveTemp}
            className="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save Signature
          </button>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.map((entry) => {
          const isActive = activePlacement?.entryId === entry.id

          return (
            <div
              key={entry.id}
              onClick={() => {
                const scope = signatureCapability?.forDocument(documentId)
                if (isActive) {
                  scope?.deactivatePlacement()
                } else {
                  scope?.activateSignaturePlacement(entry.id)
                }
              }}
              className={`relative cursor-pointer rounded-lg border p-2 transition-all ${
                isActive
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <img
                src={entry.signature.previewDataUrl}
                alt="Signature preview"
                className="h-[60px] w-full object-contain"
              />
              <button
                onClick={(e) => handleDelete(e, entry.id)}
                className="absolute right-1 top-1 p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
        {entries.length === 0 && !creationMode && (
          <div className="py-8 text-center text-sm text-gray-400">
            No signatures yet.
          </div>
        )}
      </div>
    </aside>
  )
}

export const SignatureViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading PDF Engine...</span>
        </div>
      </div>
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId && (
          <DocumentContent documentId={activeDocumentId}>
            {({ isLoaded }) =>
              isLoaded && (
                <div
                  className="flex h-[500px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                  style={{ userSelect: 'none' }}
                >
                  <SignatureSidebar documentId={activeDocumentId} />

                  <div className="relative flex-1">
                    <Viewport
                      documentId={activeDocumentId}
                      className="absolute inset-0 bg-gray-200 dark:bg-gray-800"
                    >
                      <Scroller
                        documentId={activeDocumentId}
                        renderPage={({ pageIndex }) => (
                          <PagePointerProvider
                            documentId={activeDocumentId}
                            pageIndex={pageIndex}
                          >
                            <RenderLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                              style={{ pointerEvents: 'none' }}
                            />
                            <SelectionLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                            {/* Signatures are rendered through the AnnotationLayer */}
                            <AnnotationLayer
                              documentId={activeDocumentId}
                              pageIndex={pageIndex}
                            />
                          </PagePointerProvider>
                        )}
                      />
                    </Viewport>
                  </div>
                </div>
              )
            }
          </DocumentContent>
        )
      }
    </EmbedPDF>
  )
}
