'use client'
import { I18nPlugin, PDFViewer, PDFViewerRef } from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

const locales = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Dutch' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'zh-CN', name: 'Chinese' },
]

interface I18nExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function I18nExample({
  themePreference = 'light',
}: I18nExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [currentLocale, setCurrentLocale] = useState('en')

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Effect to sync the dropdown with the viewer's internal state
  // This is useful if the viewer changes locale automatically (e.g. browser preference)
  useEffect(() => {
    const syncLocale = async () => {
      const registry = await viewerRef.current?.registry
      const i18n = registry?.getPlugin<I18nPlugin>('i18n')?.provides()

      if (i18n) {
        // Listen for internal changes
        return i18n.onLocaleChange((event) => {
          setCurrentLocale(event.currentLocale)
        })
      }
    }

    syncLocale()
  }, [])

  const handleLocaleChange = async (newLocale: string) => {
    setCurrentLocale(newLocale)

    // Get the plugin instance and change locale
    const registry = await viewerRef.current?.registry
    const i18n = registry?.getPlugin<I18nPlugin>('i18n')?.provides()

    if (i18n) {
      i18n.setLocale(newLocale)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Language:
        </label>
        <div className="relative">
          <select
            value={currentLocale}
            onChange={(e) => handleLocaleChange(e.target.value)}
            className="cursor-pointer appearance-none rounded-md border-0 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
          >
            {locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-300"
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Changing language updates all tooltips, menus, and labels instantly.
        </span>
      </div>

      {/* Viewer Container */}
      <div className="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            src: 'https://snippet.embedpdf.com/ebook.pdf',
            theme: { preference: themePreference },
            // Set the initial locale in config
            i18n: {
              defaultLocale: 'en',
              // Use built-in translations for en, nl, de, fr
              // or provide custom translation objects here
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
