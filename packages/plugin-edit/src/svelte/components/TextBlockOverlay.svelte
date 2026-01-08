<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { ignore, PdfErrorCode, type PdfTextBlock, type Position } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useEditCapability } from '../hooks/use-edit.svelte';

  interface TextBlockOverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
    documentId: string;
    pageIndex: number;
    blockIndex: number;
    block: PdfTextBlock;
    isSelected: boolean;
    offset: Position | null;
    scale?: number;
    class?: string;
    style?: string;
    onselect?: () => void;
  }

  const allProps: TextBlockOverlayProps = $props();

  let {
    documentId,
    pageIndex,
    blockIndex,
    block,
    isSelected,
    offset,
    scale: scaleOverride,
    class: propsClass,
    style: propsStyle,
    onselect,
    ...attrs
  } = allProps;

  const editCapability = useEditCapability();
  const documentState = useDocumentState(() => documentId);

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const position = $derived(() => {
    const baseX = block.inkBounds.origin.x * actualScale;
    const baseY = block.inkBounds.origin.y * actualScale;
    return {
      left: baseX + (offset?.x ?? 0) * actualScale,
      top: baseY + (offset?.y ?? 0) * actualScale,
      width: block.inkBounds.size.width * actualScale,
      height: block.inkBounds.size.height * actualScale,
    };
  });

  $effect(() => {
    const capability = editCapability.provides;
    const docId = documentId;
    const scale = actualScale;
    const page = pageIndex;
    const idx = blockIndex;

    if (!capability || !docId) {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      }
      imageUrl = null;
      return;
    }

    const scope = capability.forDocument(docId);
    const task = scope.renderTextBlock(page, { blockIndex: idx, scale });

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
          message: 'canceled text block render task',
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

  function handleClick() {
    onselect?.();
  }
</script>

<div
  {...attrs}
  onclick={handleClick}
  class={propsClass}
  style={`
    position: absolute;
    left: ${position().left}px;
    top: ${position().top}px;
    width: ${position().width}px;
    height: ${position().height}px;
    cursor: pointer;
    outline: ${isSelected ? '2px solid #2196F3' : 'none'};
    outline-offset: 2px;
    ${propsStyle ?? ''}
  `}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  {#if imageUrl}
    <img
      src={imageUrl}
      onload={handleImageLoad}
      style="width: 100%; height: 100%; pointer-events: none;"
      alt=""
    />
  {/if}
</div>
