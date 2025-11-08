<script lang="ts">
  import type { SearchResultState } from '@embedpdf/plugin-search';
  import { useSearchCapability } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    pageIndex: number;
    scale: number;
    highlightColor?: string;
    activeHighlightColor?: string;
  }

  const {
    pageIndex,
    scale,
    highlightColor = '#FFFF00',
    activeHighlightColor = '#FFBF00',
    ...divProps
  }: Props = $props();

  const searchCapability = useSearchCapability();
  let searchResultState = $state<SearchResultState | null>(null);

  $effect(() => {
    if (!searchCapability.provides) return;
    return searchCapability.provides.onSearchResultStateChange((state) => {
      searchResultState = state;
    });
  });

  const pageResults = $derived(
    searchResultState
      ? searchResultState.results
          .map((result, originalIndex) => ({ result, originalIndex }))
          .filter(({ result }) => result.pageIndex === pageIndex)
      : [],
  );
</script>

{#if searchResultState}
  <div {...divProps}>
    {#each pageResults as { result, originalIndex }}
      {#each result.rects as rect}
        <div
          style:position="absolute"
          style:top="{rect.origin.y * scale}px"
          style:left="{rect.origin.x * scale}px"
          style:width="{rect.size.width * scale}px"
          style:height="{rect.size.height * scale}px"
          style:background-color={originalIndex === searchResultState.activeResultIndex
            ? activeHighlightColor
            : highlightColor}
          style:mix-blend-mode="multiply"
          style:transform="scale(1.02)"
          style:transform-origin="center"
          style:transition="opacity .3s ease-in-out"
          style:opacity="1"
        ></div>
      {/each}
    {/each}
  </div>
{/if}
