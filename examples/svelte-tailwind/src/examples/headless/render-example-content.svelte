<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer, useRenderCapability } from '@embedpdf/plugin-render/svelte';
  import { Loader2, Image, Download } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const renderCapability = useRenderCapability();
  const render = $derived(renderCapability.provides?.forDocument(documentId));
  let isExporting = $state(false);

  const exportPageAsPng = () => {
    if (!render || isExporting) return;
    isExporting = true;

    const renderTask = render.renderPage({
      pageIndex: 0,
      options: { scaleFactor: 2.0, withAnnotations: true, imageType: 'image/png' },
    });

    renderTask.wait(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'page-1.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        isExporting = false;
      },
      () => {
        isExporting = false;
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
      onclick={exportPageAsPng}
      disabled={!render || isExporting}
      class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if isExporting}
        <Loader2 size={16} class="animate-spin" />
      {:else}
        <Image size={16} />
      {/if}
      {isExporting ? 'Exporting...' : 'Export Page 1 as PNG'}
    </button>
    <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
      <Download size={14} />
      <span class="hidden sm:inline">Renders at 2x resolution with annotations</span>
      <span class="sm:hidden">2x resolution</span>
    </div>
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
