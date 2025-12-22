<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/svelte';
  import { FileText, BookOpen, Book } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const spread = useSpread(() => documentId);

  const modes = [
    { label: 'Single', value: SpreadMode.None, icon: FileText },
    { label: 'Odd Spread', value: SpreadMode.Odd, icon: BookOpen },
    { label: 'Even Spread', value: SpreadMode.Even, icon: Book },
  ];
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  {#if spread.provides}
    <div
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Layout
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        {#each modes as mode}
          <button
            onclick={() => spread.provides?.setSpreadMode(mode.value)}
            class={[
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
              spread.spreadMode === mode.value
                ? 'bg-blue-500 text-white ring-1 ring-blue-600'
                : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
            ].join(' ')}
          >
            <mode.icon size={14} />
            <span class="hidden sm:inline">{mode.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
        <RenderLayer {documentId} pageIndex={page.pageIndex} />
      </div>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
