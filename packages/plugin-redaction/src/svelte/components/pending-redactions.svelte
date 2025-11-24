<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CounterRotate } from '@embedpdf/utils/svelte';
  import { useRedactionCapability } from '../hooks/use-redaction.svelte';
  import type { RedactionItem } from '@embedpdf/plugin-redaction';
  import { Rotation } from '@embedpdf/models';
  import Highlight from './highlight.svelte';
  import type { SelectionMenuProps } from '../types';

  interface PendingRedactionsProps {
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation: Rotation;
    bboxStroke?: string;
    selectionMenu?: Snippet<[SelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale,
    bboxStroke = 'rgba(0,0,0,0.8)',
    rotation = Rotation.Degree0,
    selectionMenu,
  }: PendingRedactionsProps = $props();

  const redaction = useRedactionCapability();
  let items = $state<RedactionItem[]>([]);
  let selectedId = $state<string | null>(null);

  $effect(() => {
    if (!redaction.provides) {
      items = [];
      selectedId = null;
      return;
    }

    // Use document-scoped hooks so we only receive events for this document
    const scoped = redaction.provides.forDocument(documentId);

    // Initialize with current state
    const currentState = scoped.getState();
    items = currentState.pending[pageIndex] ?? [];
    selectedId =
      currentState.selected && currentState.selected.page === pageIndex
        ? currentState.selected.id
        : null;

    // Subscribe to future changes
    const off1 = scoped.onPendingChange((map) => {
      items = map[pageIndex] ?? [];
    });
    const off2 = scoped.onSelectedChange((sel) => {
      selectedId = sel && sel.page === pageIndex ? sel.id : null;
    });

    return () => {
      off1?.();
      off2?.();
    };
  });

  function select(e: MouseEvent | TouchEvent, id: string) {
    e.stopPropagation();
    if (!redaction.provides) return;
    redaction.provides.forDocument(documentId).selectPending(pageIndex, id);
  }
</script>

{#if items.length}
  <div style:position="absolute" style:inset="0" style:pointer-events="none">
    {#each items as it (it.id)}
      {#if it.kind === 'area'}
        {@const r = it.rect}
        <div
          style:position="absolute"
          style:left={`${r.origin.x * scale}px`}
          style:top={`${r.origin.y * scale}px`}
          style:width={`${r.size.width * scale}px`}
          style:height={`${r.size.height * scale}px`}
          style:background="transparent"
          style:outline={selectedId === it.id ? `1px solid ${bboxStroke}` : 'none'}
          style:outline-offset="2px"
          style:border="1px solid red"
          style:pointer-events="auto"
          style:cursor="pointer"
          onpointerdown={(e) => select(e, it.id)}
          ontouchstart={(e) => select(e, it.id)}
        ></div>
        <CounterRotate
          rect={{
            origin: { x: r.origin.x * scale, y: r.origin.y * scale },
            size: { width: r.size.width * scale, height: r.size.height * scale },
          }}
          {rotation}
        >
          {#snippet children({ rect, menuWrapperProps })}
            {#if selectionMenu}
              {@render selectionMenu({
                item: it,
                selected: selectedId === it.id,
                pageIndex,
                menuWrapperProps,
                rect,
              })}
            {/if}
          {/snippet}
        </CounterRotate>
      {:else}
        {@const b = it.rect}
        <div
          style:position="absolute"
          style:left={`${b.origin.x * scale}px`}
          style:top={`${b.origin.y * scale}px`}
          style:width={`${b.size.width * scale}px`}
          style:height={`${b.size.height * scale}px`}
          style:background="transparent"
          style:outline={selectedId === it.id ? `1px solid ${bboxStroke}` : 'none'}
          style:outline-offset="2px"
          style:pointer-events="auto"
          style:cursor={selectedId === it.id ? 'pointer' : 'default'}
        >
          <Highlight
            rect={b}
            rects={it.rects}
            color="transparent"
            border="1px solid red"
            {scale}
            onClick={(e) => select(e, it.id)}
          />
        </div>
        <CounterRotate
          rect={{
            origin: { x: b.origin.x * scale, y: b.origin.y * scale },
            size: { width: b.size.width * scale, height: b.size.height * scale },
          }}
          {rotation}
        >
          {#snippet children({ rect, menuWrapperProps })}
            {#if selectionMenu}
              {@render selectionMenu({
                item: it,
                selected: selectedId === it.id,
                pageIndex,
                menuWrapperProps,
                rect,
              })}
            {/if}
          {/snippet}
        </CounterRotate>
      {/if}
    {/each}
  </div>
{/if}
