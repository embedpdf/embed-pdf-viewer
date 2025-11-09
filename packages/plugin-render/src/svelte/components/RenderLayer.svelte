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
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    dpr: dprOverride,
    class: propsClass,
    ...props
  }: RenderLayerProps = $props();

  const { provides: renderProvides } = useRenderCapability();
  const documentState = useDocumentState(documentId);

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;

  // Get refresh version from core state
  const refreshVersion = $derived(documentState.current?.pageRefreshVersions?.[pageIndex] ?? 0);

  // Determine actual render options: use overrides if provided, otherwise fall back to document state
  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const actualDpr = $derived(dprOverride !== undefined ? dprOverride : window.devicePixelRatio);

  // Render whenever inputs change (documentId, pageIndex, actualScale, actualDpr, renderProvides, refreshVersion)
  $effect(() => {
    if (!renderProvides) return;

    const task = renderProvides.forDocument(documentId).renderPage({
      pageIndex,
      options: {
        scaleFactor: actualScale,
        dpr: actualDpr,
      },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
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
