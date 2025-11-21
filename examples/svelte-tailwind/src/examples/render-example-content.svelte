<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer, useRenderCapability } from '@embedpdf/plugin-render/svelte';

  let { documentId }: { documentId: string } = $props();

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

{#snippet renderPage(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer {documentId} pageIndex={page.pageIndex} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    <div
      class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <button
        onclick={exportPageAsPng}
        disabled={!render || isExporting}
        class="rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isExporting ? 'Exporting...' : 'Export Page 1 as PNG (2x Res)'}
      </button>
    </div>
    <div class="relative flex w-full flex-1 overflow-hidden">
      <Viewport {documentId} class="flex-grow bg-gray-100">
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>
