<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { usePrint } from '@embedpdf/plugin-print/svelte';
  import { Loader2, Printer } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const print = usePrint(() => documentId);
  let isPrinting = $state(false);

  const handlePrint = () => {
    if (!print.provides || isPrinting) return;
    isPrinting = true;
    const printTask = print.provides.print();
    printTask.wait(
      () => {
        isPrinting = false;
      },
      () => {
        isPrinting = false;
      },
    );
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  <div
    class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <button
      onclick={handlePrint}
      disabled={!print.provides || isPrinting}
      class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if isPrinting}
        <Loader2 size={16} class="animate-spin" />
      {:else}
        <Printer size={16} />
      {/if}
      {isPrinting ? 'Preparing...' : 'Print Document'}
    </button>
    {#if !isPrinting}
      <span class="text-xs text-gray-600 dark:text-gray-300"> Opens your system print dialog </span>
    {/if}
    {#if isPrinting}
      <span class="animate-pulse text-xs text-blue-600 dark:text-blue-400">
        Rendering pages for print...
      </span>
    {/if}
  </div>

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
