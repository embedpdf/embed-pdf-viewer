<script lang="ts">
  import type { HTMLCanvasAttributes } from 'svelte/elements';
  import { ignore, PdfErrorCode} from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useRenderCapability } from '../hooks';
  import { onDestroy } from 'svelte';

  interface RenderLayerProps extends Omit<HTMLCanvasAttributes, 'style'> {
    /**
     * The ID of the document to render from
     */
    documentId: string;
    /**
     * The page index to render (0-based)
     */
    pageIndex: number;
    /**
     * Optional scale override. If not provided, uses document's current scale.
     */
    scale?: number;
    /**
     * Optional device pixel ratio override. If not provided, uses window.devicePixelRatio.
     */
    dpr?: number;
    class?: string;
    style?: string;
  }

  // Single allowed $props() call
  const allProps: RenderLayerProps = $props();

  // Keep the rest reactive (Svelte will wire these to prop updates)
  let {
    documentId,
    scale: scaleOverride,
    dpr: dprOverride,
    class: propsClass,
    style: propsStyle,
    pageIndex,
    ...attrs
  } = allProps;

  // Local non-reactive page index that only updates on actual change
  let localPageIndex = $state(pageIndex);

  // Watcher effect: only update localPageIndex if prop actually changes
  $effect(() => {
    if (pageIndex !== localPageIndex) {
      localPageIndex = pageIndex;
    }
  });

  const renderCapability = useRenderCapability();

  // Make document state follow the (reactive) documentId
  const documentState = useDocumentState(() => documentId);

  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let currentBitmap: ImageBitmap | null = null;

  // Track page refreshes from core
  const refreshVersion = $derived(documentState.current?.pageRefreshVersions?.[pageIndex] ?? 0);

  // Resolve actual scale / dpr (overrides win, otherwise follow document state)
  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const actualDpr = $derived(dprOverride !== undefined ? dprOverride : window.devicePixelRatio);

  function paintBitmap(bitmap: ImageBitmap) {
    if (!canvasEl) return;
    try {
      canvasEl.width = bitmap.width;
      canvasEl.height = bitmap.height;
      canvasEl.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
    } catch {
      // Bitmap was detached
    }
  }

  // Effect: reruns when:
  // - documentId changes
  // - actualScale changes
  // - actualDpr changes
  // - refreshVersion changes
  // - renderCapability.provides changes
  // It does NOT track pageIndex reactively.
  $effect(() => {
    const capability = renderCapability.provides;
    const docId = documentId;
    const scale = actualScale;
    const dpr = actualDpr;
    const refresh = refreshVersion;
    const page = localPageIndex;

    if (!capability || !docId) {
      // Cleanup if no capability/doc
      if (canvasEl) {
        canvasEl.width = canvasEl.width; // clears the canvas
      }
      return;
    }

    const scoped = capability.forDocument(docId);

    const task = scoped.renderPageBitmap({
      pageIndex: page,
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    task.wait((bitmap) => {
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = bitmap;
      paintBitmap(bitmap);
      currentBitmap = null; // transferred to canvas, don't close
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
      if (currentBitmap) {
        currentBitmap.close();
        currentBitmap = null;
      }
    };
  });

  onDestroy(() => {
    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }
  });
</script>

<canvas
  bind:this={canvasEl}
  style={`width: 100%; height: 100%; ${propsStyle ?? ''}`}
  {...attrs}
  class={propsClass}
></canvas>
