<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useExportCapability } from '@embedpdf/plugin-export/svelte';

  let { documentId }: { documentId: string } = $props();

  const exportCapability = useExportCapability();
  const exportApi = $derived(exportCapability.provides?.forDocument(documentId));
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
        onclick={() => exportApi?.download()}
        disabled={!exportApi}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="Download PDF"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
    <div class="flex-grow" style="position: relative">
      <Viewport
        {documentId}
        style="
          background-color: #f1f3f5;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        "
      >
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>
