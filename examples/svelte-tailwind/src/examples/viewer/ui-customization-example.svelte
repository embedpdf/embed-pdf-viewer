<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type CommandsPlugin,
    type UIPlugin,
    type ToolbarItem,
    type GroupItem,
    type MenuItem,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let isReady = $state(false);
  let lastAction = $state<string | null>(null);

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  // Type guard to check if an item is a GroupItem
  function isGroupItem(item: ToolbarItem): item is GroupItem {
    return item.type === 'group';
  }

  const handleReady = (registry: PluginRegistry) => {
    if (!container) return;

    const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides();
    const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

    if (!commands || !ui) return;

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
    });

    // ─────────────────────────────────────────────────────────
    // 2. Register custom commands
    // ─────────────────────────────────────────────────────────
    commands.registerCommand({
      id: 'custom.smiley',
      label: 'Say Hello',
      icon: 'customSmiley',
      action: () => {
        lastAction = 'Hello! 👋';
        setTimeout(() => (lastAction = null), 2000);
      },
    });

    commands.registerCommand({
      id: 'custom.star',
      label: 'Add to Favorites',
      icon: 'customStar',
      action: () => {
        lastAction = 'Added to favorites! ⭐';
        setTimeout(() => (lastAction = null), 2000);
      },
    });

    // ─────────────────────────────────────────────────────────
    // 3. Modify the UI: Replace comment button with smiley
    // ─────────────────────────────────────────────────────────
    const currentSchema = ui.getSchema();
    const mainToolbar = currentSchema.toolbars['main-toolbar'];

    if (mainToolbar) {
      const items: ToolbarItem[] = structuredClone(mainToolbar.items);

      const rightGroup = items.find(
        (item): item is GroupItem => isGroupItem(item) && item.id === 'right-group',
      );

      if (rightGroup) {
        const commentIndex = rightGroup.items.findIndex((item) => item.id === 'comment-button');

        if (commentIndex !== -1) {
          rightGroup.items[commentIndex] = {
            type: 'command-button',
            id: 'smiley-button',
            commandId: 'custom.smiley',
            variant: 'icon',
          };
        }
      }

      ui.mergeSchema({
        toolbars: {
          'main-toolbar': {
            ...mainToolbar,
            items,
          },
        },
      });
    }

    // ─────────────────────────────────────────────────────────
    // 4. Add star command to the document menu
    // ─────────────────────────────────────────────────────────
    const documentMenu = currentSchema.menus['document-menu'];

    if (documentMenu) {
      const menuItems: MenuItem[] = [
        ...documentMenu.items,
        { type: 'divider', id: 'custom-divider' },
        { type: 'command', id: 'star-menu-item', commandId: 'custom.star' },
      ];

      ui.mergeSchema({
        menus: {
          'document-menu': {
            ...documentMenu,
            items: menuItems,
          },
        },
      });
    }

    isReady = true;
  };
</script>

<div class="flex flex-col gap-4">
  <!-- Status indicator -->
  <div
    class="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-2">
      <span class="inline-block h-2 w-2 rounded-full {isReady ? 'bg-green-500' : 'bg-yellow-500'}"
      ></span>
      <span class="text-sm text-gray-600 dark:text-gray-300">
        {isReady ? 'UI customized!' : 'Loading...'}
      </span>
    </div>

    {#if lastAction}
      <div
        class="animate-pulse rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
      >
        {lastAction}
      </div>
    {/if}

    {#if isReady}
      <div class="ml-auto text-xs text-gray-400">
        😊 replaced comment button • ⭐ added to document menu
      </div>
    {/if}
  </div>

  <!-- Viewer Container -->
  <div
    class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: themePreference },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>
