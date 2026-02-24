<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import {
    MarqueeCapture,
    useCapture,
    type CaptureAreaEvent,
  } from '@embedpdf/plugin-capture/svelte';
  import { Camera, Download } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const capture = useCapture(() => documentId);
  let captureResult = $state<CaptureAreaEvent | null>(null);
  let imageUrl = $state<string | null>(null);

  let unsubscribeCapture: (() => void) | undefined;

  onMount(() => {
    if (!capture.provides) return;
    unsubscribeCapture = capture.provides.onCaptureArea((result) => {
      captureResult = result;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(result.blob);
    });
  });

  onDestroy(() => {
    unsubscribeCapture?.();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  });

  const downloadImage = () => {
    if (!imageUrl || !captureResult) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `capture-page-${captureResult.pageIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  <div
    class="flex items-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <button
      onclick={() => capture.provides?.toggleMarqueeCapture()}
      class={[
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-all',
        capture.state.isMarqueeCaptureActive
          ? 'bg-blue-500 text-white ring-1 ring-blue-600'
          : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
      ].join(' ')}
    >
      <Camera size={16} />
      {capture.state.isMarqueeCaptureActive ? 'Cancel' : 'Capture Area'}
    </button>
    {#if capture.state.isMarqueeCaptureActive}
      <span class="text-xs text-gray-600 dark:text-gray-300">
        Click and drag to select an area
      </span>
    {/if}
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
        <MarqueeCapture {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>

  <!-- Capture Result -->
  {#if !captureResult || !imageUrl}
    <div
      class="border-t border-gray-300 bg-gray-50 px-4 py-6 dark:border-gray-700 dark:bg-gray-900/50"
    >
      <div class="flex flex-col items-center justify-center text-center">
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
        >
          <Camera size={20} class="text-gray-400" />
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Click "Capture Area" and drag to select a region
        </p>
      </div>
    </div>
  {:else}
    <div class="border-t border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">Captured Image</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Page {captureResult.pageIndex + 1} · {captureResult.scale}x resolution
          </p>
        </div>
        <button
          onclick={downloadImage}
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <Download size={14} />
          Download
        </button>
      </div>
      <div class="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
        <div
          class="flex items-center justify-center p-4"
          style="
            background-image:
              linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
              linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
              linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
            background-size: 16px 16px;
            background-position:
              0 0,
              0 8px,
              8px -8px,
              -8px 0px;
            background-color: #f3f4f6;
          "
        >
          <img
            src={imageUrl}
            alt="Captured area"
            class="h-auto max-w-full rounded shadow-lg"
            style="
              box-shadow:
                0 4px 12px rgba(0, 0, 0, 0.15),
                0 0 0 1px rgba(0, 0, 0, 0.05);
            "
          />
        </div>
      </div>
    </div>
  {/if}
</div>
