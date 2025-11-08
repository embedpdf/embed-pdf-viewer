<script lang="ts">
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { ignore, type PdfDocumentObject, PdfErrorCode } from '@embedpdf/models';
  import { useRenderCapability, useRenderPlugin } from '../hooks';

  interface RenderLayerProps extends Omit<HTMLImgAttributes, 'style'> {
    pageIndex: number;
    scale?: number;
    dpr?: number;
    class?: string;
  }

  let { pageIndex, scale, dpr, class: propsClass, ...props }: RenderLayerProps = $props();

  const renderCapability = useRenderCapability();
  const renderPlugin = useRenderPlugin();

  const actualScale = $derived(scale ?? 1);

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;
  let refreshTick = $state(0);

  // Subscribe/unsubscribe whenever the plugin instance changes (not just on mount)
  $effect(() => {
    if (!renderPlugin.plugin) return; // nothing yet; try again when it appears
    return renderPlugin.plugin.onRefreshPages((pages) => {
      if (pages.includes(pageIndex)) {
        refreshTick++; // trigger a re-render
      }
    });
  });

  // Render whenever inputs change (pageIndex, scale, dpr, provides, refreshTick)
  $effect(() => {
    // Explicitly read refreshTick so the effect tracks it
    const _tick = refreshTick;

    const provides = renderCapability.provides;
    if (!provides) return;

    const task = provides.renderPage({
      pageIndex,
      options: { scaleFactor: actualScale, dpr: dpr || window.devicePixelRatio },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      // revoke any previous URL before swapping to avoid leaks
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
      }

      imageUrl = url;
      urlRef = url;
    }, ignore);

    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  });

  function handleImageLoad() {
    // Additional safety: once the image has loaded, revoke the last ref if still present
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  }
</script>

{#if imageUrl}
  <img
    src={imageUrl}
    onload={handleImageLoad}
    {...props}
    style="width: 100%; height: 100%;"
    class={propsClass}
    alt=""
  />
{/if}
