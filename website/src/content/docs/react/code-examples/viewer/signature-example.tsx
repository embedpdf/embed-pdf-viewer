'use client'
import {
  PDFViewer,
  PDFViewerRef,
  SignaturePlugin,
  type SignatureCapability,
  serializeEntries,
  deserializeEntries,
  SignatureMode,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Save, Upload, Trash2, HardDrive } from 'lucide-react'

const STORAGE_KEY = 'embedpdf-signatures'

interface SignatureExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function SignatureExample({
  themePreference = 'light',
}: SignatureExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [signatureApi, setSignatureApi] = useState<SignatureCapability | null>(
    null,
  )
  const [entryCount, setEntryCount] = useState(0)
  const [autoSave, setAutoSave] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [storedCount, setStoredCount] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as unknown[]).length : 0
    } catch {
      return 0
    }
  })

  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let cleanupEntries: (() => void) | undefined

    const setup = async () => {
      const registry = await viewer.registry
      const api = registry?.getPlugin<SignaturePlugin>('signature')?.provides()
      if (!api) return

      setSignatureApi(api)

      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          const entries = deserializeEntries(JSON.parse(raw))
          api.loadEntries(entries)
          setStatus(
            `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''} from storage`,
          )
        } catch {
          setStatus('Failed to load saved signatures')
        }
      }

      setEntryCount(api.getEntries().length)

      cleanupEntries = api.onEntriesChange((entries) => {
        setEntryCount(entries.length)
      })
    }

    setup()

    return () => {
      cleanupEntries?.()
    }
  }, [])

  useEffect(() => {
    if (!signatureApi || !autoSave) return

    return signatureApi.onEntriesChange((entries) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(serializeEntries(entries)),
      )
      setStoredCount(entries.length)
      setStatus(
        `Auto-saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`,
      )
    })
  }, [signatureApi, autoSave])

  const handleSave = useCallback(() => {
    if (!signatureApi) return
    const entries = signatureApi.exportEntries()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)))
    setStoredCount(entries.length)
    setStatus(
      `Saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`,
    )
  }, [signatureApi])

  const handleLoad = useCallback(() => {
    if (!signatureApi) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      setStatus('No saved signatures found')
      return
    }
    try {
      const entries = deserializeEntries(JSON.parse(raw))
      signatureApi.loadEntries(entries)
      setStatus(
        `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''}`,
      )
    } catch {
      setStatus('Failed to load signatures')
    }
  }, [signatureApi])

  const handleClearStorage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setStoredCount(0)
    setStatus('Storage cleared')
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tracking-wide text-xs font-medium uppercase text-gray-600 dark:text-gray-300">
            Persistence
          </span>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSave}
              disabled={entryCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={14} />
              Save ({entryCount})
            </button>
            <button
              onClick={handleLoad}
              disabled={storedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={14} />
              Load{storedCount > 0 ? ` (${storedCount})` : ''}
            </button>
            <button
              onClick={handleClearStorage}
              disabled={storedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
              Clear Storage
            </button>
          </div>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
              className="accent-emerald-500"
            />
            Auto-save
          </label>

          {status && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {status}
            </span>
          )}
        </div>
        {storedCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <HardDrive size={12} />
            {storedCount} signature{storedCount !== 1 ? 's' : ''} in
            localStorage
          </div>
        )}
      </div>

      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            theme: { preference: themePreference },
            documentManager: {
              initialDocuments: [
                {
                  url: 'https://snippet.embedpdf.com/ebook.pdf',
                  documentId: 'signature-doc',
                },
              ],
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
