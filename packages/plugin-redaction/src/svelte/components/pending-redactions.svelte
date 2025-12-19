<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Rect } from '@embedpdf/models';
  import { Rotation } from '@embedpdf/models';
  import { CounterRotate } from '@embedpdf/utils/svelte';
  import type { MenuWrapperProps, SelectionMenuPlacement } from '@embedpdf/utils/svelte';
  import type { RedactionItem } from '@embedpdf/plugin-redaction';
  import { useRedactionCapability } from '../hooks/use-redaction.svelte';
  import Highlight from './highlight.svelte';
  import type {
    RedactionSelectionContext,
    RedactionSelectionMenuRenderFn,
    RedactionSelectionMenuProps,
  } from '../types';

  interface Props {
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation?: Rotation;
    bboxStroke?: string;
    selectionMenu?: RedactionSelectionMenuRenderFn;
    selectionMenuSnippet?: Snippet<[RedactionSelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale,
    rotation = Rotation.Degree0,
    bboxStroke = 'rgba(0,0,0,0.8)',
    selectionMenu,
    selectionMenuSnippet,
  }: Props = $props();

  const redactionCapability = useRedactionCapability();

  let items = $state<RedactionItem[]>([]);
  let selectedId = $state<string | null>(null);

  $effect(() => {
    const redactionValue = redactionCapability.provides;
    if (!redactionValue) {
      items = [];
      selectedId = null;
      return;
    }

    const scoped = redactionValue.forDocument(documentId);
    const currentState = scoped.getState();
    items = currentState.pending[pageIndex] ?? [];
    selectedId = currentState.selected?.page === pageIndex ? currentState.selected.id : null;

    const off1 = scoped.onPendingChange((map) => {
      items = map[pageIndex] ?? [];
    });

    const off2 = scoped.onSelectedChange((sel) => {
      selectedId = sel?.page === pageIndex ? sel.id : null;
    });

    return () => {
      off1?.();
      off2?.();
    };
  });

  function select(e: MouseEvent | TouchEvent, id: string) {
    e.stopPropagation();
    if (!redactionCapability.provides) return;
    redactionCapability.provides.forDocument(documentId).selectPending(pageIndex, id);
  }

  function shouldShowMenu(itemId: string): boolean {
    const isSelected = selectedId === itemId;
    return isSelected && (!!selectionMenu || !!selectionMenuSnippet);
  }

  function buildContext(item: RedactionItem): RedactionSelectionContext {
    return { type: 'redaction', item, pageIndex };
  }

  const menuPlacement: SelectionMenuPlacement = {
    suggestTop: false,
    spaceAbove: 0,
    spaceBelow: 0,
  };

  function buildMenuProps(
    item: RedactionItem,
    rect: Rect,
    menuWrapperProps: MenuWrapperProps,
  ): RedactionSelectionMenuProps {
    return {
      context: buildContext(item),
      selected: selectedId === item.id,
      rect,
      placement: menuPlacement,
      menuWrapperProps,
    };
  }
</script>

{#if items.length}
  <div style="position: absolute; inset: 0; pointer-events: none;">
    {#each items as item (item.id)}
      {#if item.kind === 'area'}
        <div
          style="
            position: absolute;
            left: {item.rect.origin.x * scale}px;
            top: {item.rect.origin.y * scale}px;
            width: {item.rect.size.width * scale}px;
            height: {item.rect.size.height * scale}px;
            background: transparent;
            outline: {selectedId === item.id ? `1px solid ${bboxStroke}` : 'none'};
            outline-offset: 2px;
            border: 1px solid red;
            pointer-events: auto;
            cursor: pointer;
          "
          onpointerdown={(e) => select(e, item.id)}
          ontouchstart={(e) => select(e, item.id)}
        ></div>

        {#if shouldShowMenu(item.id)}
          <CounterRotate
            rect={{
              origin: { x: item.rect.origin.x * scale, y: item.rect.origin.y * scale },
              size: { width: item.rect.size.width * scale, height: item.rect.size.height * scale },
            }}
            {rotation}
          >
            {#snippet children({ rect, menuWrapperProps })}
              {@const menuProps = buildMenuProps(item, rect, menuWrapperProps)}
              {#if selectionMenu}
                {@const result = selectionMenu(menuProps)}
                {#if result}
                  <result.component {...result.props} />
                {/if}
              {:else if selectionMenuSnippet}
                {@render selectionMenuSnippet(menuProps)}
              {/if}
            {/snippet}
          </CounterRotate>
        {/if}
      {:else}
        <div
          style="
            position: absolute;
            left: {item.rect.origin.x * scale}px;
            top: {item.rect.origin.y * scale}px;
            width: {item.rect.size.width * scale}px;
            height: {item.rect.size.height * scale}px;
            background: transparent;
            outline: {selectedId === item.id ? `1px solid ${bboxStroke}` : 'none'};
            outline-offset: 2px;
            pointer-events: auto;
            cursor: {selectedId === item.id ? 'pointer' : 'default'};
          "
        >
          <Highlight
            rect={item.rect}
            rects={item.rects}
            color="transparent"
            border="1px solid red"
            {scale}
            onClick={(e) => select(e, item.id)}
          />
        </div>

        {#if shouldShowMenu(item.id)}
          <CounterRotate
            rect={{
              origin: { x: item.rect.origin.x * scale, y: item.rect.origin.y * scale },
              size: { width: item.rect.size.width * scale, height: item.rect.size.height * scale },
            }}
            {rotation}
          >
            {#snippet children({ rect, menuWrapperProps })}
              {@const menuProps = buildMenuProps(item, rect, menuWrapperProps)}
              {#if selectionMenu}
                {@const result = selectionMenu(menuProps)}
                {#if result}
                  <result.component {...result.props} />
                {/if}
              {:else if selectionMenuSnippet}
                {@render selectionMenuSnippet(menuProps)}
              {/if}
            {/snippet}
          </CounterRotate>
        {/if}
      {/if}
    {/each}
  </div>
{/if}
