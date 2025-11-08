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

  const capture = useCapture();

  let captureResult = $state<CaptureAreaEvent | null>(null);
  let imageUrl = $state<string | null>(null);
  let unsubscribeCapture: (() => void) | undefined;

  onMount(() => {
    if (!capture) return;
    unsubscribeCapture = capture.provides?.onCaptureArea((result) => {
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

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <PagePointerProvider
    pageIndex={page.pageIndex}
    pageWidth={page.width}
    pageHeight={page.height}
    rotation={page.rotation}
    scale={page.scale}
  >
    <RenderLayer pageIndex={page.pageIndex} />
    <MarqueeCapture pageIndex={page.pageIndex} scale={page.scale} />
  </PagePointerProvider>
{/snippet}

<div style="height: 500px; display: flex; flex-direction: column">
  <div
    class="mb-4 mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
  >
    <button
      onclick={() => capture.provides?.toggleMarqueeCapture()}
      class={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
        capture.isMarqueeCaptureActive ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
      }`}
    >
      {capture.isMarqueeCaptureActive ? 'Cancel Capture' : 'Capture Area'}
    </button>
  </div>
  <div class="flex-grow" style="position: relative; overflow: hidden">
    <Viewport
      style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #f1f3f5"
    >
      <Scroller {RenderPageSnippet} />
    </Viewport>
  </div>
</div>

{#if !captureResult || !imageUrl}
  <div class="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
    <p class="text-sm text-gray-500">
      Click "Capture Area" and drag a rectangle on the PDF to create a snapshot.
    </p>
  </div>
{:else}
  <div class="mt-4 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
    <h3 class="text-md font-medium text-gray-800">Capture Result</h3>
    <p class="text-sm text-gray-500">
      Captured from page {captureResult.pageIndex + 1} at {captureResult.scale}x resolution.
    </p>
    <img
      src={imageUrl}
      alt="Captured area from PDF"
      class="mt-2 max-w-full rounded border border-gray-200"
    />
    <button
      onclick={downloadImage}
      class="mt-3 rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-600"
    >
      Download Image
    </button>
  </div>
{/if}
