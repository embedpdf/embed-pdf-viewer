<script lang="ts">
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useEditCapability } from '../hooks/use-edit.svelte';

  interface BackgroundLayerProps extends Omit<HTMLImgAttributes, 'style'> {
    documentId: string;
    pageIndex: number;
    scale?: number;
    class?: string;
    style?: string;
  }

  const allProps: BackgroundLayerProps = $props();

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    style: propsStyle,
    ...attrs
  } = allProps;

  const editCapability = useEditCapability();
  const documentState = useDocumentState(() => documentId);

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    const capability = editCapability.provides;
    const docId = documentId;
    const scale = actualScale;
    const page = pageIndex;

    if (!capability || !docId) {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      }
      imageUrl = null;
      return;
    }

    const scope = capability.forDocument(docId);
    const task = scope.renderBackground(page, { scale });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
      }
      urlRef = url;
      imageUrl = url;
    }, ignore);

    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
        imageUrl = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled background render task',
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
    style={`width: 100%; height: 100%; pointer-events: none; ${propsStyle ?? ''}`}
    {...attrs}
    class={propsClass}
    alt=""
  />
{/if}
