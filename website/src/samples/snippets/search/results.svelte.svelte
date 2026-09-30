<script lang="ts">
  import { useSearch, useSearchHits } from '@embedpdf/svelte/search';

  const search = useSearch();
  const hits = useSearchHits();
</script>

<ol>
  {#each hits.current as hit, index (index)}
    <li>
      <button type="button" onclick={() => search.goToHit(index)}>
        Page {hit.pageIndex + 1}: …{hit.snippet?.before}
        <mark>{hit.snippet?.match}</mark>
        {hit.snippet?.after}…
      </button>
    </li>
  {/each}
</ol>
