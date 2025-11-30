<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useRotate, Rotate } from '@embedpdf/plugin-rotate/svelte';
  import { RotateCcw, RotateCw } from 'lucide-svelte';

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

<div
  class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  {#if rotate.provides}
    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Rotation
      </span>
      <div class="h-4 w-px bg-gray-200 dark:bg-gray-700"></div>

      <!-- Rotation controls -->
      <div class="flex items-center gap-1.5">
        <button
          onclick={() => rotate.provides?.rotateBackward()}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          title="Rotate Counter-Clockwise"
        >
          <RotateCcw size={16} />
        </button>

        <!-- Degree indicator -->
        <div class="min-w-[56px] rounded-md bg-gray-100 px-2 py-1 text-center dark:bg-gray-800">
          <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
            {rotate.rotation * 90}°
          </span>
        </div>

        <button
          onclick={() => rotate.provides?.rotateForward()}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          title="Rotate Clockwise"
        >
          <RotateCw size={16} />
        </button>
      </div>

      <span class="hidden text-xs text-gray-400 sm:inline dark:text-gray-500">
        Click to rotate all pages
      </span>
    </div>
  {/if}

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    <Viewport
      {documentId}
      style="
        position: absolute;
        inset: 0;
        background-color: #e5e7eb;
      "
    >
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
