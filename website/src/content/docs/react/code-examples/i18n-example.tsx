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
import {
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Globe,
  ChevronDown,
} from 'lucide-react'

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

function LanguageSwitcher() {
  const { provides } = useI18nCapability()
  const { translate } = useTranslations()
  const currentLocale = provides?.getLocale() ?? 'en'
  const availableLocales = provides?.getAvailableLocales() ?? []

  return (
    <div className="flex items-center gap-2">
      <Globe size={14} className="text-gray-500 dark:text-gray-400" />
      <span className="tracking-wide hidden text-xs font-medium uppercase text-gray-500 sm:inline dark:text-gray-400">
        {translate('toolbar.language')}
      </span>
      <div className="relative">
        <select
          value={currentLocale}
          onChange={(e) => provides?.setLocale(e.target.value)}
          className="cursor-pointer appearance-none rounded-md border-0 bg-gray-100 py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
        />
      </div>
    </div>
  )
}

function ZoomToolbar({ documentId }: { documentId: string }) {
  const { translate } = useTranslations(documentId)
  const { provides: zoom, state } = useZoom(documentId)

  if (!zoom) return null

  const zoomPercentage = Math.round((state?.currentZoomLevel ?? 1) * 100)

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={zoom.zoomOut}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title={translate('zoom.out')}
      >
        <ZoomOut size={16} />
      </button>

      <div className="min-w-[56px] rounded-md bg-gray-100 px-2 py-1 text-center dark:bg-gray-800">
        <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
          {zoomPercentage}%
        </span>
      </div>

      <button
        onClick={zoom.zoomIn}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title={translate('zoom.in')}
      >
        <ZoomIn size={16} />
      </button>

      <button
        onClick={() => zoom.requestZoom(ZoomMode.FitPage)}
        className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title={translate('zoom.fitPage')}
      >
        <RotateCcw size={14} />
        <span className="hidden sm:inline">{translate('zoom.fitPage')}</span>
      </button>
    </div>
  )
}

function LoadingMessage({ documentId }: { documentId: string }) {
  const { translate } = useTranslations(documentId)
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{translate('document.loading')}</span>
      </div>
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
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <LanguageSwitcher />
                  <ZoomToolbar documentId={activeDocumentId} />
                </div>

                {/* PDF Viewer Area */}
                <DocumentContent documentId={activeDocumentId}>
                  {({ isLoading: docLoading, isLoaded }) => (
                    <>
                      {docLoading && (
                        <div className="h-[400px] sm:h-[500px]">
                          <LoadingMessage documentId={activeDocumentId} />
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
