'use client'
import {
  CommandsPlugin,
  PDFViewer,
  PDFViewerRef,
  UIPlugin,
  ToolbarItem,
  GroupItem,
  MenuItem,
} from '@embedpdf/react-pdf-viewer'
import { useRef, useState, useEffect, useCallback } from 'react'

interface UICustomizationExampleProps {
  themePreference?: 'light' | 'dark'
}

// Type guard to check if an item is a GroupItem
function isGroupItem(item: ToolbarItem): item is GroupItem {
  return item.type === 'group'
}

export default function UICustomizationExample({
  themePreference = 'light',
}: UICustomizationExampleProps) {
  const viewerRef = useRef<PDFViewerRef>(null)
  const [isReady, setIsReady] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  // Update theme when preference changes
  useEffect(() => {
    viewerRef.current?.container?.setTheme({ preference: themePreference })
  }, [themePreference])

  // Setup custom commands and UI when viewer is ready
  const handleReady = useCallback(async () => {
    const container = viewerRef.current?.container
    if (!container) return

    const registry = await container.registry

    const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides()
    const ui = registry.getPlugin<UIPlugin>('ui')?.provides()

    if (!commands || !ui) return

    // ─────────────────────────────────────────────────────────
    // 1. Register custom icons (stroke-based Tabler icons)
    // ─────────────────────────────────────────────────────────
    container.registerIcons({
      customSmiley: {
        viewBox: '0 0 24 24',
        paths: [
          {
            d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
            stroke: 'currentColor',
            fill: 'none',
          },
          { d: 'M9 10l.01 0', stroke: 'currentColor', fill: 'none' },
          { d: 'M15 10l.01 0', stroke: 'currentColor', fill: 'none' },
          {
            d: 'M9.5 15a3.5 3.5 0 0 0 5 0',
            stroke: 'currentColor',
            fill: 'none',
          },
        ],
      },
      customStar: {
        viewBox: '0 0 24 24',
        paths: [
          {
            d: 'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z',
            stroke: 'currentColor',
            fill: 'none',
          },
        ],
      },
    })

    // ─────────────────────────────────────────────────────────
    // 2. Register custom commands
    // ─────────────────────────────────────────────────────────
    commands.registerCommand({
      id: 'custom.smiley',
      label: 'Say Hello',
      icon: 'customSmiley',
      action: () => {
        setLastAction('Hello! 👋')
        setTimeout(() => setLastAction(null), 2000)
      },
    })

    commands.registerCommand({
      id: 'custom.star',
      label: 'Add to Favorites',
      icon: 'customStar',
      action: () => {
        setLastAction('Added to favorites! ⭐')
        setTimeout(() => setLastAction(null), 2000)
      },
    })

    // ─────────────────────────────────────────────────────────
    // 3. Modify the UI: Replace comment button with smiley
    // ─────────────────────────────────────────────────────────
    const currentSchema = ui.getSchema()
    const mainToolbar = currentSchema.toolbars['main-toolbar']

    if (mainToolbar) {
      // Clone items with proper typing using structuredClone
      const items: ToolbarItem[] = structuredClone(mainToolbar.items)

      // Find the right-group using type guard
      const rightGroup = items.find(
        (item): item is GroupItem =>
          isGroupItem(item) && item.id === 'right-group',
      )

      if (rightGroup) {
        // Find and replace the comment button with our smiley button
        const commentIndex = rightGroup.items.findIndex(
          (item) => item.id === 'comment-button',
        )

        if (commentIndex !== -1) {
          rightGroup.items[commentIndex] = {
            type: 'command-button',
            id: 'smiley-button',
            commandId: 'custom.smiley',
            variant: 'icon',
          }
        }
      }

      ui.mergeSchema({
        toolbars: {
          'main-toolbar': {
            ...mainToolbar,
            items,
          },
        },
      })
    }

    // ─────────────────────────────────────────────────────────
    // 4. Add star command to the document menu
    // ─────────────────────────────────────────────────────────
    const documentMenu = currentSchema.menus['document-menu']

    if (documentMenu) {
      const menuItems: MenuItem[] = [
        ...documentMenu.items,
        { type: 'divider', id: 'custom-divider' },
        { type: 'command', id: 'star-menu-item', commandId: 'custom.star' },
      ]

      ui.mergeSchema({
        menus: {
          'document-menu': {
            ...documentMenu,
            items: menuItems,
          },
        },
      })
    }

    setIsReady(true)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Status indicator */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`}
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {isReady ? 'UI customized!' : 'Loading...'}
          </span>
        </div>

        {lastAction && (
          <div className="animate-pulse rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            {lastAction}
          </div>
        )}

        {isReady && (
          <div className="ml-auto text-xs text-gray-400">
            😊 replaced comment button • ⭐ added to document menu
          </div>
        )}
      </div>

      {/* Viewer Container */}
      <div className="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600">
        <PDFViewer
          ref={viewerRef}
          config={{
            src: 'https://snippet.embedpdf.com/ebook.pdf',
            theme: { preference: themePreference },
          }}
          style={{ width: '100%', height: '100%' }}
          onReady={handleReady}
        />
      </div>
    </div>
  )
}
