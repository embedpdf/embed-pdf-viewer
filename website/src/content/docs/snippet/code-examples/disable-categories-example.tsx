'use client'
import {
  CommandsPlugin,
  PDFViewer,
  PDFViewerRef,
  UIPlugin,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect } from 'react'

interface DisableCategoriesExampleProps {
  themePreference?: 'light' | 'dark'
}

export default function DisableCategoriesExample({
  themePreference = 'light',
}: DisableCategoriesExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [disabledCategories, setDisabledCategories] = useState<string[]>([])

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Update plugins when disabledCategories changes
  useEffect(() => {
    if (!viewerRef.current?.container) return

    const updateCategories = async () => {
      const registry = await viewerRef.current!.container!.registry

      const commands = registry
        .getPlugin<CommandsPlugin>('commands')
        ?.provides()
      if (commands) {
        commands.setDisabledCategories(disabledCategories)
      }

      const ui = registry.getPlugin<UIPlugin>('ui')?.provides()
      if (ui) {
        ui.setDisabledCategories(disabledCategories)
      }
    }

    updateCategories()
  }, [disabledCategories])

  const categories = [
    { id: 'annotation', label: 'Annotations' },
    { id: 'redaction', label: 'Redaction' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'document-print', label: 'Print' },
    { id: 'document-export', label: 'Export' },
    { id: 'panel', label: 'Sidebars' },
  ]

  const toggleCategory = (categoryId: string) => {
    setDisabledCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">
          Disable Categories
        </h4>
        <div className="flex flex-wrap gap-4">
          {categories.map((category) => (
            <label
              key={category.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                type="checkbox"
                checked={disabledCategories.includes(category.id)}
                onChange={() => toggleCategory(category.id)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {category.label}
            </label>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          Selected:{' '}
          {disabledCategories.length > 0
            ? disabledCategories.join(', ')
            : '(none)'}
        </div>
      </div>

      {/* Viewer Container */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            src: 'https://snippet.embedpdf.com/ebook.pdf',
            theme: { preference: themePreference },
            disabledCategories: disabledCategories,
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
