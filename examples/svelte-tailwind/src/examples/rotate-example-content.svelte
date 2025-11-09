<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useRotate, Rotate } from '@embedpdf/plugin-rotate/svelte';

  let { documentId }: { documentId: string } = $props();

  const rotate = useRotate(() => documentId);
</script>

{#snippet renderPage(page: RenderPageProps)}
  <Rotate {documentId} pageIndex={page.pageIndex}>
    <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
      <RenderLayer {documentId} pageIndex={page.pageIndex} />
    </PagePointerProvider>
  </Rotate>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    {#if rotate.provides}
      <div
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-gray-600">Rotation</span>
          <div
            class="min-w-[60px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-800"
          >
            {rotate.rotation * 90}°
          </div>
        </div>
        <div class="h-6 w-px bg-gray-200"></div>
        <div class="flex items-center gap-1">
          <button
            onclick={() => rotate.provides?.rotateBackward()}
            class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
            title="Rotate Counter-Clockwise"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" />
            </svg>
          </button>
          <button
            onclick={() => rotate.provides?.rotateForward()}
            class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
            title="Rotate Clockwise"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />
            </svg>
          </button>
        </div>
      </div>
    {/if}
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
