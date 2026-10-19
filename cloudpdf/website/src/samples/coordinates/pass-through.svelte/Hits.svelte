<!-- A search hit says where it is in page coordinates; the Stage takes them as they are. -->
<script lang="ts">
  import { useSearch, useSearchHits } from '@embedpdf/svelte/search';
  import { useStage } from '@embedpdf/svelte/stage';

  const search = useSearch();
  const stage = useStage();
  const hits = useSearchHits();

  $effect(() => {
    void search.search({ text: 'PDF' });
  });
</script>

<ol class="hits">
  {#each hits.current.slice(0, 8) as hit (`${hit.page.objectNumber}:${hit.start}`)}
    {@const bounds = hit.bounds}
    {#if bounds}
      <li>
        <button
          type="button"
          class="hit"
          onclick={() => stage.reveal(hit.page, { rect: bounds, anchor: { y: 0.35 } })}
        >
          <span class="where">page {hit.pageIndex + 1}</span>
          <code class="rect">x {Math.round(bounds.x)}, y {Math.round(bounds.y)}</code>
        </button>
      </li>
    {/if}
  {/each}
</ol>
