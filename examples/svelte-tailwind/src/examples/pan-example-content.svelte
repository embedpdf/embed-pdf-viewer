<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { usePan } from '@embedpdf/plugin-pan/svelte';
  import { Hand } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const pan = usePan(() => documentId);
</script>

<div
  class="select-none overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  {#if pan.provides}
    <div
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        onclick={() => pan.provides?.togglePan()}
        class={[
          'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-all',
          pan.isPanning
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
        ].join(' ')}
        title="Toggle Pan Tool"
      >
        <Hand size={16} />
        {pan.isPanning ? 'Pan Mode On' : 'Pan Mode'}
      </button>
      <span class="text-xs text-gray-600 dark:text-gray-300">
        {pan.isPanning ? 'Click and drag to pan the document' : 'Click to enable pan mode'}
      </span>
    </div>
  {/if}

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
        <RenderLayer
          {documentId}
          pageIndex={page.pageIndex}
          scale={1}
          class="pointer-events-none"
        />
      </div>
    {/snippet}
    <GlobalPointerProvider {documentId}>
      <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </GlobalPointerProvider>
  </div>
</div>
