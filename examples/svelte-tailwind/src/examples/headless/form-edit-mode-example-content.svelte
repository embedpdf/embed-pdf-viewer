<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { AnnotationLayer, LockModeType, useAnnotation } from '@embedpdf/plugin-annotation/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { Loader2, Lock, LockOpen, ZoomIn, ZoomOut } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  const fillModeLock = {
    type: LockModeType.Include,
    categories: ['form'],
  };

  let { documentId }: Props = $props();

  const annotation = useAnnotation(() => documentId);
  const zoom = useZoom(() => documentId);

  const fillMode = $derived(
    annotation.state.locked.type === LockModeType.Include &&
      annotation.state.locked.categories?.includes('form'),
  );

  function toggleMode() {
    annotation.provides?.setLocked(fillMode ? { type: LockModeType.None } : fillModeLock);
  }
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-2">
      <span
        class={[
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          fillMode
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        ].join(' ')}
      >
        {#if fillMode}
          <Lock size={14} />
          Fill Mode
        {:else}
          <LockOpen size={14} />
          Design Mode
        {/if}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => zoom.provides?.zoomOut()}
          disabled={!zoom.provides}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>

        <button
          type="button"
          onclick={() => zoom.provides?.zoomIn()}
          disabled={!zoom.provides}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <button
        type="button"
        onclick={toggleMode}
        disabled={!annotation.provides}
        class="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if fillMode}
          <LockOpen size={16} />
          Switch to Design Mode
        {:else}
          <Lock size={16} />
          Switch to Fill Mode
        {/if}
      </button>
    </div>
  </div>

  <div class="relative h-[420px] sm:h-[550px]" style="user-select: none">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer {documentId} pageIndex={page.pageIndex} style="pointer-events: none;" />
        <SelectionLayer {documentId} pageIndex={page.pageIndex} />
        <AnnotationLayer {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}

    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
