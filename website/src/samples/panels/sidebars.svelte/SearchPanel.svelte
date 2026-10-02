<script lang="ts">
  import { useSearch, useSearchHits } from '@embedpdf/svelte/search';
  import { useSurface } from '@embedpdf/svelte/shell';

  const panel = useSurface('search');
  const search = useSearch();
  const hits = useSearchHits();
  let text = $state('PDF');

  $effect(() => {
    void search.search({ text });
  });
</script>

{#if panel.isOpen}
  <aside class="panel" aria-label="Search">
    <header class="panel-header">
      <h3 class="panel-title">Search</h3>
      <button type="button" class="close" aria-label="Close" onclick={panel.close}>×</button>
    </header>
    <input class="field" type="search" aria-label="Search" bind:value={text} />
    <ol class="list">
      {#each hits.current as hit (`${hit.page.objectNumber}:${hit.start}`)}
        <li>
          <button type="button" class="item" onclick={() => search.goToHit(hit)}>
            <span class="item-page">Page {hit.pageIndex + 1}</span>
            {#if hit.snippet}
              <span class="item-text"
                >…{hit.snippet.before}<mark>{hit.snippet.match}</mark>{hit.snippet.after}…</span
              >
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  </aside>
{/if}
