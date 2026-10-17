<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer, useSearch } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';
  import NextMatch from './NextMatch.svelte';

  const search = useSearch();

  // Every "PDF" in the document, and the view on the first one.
  $effect(() => {
    void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
  });
</script>

<Stage class="stage">
  <RenderLayer />
  <SearchLayer />
  {#snippet overlay()}
    <NextMatch />
  {/snippet}
</Stage>
