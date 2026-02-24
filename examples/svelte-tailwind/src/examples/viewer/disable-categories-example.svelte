<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type CommandsPlugin,
    type UIPlugin,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let registry = $state<PluginRegistry | null>(null);
  let disabledCategories = $state<string[]>([]);

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (r: PluginRegistry) => {
    registry = r;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  $effect(() => {
    if (!registry) return;

    const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides();
    if (commands) {
      commands.setDisabledCategories(disabledCategories);
    }

    const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
    if (ui) {
      ui.setDisabledCategories(disabledCategories);
    }
  });

  const categories = [
    { id: 'annotation', label: 'Annotations' },
    { id: 'redaction', label: 'Redaction' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'document-print', label: 'Print' },
    { id: 'document-export', label: 'Export' },
    { id: 'panel', label: 'Sidebars' },
  ];

  const toggleCategory = (categoryId: string) => {
    if (disabledCategories.includes(categoryId)) {
      disabledCategories = disabledCategories.filter((id) => id !== categoryId);
    } else {
      disabledCategories = [...disabledCategories, categoryId];
    }
  };
</script>

<div class="flex flex-col gap-4">
  <!-- Controls -->
  <div
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <h4 class="font-medium text-gray-900 dark:text-gray-100">Disable Categories</h4>
    <div class="flex flex-wrap gap-4">
      {#each categories as category (category.id)}
        <label
          class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            checked={disabledCategories.includes(category.id)}
            onchange={() => toggleCategory(category.id)}
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {category.label}
        </label>
      {/each}
    </div>
    <div class="text-xs text-gray-500">
      Selected: {disabledCategories.length > 0 ? disabledCategories.join(', ') : '(none)'}
    </div>
  </div>

  <!-- Viewer Container -->
  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: themePreference },
        disabledCategories: disabledCategories,
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>
