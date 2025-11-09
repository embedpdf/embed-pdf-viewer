<script lang="ts">
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useRenderCapability } from '../hooks';

  interface RenderLayerProps extends Omit<HTMLImgAttributes, 'style'> {
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
  const documentState = useDocumentState(documentId);

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;

  // Track page refreshes from core
  const refreshVersion = $derived(documentState.current?.pageRefreshVersions?.[pageIndex] ?? 0);

  // Resolve actual scale / dpr (overrides win, otherwise follow document state)
  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const actualDpr = $derived(dprOverride !== undefined ? dprOverride : window.devicePixelRatio);

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
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      }
      imageUrl = null;
      return;
    }

    const scoped = capability.forDocument(docId);

    const task = scoped.renderPage({
      pageIndex: page,
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);

      // Revoke previous URL if it existed
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
      }

      urlRef = url;
      imageUrl = url;
    }, ignore);

    return () => {
      // Cleanup for this render run
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
        imageUrl = null;
      } else {
        // If render not finished, abort task
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  });

  function handleImageLoad() {
    // Once image is loaded, we can drop the objectURL reference
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
    style={`width: 100%; height: 100%; ${propsStyle ?? ''}`}
    {...attrs}
    class={propsClass}
    alt=""
  />
{/if}
