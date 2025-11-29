'use client'

import { useState, useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  DocumentManagerPluginPackage,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/react'
import {
  ViewportPluginPackage,
  Viewport,
} from '@embedpdf/plugin-viewport/react'
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react'
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react'
import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/react'
import {
  ZoomPluginPackage,
  ZoomMode,
  useZoom,
  ZOOM_PLUGIN_ID,
} from '@embedpdf/plugin-zoom/react'
import {
  I18nPluginPackage,
  Locale,
  ParamResolvers,
  useTranslations,
  useI18nCapability,
} from '@embedpdf/plugin-i18n/react'
import { GlobalStoreState } from '@embedpdf/core'

// Define translations
const englishLocale: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    zoom: {
      in: 'Zoom In',
      out: 'Zoom Out',
      fitPage: 'Fit to Page',
      level: 'Zoom Level ({level}%)',
    },
    document: {
      title: 'PDF Viewer',
      loading: 'Loading document...',
    },
    toolbar: {
      language: 'Language',
    },
  },
}

const spanishLocale: Locale = {
  code: 'es',
  name: 'Español',
  translations: {
    zoom: {
      in: 'Acercar',
      out: 'Alejar',
      fitPage: 'Ajustar a la página',
      level: 'Nivel de zoom ({level}%)',
    },
    document: {
      title: 'Visor de PDF',
      loading: 'Cargando documento...',
    },
    toolbar: {
      language: 'Idioma',
    },
  },
}

const germanLocale: Locale = {
  code: 'de',
  name: 'Deutsch',
  translations: {
    zoom: {
      in: 'Vergrößern',
      out: 'Verkleinern',
      fitPage: 'An Seite anpassen',
      level: 'Zoomstufe ({level}%)',
    },
    document: {
      title: 'PDF-Viewer',
      loading: 'Dokument wird geladen...',
    },
    toolbar: {
      language: 'Sprache',
    },
  },
}

// Define param resolvers
type State = GlobalStoreState<{
  [ZOOM_PLUGIN_ID]: any
}>

const paramResolvers: ParamResolvers<State> = {
  'zoom.level': ({ state, documentId }) => {
    const zoomState = documentId
      ? state.plugins[ZOOM_PLUGIN_ID]?.documents[documentId]
      : null
    const zoomLevel = zoomState?.currentZoomLevel ?? 1
    return {
      level: Math.round(zoomLevel * 100),
    }
  },
}

function ZoomToolbar({ documentId }: { documentId: string }) {
  const { translate } = useTranslations(documentId)
  const { provides: zoom } = useZoom(documentId)

  if (!zoom) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <span className="text-sm font-medium text-gray-700">
        {translate('zoom.level')}
      </span>
      <button
        onClick={zoom.zoomOut}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
      >
        {translate('zoom.out')}
      </button>
      <button
        onClick={zoom.zoomIn}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
      >
        {translate('zoom.in')}
      </button>
      <button
        onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
      >
        {translate('zoom.fitPage')}
      </button>
    </div>
  )
}

function LanguageSwitcher() {
  const { provides } = useI18nCapability()
  const { translate } = useTranslations()
  const currentLocale = provides?.getLocale() ?? 'en'
  const availableLocales = provides?.getAvailableLocales() ?? []

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">
        {translate('toolbar.language')}:
      </span>
      <select
        value={currentLocale}
        onChange={(e) => provides?.setLocale(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
      >
        {availableLocales.map((code) => {
          const localeInfo = provides?.getLocaleInfo(code)
          return (
            <option key={code} value={code}>
              {localeInfo?.name ?? code}
            </option>
          )
        })}
      </select>
    </div>
  )
}

function LoadingMessage({ documentId }: { documentId: string }) {
  const { translate } = useTranslations(documentId)
  return (
    <div className="flex h-full items-center justify-center">
      <div>{translate('document.loading')}</div>
    </div>
  )
}

export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(I18nPluginPackage, {
        defaultLocale: 'en',
        locales: [englishLocale, spanishLocale, germanLocale],
        paramResolvers,
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
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
                    <LanguageSwitcher />
                    <ZoomToolbar documentId={activeDocumentId} />
                  </div>
                  <DocumentContent documentId={activeDocumentId}>
                    {({ isLoading: docLoading, isLoaded }) => (
                      <>
                        {docLoading && (
                          <LoadingMessage documentId={activeDocumentId} />
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
                </div>
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
