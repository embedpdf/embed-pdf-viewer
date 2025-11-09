<script lang="ts">
  import type { SearchResultState } from '@embedpdf/plugin-search';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useSearchCapability } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';

  interface SearchLayerProps extends HTMLAttributes<HTMLDivElement> {
    documentId: string;
    pageIndex: number;
    scale?: number;
    highlightColor?: string;
    activeHighlightColor?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    highlightColor = '#FFFF00',
    activeHighlightColor = '#FFBF00',
    ...divProps
  }: SearchLayerProps = $props();

  const { provides: searchProvides } = useSearchCapability();
  const documentState = useDocumentState(documentId);

  let searchResultState = $state<SearchResultState | null>(null);

  const scope = $derived(searchProvides?.forDocument(documentId) ?? null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    if (!scope) {
      searchResultState = null;
      return;
    }

    // Set initial state
    const currentState = scope.getState();
    searchResultState = {
      results: currentState.results,
      activeResultIndex: currentState.activeResultIndex,
      showAllResults: currentState.showAllResults,
      active: currentState.active,
    };

    // Subscribe to changes
    return scope.onSearchResultStateChange((state) => {
      searchResultState = state;
    });
  });

  // Filter results for current page while preserving original indices
  const pageResults = $derived(
    searchResultState
      ? searchResultState.results
          .map((result, originalIndex) => ({ result, originalIndex }))
          .filter(({ result }) => result.pageIndex === pageIndex)
      : [],
  );

  // Decide which results to show
  const resultsToShow = $derived(
    searchResultState
      ? pageResults.filter(
          ({ originalIndex }) =>
            searchResultState!.showAllResults ||
            originalIndex === searchResultState!.activeResultIndex,
        )
      : [],
  );
</script>

{#if searchResultState && searchResultState.active}
  <div style:pointer-events="none" {...divProps}>
    {#each resultsToShow as { result, originalIndex }, idx (`result-${idx}`)}
      {#each result.rects as rect, rectIdx (`rect-${idx}-${rectIdx}`)}
        <div
          style:position="absolute"
          style:top="{rect.origin.y * actualScale}px"
          style:left="{rect.origin.x * actualScale}px"
          style:width="{rect.size.width * actualScale}px"
          style:height="{rect.size.height * actualScale}px"
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
