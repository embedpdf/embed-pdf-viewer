<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer, useSearch } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';

  const search = useSearch();
</script>

<Stage class="stage">
  <RenderLayer />
  <SearchLayer onHitClick={(hit) => search.goToHit(hit)} />
</Stage>
