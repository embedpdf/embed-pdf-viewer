<!-- Every match with the words around it. Clicking one makes it the active match and scrolls to it. -->
<script lang="ts">
  import { useSearch, useSearchHits, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const hits = useSearchHits();
  const activeHitIndex = useSearchState((state) => state.activeHitIndex);
</script>

<ol class="results">
  {#each hits.current as hit, index (`${hit.page.objectNumber}:${hit.start}`)}
    <li>
      <button
        type="button"
        class="result"
        aria-current={index === activeHitIndex.current}
        onclick={() => search.goToHit(hit)}
      >
        <span class="result-page">Page {hit.pageIndex + 1}</span>
        <!-- A match has no snippet when the user may search but not copy text. -->
        {#if hit.snippet}
          <span class="result-text">
            …{hit.snippet.before}<mark>{hit.snippet.match}</mark>{hit.snippet.after}…
          </span>
        {/if}
      </button>
    </li>
  {/each}
</ol>
