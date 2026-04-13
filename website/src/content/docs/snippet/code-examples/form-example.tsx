'use client'
import {
  PDFViewer,
  PDFViewerRef,
  FormPlugin,
  type FormFieldInfo,
} from '@embedpdf/react-pdf-viewer'
import { useEffect, useRef, useState } from 'react'

interface FormExampleProps {
  themePreference?: 'light' | 'dark'
}

const documentId = 'form-doc'

export default function FormExample({
  themePreference = 'light',
}: FormExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [fields, setFields] = useState<FormFieldInfo[]>([])
  const [changeCount, setChangeCount] = useState(0)

  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []

    viewerRef.current?.registry?.then((registry) => {
      if (cancelled) return

      const formPlugin = registry.getPlugin<FormPlugin>('form')?.provides()
      const formScope = formPlugin?.forDocument(documentId)

      if (!formScope) return

      const syncValues = () => {
        if (!cancelled) {
          setFormValues(formScope.getFormValues())
        }
      }

      setFields(formScope.getFormFields())
      syncValues()

      cleanups.push(
        formScope.onFormReady((nextFields) => {
          if (!cancelled) {
            setFields(nextFields)
            syncValues()
          }
        }),
      )

      cleanups.push(
        formScope.onFieldValueChange(() => {
          if (!cancelled) {
            syncValues()
            setChangeCount((count) => count + 1)
          }
        }),
      )
    })

    return () => {
      cancelled = true
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  const filledFieldCount = Object.values(formValues).filter(
    (value) => value !== '' && value !== 'Off',
  ).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[500px] overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
          <PDFViewer
            ref={viewerRef}
            config={{
              theme: { preference: themePreference },
              documentManager: {
                initialDocuments: [
                  {
                    url: '/form.pdf',
                    documentId,
                  },
                ],
              },
              export: {
                defaultFileName: 'filled-form.pdf',
              },
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Form State
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Fill the PDF on the left to watch the values update live.
            </p>
          </div>

          <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-gray-800">
            <div className="px-4 py-3">
              <div className="text-gray-500 dark:text-gray-400">Fields</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {fields.length}
              </div>
            </div>
            <div className="border-x border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="text-gray-500 dark:text-gray-400">Filled</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {filledFieldCount}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-gray-500 dark:text-gray-400">Changes</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {changeCount}
              </div>
            </div>
          </div>

          <div className="max-h-[340px] overflow-auto p-4">
            {Object.keys(formValues).length > 0 ? (
              <pre className="text-xs text-gray-800 dark:text-gray-300">
                {JSON.stringify(formValues, null, 2)}
              </pre>
            ) : (
              <p className="text-sm italic text-gray-400 dark:text-gray-500">
                Waiting for form fields...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
