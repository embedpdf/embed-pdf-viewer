<script lang="ts">
  import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLCanvasElement> {
    /**
     * The ID of the document that this thumbnail belongs to
     */
    documentId: string;
    meta: ThumbMeta;
  }

  const { documentId, meta, ...canvasProps }: Props = $props();

  const thumbnailCapability = useThumbnailCapability();
  const thumbnailPlugin = useThumbnailPlugin();

  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let hasContent = $state(false);
  let refreshTick = $state(0);

  // Listen for refresh events for this specific document
  $effect(() => {
    if (!thumbnailPlugin.plugin) return;
    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);
    return scope.onRefreshPages((pages) => {
      if (pages.includes(meta.pageIndex)) {
        refreshTick = refreshTick + 1;
      }
    });
  });

  function paintBitmap(bitmap: ImageBitmap) {
    if (!canvasEl) return;
    try {
      canvasEl.width = bitmap.width;
      canvasEl.height = bitmap.height;
      canvasEl.getContext('2d')!.drawImage(bitmap, 0, 0);
      hasContent = true;
    } catch {
      // Bitmap was closed
    }
  }

  // Render thumbnail for this specific document
  $effect(() => {
    // Track refreshTick so effect re-runs on refresh
    const _tick = refreshTick;

    if (!thumbnailCapability.provides) return;

    const scope = thumbnailCapability.provides.forDocument(documentId);
    const task = scope.renderThumb(meta.pageIndex, window.devicePixelRatio);

    task.wait((bitmap) => {
      paintBitmap(bitmap);
      // Do NOT close bitmap — LRU cache owns lifecycle
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  style:visibility={hasContent ? 'visible' : 'hidden'}
  {...canvasProps}
></canvas>
