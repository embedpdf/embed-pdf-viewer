<script lang="ts">
  import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';
  import type { HTMLImgAttributes } from 'svelte/elements';

  interface Props extends HTMLImgAttributes {
    /**
     * The ID of the document that this thumbnail belongs to
     */
    documentId: string;
    meta: ThumbMeta;
  }

  const { documentId, meta, ...imgProps }: Props = $props();

  const thumbnailCapability = useThumbnailCapability();
  const thumbnailPlugin = useThumbnailPlugin();

  let url = $state<string | undefined>(undefined);
  let urlRef: string | null = null;
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

  // Render thumbnail for this specific document
  $effect(() => {
    // Track refreshTick so effect re-runs on refresh
    const _tick = refreshTick;

    if (!thumbnailCapability.provides) return;

    const scope = thumbnailCapability.provides.forDocument(documentId);
    const task = scope.renderThumb(meta.pageIndex, window.devicePixelRatio);

    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      url = objectUrl;
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

  const handleImageLoad = () => {
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  };
</script>

{#if url}
  <img src={url} onload={handleImageLoad} {...imgProps} alt="PDF thumbnail" />
{/if}
