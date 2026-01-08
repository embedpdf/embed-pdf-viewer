<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useEditPlugin, useEditCapability } from '../hooks/use-edit.svelte';
  import type { EditPageState } from '@embedpdf/plugin-edit';
  import BackgroundLayer from './BackgroundLayer.svelte';
  import TextBlockOverlay from './TextBlockOverlay.svelte';

  interface EditLayerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
    documentId: string;
    pageIndex: number;
    scale?: number;
    rotation?: number;
    class?: string;
    style?: string;
  }

  const allProps: EditLayerProps = $props();

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    rotation: rotationOverride,
    class: propsClass,
    style: propsStyle,
    ...attrs
  } = allProps;

  const editPlugin = useEditPlugin();
  const editCapability = useEditCapability();
  const documentState = useDocumentState(() => documentId);

  let pageState = $state<EditPageState | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    const plugin = editPlugin.plugin;
    const docId = documentId;
    const page = pageIndex;

    if (!plugin || !docId) {
      pageState = null;
      return;
    }

    return plugin.registerEditOnPage({
      documentId: docId,
      pageIndex: page,
      onStateChange: (state) => {
        pageState = state;
      },
    });
  });

  function handleBlockSelect(blockIndex: number) {
    editCapability.provides?.forDocument(documentId).selectBlock(pageIndex, blockIndex);
  }
</script>

<div {...attrs} class={propsClass} style={`position: relative; ${propsStyle ?? ''}`}>
  {#if !pageState || pageState.detectionStatus !== 'detected'}
    {#if pageState?.detectionStatus === 'detecting'}
      <div
        style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #666;
          font-size: 14px;
        "
      >
        Detecting text blocks...
      </div>
    {:else if pageState?.detectionStatus === 'error'}
      <div
        style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #f44336;
          font-size: 14px;
        "
      >
        Detection failed
      </div>
    {/if}
  {:else}
    <!-- Background layer -->
    <BackgroundLayer
      {documentId}
      {pageIndex}
      scale={actualScale}
      style="position: absolute; top: 0; left: 0;"
    />

    <!-- Text block overlays -->
    {#each pageState.textBlocks as block, idx (block.index)}
      <TextBlockOverlay
        {documentId}
        {pageIndex}
        blockIndex={idx}
        {block}
        isSelected={pageState.selectedBlockIndex === idx}
        offset={pageState.blockOffsets[idx] ?? null}
        scale={actualScale}
        onselect={() => handleBlockSelect(idx)}
      />
    {/each}
  {/if}
</div>
